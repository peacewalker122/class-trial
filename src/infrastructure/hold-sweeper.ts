import { SQL } from "bun";
import { processRefundJob } from "../application/refund-payment.ts";
import { MockPaymentGateway } from "./mock-payment-gateway.ts";

// Seat is taken at booking time and the callback confirms synchronously.
// The worker expires stale holds and drains refund jobs.
export async function expireHolds(db: SQL): Promise<number> {
  const rows = await db`WITH expired AS (
    UPDATE bookings SET status = 'hold_expired'
    WHERE status = 'held' AND hold_expires_at <= now()
    RETURNING trial_class_id
  ) UPDATE trial_classes c SET confirmed_count = confirmed_count - (SELECT COUNT(*) FROM expired e WHERE e.trial_class_id = c.id)
  WHERE c.id IN (SELECT trial_class_id FROM expired) AND c.confirmed_count > 0 RETURNING c.id`;
  return rows.length;
}

export async function claimRefundJobs(db: SQL, limit = 10): Promise<{ outbox_event_id: string }[]> {
  const rows = await db`UPDATE outbox_jobs SET status = 'processing', attempts = attempts + 1
    WHERE outbox_event_id IN (
      SELECT outbox_event_id FROM outbox_jobs
      WHERE status = 'pending' AND available_at <= now()
      ORDER BY created_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING outbox_event_id`;
  return rows as { outbox_event_id: string }[];
}

export async function drainRefunds(db: SQL, gateway: MockPaymentGateway): Promise<number> {
  let done = 0;
  for (;;) {
    const jobs = await claimRefundJobs(db);
    if (jobs.length === 0) return done;
    for (const job of jobs) {
      try {
        await processRefundJob(db, gateway, job.outbox_event_id);
      } catch {
        await db`UPDATE outbox_jobs SET status = 'pending', available_at = now() + interval '5 seconds' WHERE outbox_event_id = ${job.outbox_event_id}`;
      }
      done++;
    }
  }
}

export function startWorker(db: SQL, gateway: MockPaymentGateway = new MockPaymentGateway(), intervalMs = 30_000): () => void {
  let stopped = false;
  (async () => {
    while (!stopped) {
      try {
        await expireHolds(db);
        await drainRefunds(db, gateway);
      } catch {
        // ponytail: swallow transient tick errors, next tick retries
      }
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, intervalMs);
      await promise;
    }
  })();
  return () => {
    stopped = true;
  };
}
