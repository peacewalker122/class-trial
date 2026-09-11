import { createHmac, timingSafeEqual } from "node:crypto";
import { SQL } from "bun";
import { CallbackError } from "../domain/errors.ts";
import type { PaymentEventType } from "../domain/payment.ts";

export function webhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-secret";
}

export function signPayload(rawBody: string, secret = webhookSecret()): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, signature: string, secret = webhookSecret()): boolean {
  const expected = signPayload(rawBody, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface RecordCallbackResult {
  duplicate: boolean;
  bookingId: string;
  refundQueued: boolean;
}

export async function recordPaymentCallback(
  db: SQL,
  rawBody: string,
  signature: string,
): Promise<RecordCallbackResult> {
  if (!verifySignature(rawBody, signature)) throw new CallbackError("InvalidSignature");
  let parsed: { provider_event_id?: string; provider_invoice_id?: string; type?: string };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new CallbackError("InvalidPayload");
  }
  const { provider_event_id: eventId, provider_invoice_id: invoiceId, type } = parsed;
  if (!eventId || !invoiceId || (type !== "succeeded" && type !== "failed")) {
    throw new CallbackError("InvalidPayload");
  }
  return recordValidatedCallback(db, eventId, invoiceId, type as PaymentEventType, parsed);
}

export async function recordValidatedCallback(
  db: SQL,
  eventId: string,
  invoiceId: string,
  type: PaymentEventType,
  payload: unknown = {},
): Promise<RecordCallbackResult> {
  return db.begin(async (tx) => {
    const attempts =
      await tx`SELECT id, booking_id, status FROM payment_attempts WHERE provider_invoice_id = ${invoiceId}`;
    if (attempts.length === 0) throw new CallbackError("UnknownInvoice");
    const attempt = attempts[0];

    const inserted =
      await tx`INSERT INTO payment_events (provider_event_id, provider_invoice_id, type, payload) VALUES (${eventId}, ${invoiceId}, ${type}, ${JSON.stringify(payload)}::jsonb) ON CONFLICT (provider_event_id) DO NOTHING RETURNING provider_event_id`;
    if (inserted.length === 0) return { duplicate: true, bookingId: attempt.booking_id, refundQueued: false };

    if (attempt.status !== "created") return { duplicate: true, bookingId: attempt.booking_id, refundQueued: false };

    if (type === "succeeded") {
      const flipped =
        await tx`UPDATE payment_attempts SET status = 'succeeded' WHERE provider_invoice_id = ${invoiceId} AND status = 'created' RETURNING id`;
      if (flipped.length === 0) return { duplicate: true, bookingId: attempt.booking_id, refundQueued: false };
      const seated =
        await tx`UPDATE bookings SET status = 'confirmed', accepted_payment_attempt_id = ${attempt.id} WHERE id = ${attempt.booking_id} AND status = 'held' RETURNING id`;
      if (seated.length === 0) {
        const refundId = `refund:${eventId}`;
        await tx`INSERT INTO outbox_events (id, type, booking_id, payload) VALUES (${refundId}, 'refund_requested', ${attempt.booking_id}, ${{ invoiceId }}::jsonb) ON CONFLICT (id) DO NOTHING`;
        await tx`INSERT INTO outbox_jobs (outbox_event_id) VALUES (${refundId}) ON CONFLICT (outbox_event_id) DO NOTHING`;
        return { duplicate: false, bookingId: attempt.booking_id, refundQueued: true };
      }
      return { duplicate: false, bookingId: attempt.booking_id, refundQueued: false };
    } else {
      await tx`UPDATE payment_attempts SET status = 'failed' WHERE provider_invoice_id = ${invoiceId} AND status = 'created'`;
      const released =
        await tx`UPDATE bookings SET status = 'payment_failed' WHERE id = ${attempt.booking_id} AND status = 'held' RETURNING trial_class_id`;
      if (released.length > 0) {
        await tx`UPDATE trial_classes SET confirmed_count = confirmed_count - 1 WHERE id = ${released[0].trial_class_id} AND confirmed_count > 0`;
      }
      return { duplicate: false, bookingId: attempt.booking_id, refundQueued: false };
    }
  });
}
