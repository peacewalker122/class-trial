import { SQL } from "bun";
import { MockPaymentGateway } from "../infrastructure/mock-payment-gateway.ts";

export async function processRefundJob(db: SQL, gateway: MockPaymentGateway, refundEventId: string): Promise<boolean> {
  const events = await db`SELECT booking_id, payload FROM outbox_events WHERE id = ${refundEventId} AND type = 'refund_requested'`;
  if (events.length === 0) {
    await db`UPDATE outbox_jobs SET status = 'done' WHERE outbox_event_id = ${refundEventId}`;
    return false;
  }
  const bookingId: string = events[0].booking_id;
  const payload: unknown = events[0].payload;
  const invoiceId =
    typeof payload === "object" && payload !== null && "invoiceId" in payload && typeof payload.invoiceId === "string"
      ? payload.invoiceId
      : undefined;
  const attempts = invoiceId
    ? await db`SELECT amount_cents FROM payment_attempts WHERE provider_invoice_id = ${invoiceId}`
    : await db`SELECT amount_cents FROM payment_attempts WHERE booking_id = ${bookingId} AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1`;
  const amount = typeof attempts[0]?.amount_cents === "number" ? attempts[0].amount_cents : 1000;

  await gateway.refund(refundEventId, amount);

  await db.begin(async (tx) => {
    const doneId = `refunded:${refundEventId}`;
    await tx`INSERT INTO outbox_events (id, type, booking_id) VALUES (${doneId}, 'refund_succeeded', ${bookingId}) ON CONFLICT (id) DO NOTHING`;
    await tx`UPDATE outbox_jobs SET status = 'done' WHERE outbox_event_id = ${refundEventId}`;
  });
  return true;
}
