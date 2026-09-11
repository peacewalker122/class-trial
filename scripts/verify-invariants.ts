import { database } from "../src/infrastructure/database.ts";

const db = database();
const failures: string[] = [];

const dupes = await db`SELECT student_id, trial_class_id, COUNT(*) c FROM bookings GROUP BY 1, 2 HAVING COUNT(*) > 1`;
if (dupes.length > 0) failures.push(`duplicate bookings: ${JSON.stringify(dupes)}`);

const over = await db`SELECT id FROM trial_classes WHERE confirmed_count > maximum_capacity`;
if (over.length > 0) failures.push(`over capacity: ${JSON.stringify(over)}`);

const roster = await db`SELECT b.id FROM bookings b
  JOIN trial_classes c ON c.id = b.trial_class_id
  WHERE b.status = 'confirmed' AND (SELECT COUNT(*) FROM payment_attempts pa WHERE pa.booking_id = b.id AND pa.status = 'succeeded') = 0`;
if (roster.length > 0) failures.push(`unpaid in roster: ${JSON.stringify(roster)}`);

const unrefunded = await db`SELECT pa.provider_invoice_id FROM payment_attempts pa
  JOIN bookings b ON b.id = pa.booking_id
  WHERE pa.status = 'succeeded' AND b.status <> 'confirmed'
  AND NOT EXISTS (SELECT 1 FROM outbox_events oe WHERE oe.type = 'refund_requested' AND oe.payload->>'invoiceId' = pa.provider_invoice_id)`;
if (unrefunded.length > 0) failures.push(`captured without seat or refund: ${JSON.stringify(unrefunded)}`);

const counts = await db`SELECT (SELECT COUNT(*) FROM trial_classes) classes,
  (SELECT COUNT(*) FROM bookings WHERE status IN ('confirmed', 'held')) seated,
  (SELECT SUM(confirmed_count) FROM trial_classes) counted`;
console.log(JSON.stringify(counts[0]));
const sum = Number(counts[0].counted ?? 0);
if (Number(counts[0].seated) !== sum) failures.push("seated != sum(confirmed_count)");

const holdless = await db`SELECT id FROM bookings WHERE status = 'held' AND hold_expires_at IS NULL`;
if (holdless.length > 0) failures.push(`hold without expiry: ${JSON.stringify(holdless)}`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("invariants ok");
await db.close();
