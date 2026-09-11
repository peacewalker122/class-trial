import { SQL } from "bun";
import type { BookingStatus } from "../domain/booking.ts";

export interface RosterRow {
  booking_id: string;
  student_name: string;
  parent_name: string;
  class_id: string;
  class_title: string;
  created_at: string;
}

export async function getBookingStatus(
  db: SQL,
  bookingId: string,
): Promise<{ status: BookingStatus; student_id: string; trial_class_id: string } | null> {
  const rows = await db`SELECT status, student_id, trial_class_id FROM bookings WHERE id = ${bookingId}`;
  return (rows[0] as unknown as {
    status: BookingStatus;
    student_id: string;
    trial_class_id: string;
  } | undefined) ?? null;
}

export async function getConfirmedRoster(db: SQL, classId?: string): Promise<RosterRow[]> {
  const from = `FROM bookings b
    JOIN students s ON s.id = b.student_id
    JOIN parents p ON p.id = s.parent_id
    JOIN trial_classes c ON c.id = b.trial_class_id`;
  const select = `SELECT b.id AS booking_id, s.name AS student_name, p.name AS parent_name,
    c.id AS class_id, c.title AS class_title, b.created_at ${from}`;
  const rows = classId
    ? await db.unsafe(`${select} WHERE b.status = 'confirmed' AND c.id = $1 ORDER BY b.created_at ASC`, [classId])
    : await db.unsafe(`${select} WHERE b.status = 'confirmed' ORDER BY b.created_at ASC`);
  return rows as unknown as RosterRow[];
}

export async function listParents(db: SQL) {
  return db`SELECT id, name FROM parents ORDER BY name ASC`;
}
export async function listChildren(db: SQL, parentId: string) {
  return db`SELECT id, name FROM students WHERE parent_id = ${parentId} ORDER BY name ASC`;
}

export async function listTrialClasses(db: SQL) {
  return db`SELECT id, title, starts_at, maximum_capacity, confirmed_count,
    (maximum_capacity - confirmed_count) AS seats_left,
    (SELECT COUNT(*) FROM bookings b WHERE b.trial_class_id = trial_classes.id AND b.status = 'held') AS held_count
    FROM trial_classes ORDER BY starts_at ASC`;
}

export interface LedgerRow {
  provider_invoice_id: string;
  parent_name: string;
  student_name: string;
  class_title: string;
  attempt_status: string;
  event_type: string | null;
  created_at: string;
}

const LEDGER_SELECT = (where: string) => `
  SELECT pa.provider_invoice_id, p.name AS parent_name, s.name AS student_name,
    c.title AS class_title, pa.status AS attempt_status, pe.type AS event_type, pa.created_at
  FROM payment_attempts pa
  JOIN bookings b ON b.id = pa.booking_id
  JOIN students s ON s.id = b.student_id
  JOIN parents p ON p.id = s.parent_id
  JOIN trial_classes c ON c.id = b.trial_class_id
  LEFT JOIN payment_events pe ON pe.provider_invoice_id = pa.provider_invoice_id
  ${where} ORDER BY pa.created_at DESC`;

export async function getPaymentLedger(db: SQL, parentId?: string): Promise<LedgerRow[]> {
  const rows = parentId
    ? await db.unsafe(LEDGER_SELECT("WHERE p.id = $1"), [parentId])
    : await db.unsafe(LEDGER_SELECT(""));
  return rows as unknown as LedgerRow[];
}
