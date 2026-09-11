import { signPayload } from "../src/application/record-payment-callback.ts";

const [invoiceId, type = "succeeded", eventId = `evt_${crypto.randomUUID().slice(0, 8)}`] =
  Bun.argv.slice(2);
if (!invoiceId) {
  console.error("usage: bun scripts/mock-payment.ts <invoiceId> [succeeded|failed] [eventId]");
  process.exit(1);
}
const base = process.env.BASE_URL ?? "http://localhost:3000";
const rawBody = JSON.stringify({ provider_event_id: eventId, provider_invoice_id: invoiceId, type });
const res = await fetch(`${base}/payments/callback`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-signature": signPayload(rawBody) },
  body: rawBody,
});
console.log(res.status, await res.text());
