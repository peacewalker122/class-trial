import { SQL } from "bun";
import { BookingError } from "../domain/errors.ts";
import { newId } from "../domain/ids.ts";

export const HOLD_TTL_MINUTES = 10;

export interface StartBookingInput {
  parentId: string;
  studentId: string;
  trialClassId: string;
}

export interface StartBookingResult {
  bookingId: string;
  providerInvoiceId: string;
  status: string;
  reused: boolean;
}

function holdExpiry(): string {
  return new Date(Date.now() + HOLD_TTL_MINUTES * 60_000).toISOString();
}

export async function startTrialBooking(db: SQL, input: StartBookingInput): Promise<StartBookingResult> {
  return db.begin(async (tx) => {
    const parents = await tx`SELECT id FROM parents WHERE id = ${input.parentId}`;
    if (parents.length === 0) throw new BookingError("ParentNotFound");
    const students = await tx`SELECT id, parent_id FROM students WHERE id = ${input.studentId}`;
    if (students.length === 0) throw new BookingError("StudentNotFound");
    if (students[0].parent_id !== input.parentId) throw new BookingError("StudentNotOwnedByParent");
    const classes =
      await tx`SELECT id, starts_at FROM trial_classes WHERE id = ${input.trialClassId}`;
    if (classes.length === 0) throw new BookingError("TrialClassNotFound");
    if (new Date(classes[0].starts_at) <= new Date()) throw new BookingError("ClassAlreadyStarted");

    let bookingId: string;
    let reused: boolean;
    const existing =
      await tx`SELECT id, status FROM bookings WHERE student_id = ${input.studentId} AND trial_class_id = ${input.trialClassId}`;
    if (existing.length > 0) {
      bookingId = existing[0].id;
      reused = true;
    } else {
      const fresh = newId("bk");
      await tx`INSERT INTO bookings (id, student_id, trial_class_id, status, hold_expires_at) VALUES (${fresh}, ${input.studentId}, ${input.trialClassId}, 'held', ${holdExpiry()}::timestamptz) ON CONFLICT (student_id, trial_class_id) DO NOTHING`;
      const row =
        await tx`SELECT id, status FROM bookings WHERE student_id = ${input.studentId} AND trial_class_id = ${input.trialClassId}`;
      bookingId = row[0].id;
      reused = row[0].id !== fresh;
    }

    const booking = await tx`SELECT status FROM bookings WHERE id = ${bookingId}`;
    if (booking[0].status === "confirmed") {
      const last =
        await tx`SELECT provider_invoice_id FROM payment_attempts WHERE booking_id = ${bookingId} ORDER BY created_at DESC LIMIT 1`;
      return {
        bookingId,
        providerInvoiceId: last[0]?.provider_invoice_id ?? "",
        status: "confirmed",
        reused: true,
      };
    }
    const active =
      await tx`SELECT provider_invoice_id FROM payment_attempts WHERE booking_id = ${bookingId} AND status = 'created' ORDER BY created_at DESC LIMIT 1`;
    if (active.length > 0) {
      return { bookingId, providerInvoiceId: active[0].provider_invoice_id, status: booking[0].status, reused: true };
    }
    const won =
      await tx`UPDATE trial_classes SET confirmed_count = confirmed_count + 1 WHERE id = ${input.trialClassId} AND confirmed_count < maximum_capacity RETURNING id`;
    if (won.length === 0) throw new BookingError("ClassFull");
    await tx`UPDATE bookings SET status = 'held', hold_expires_at = ${holdExpiry()}::timestamptz WHERE id = ${bookingId}`;
    const attemptId = newId("pa");
    const invoiceId = `inv_${attemptId}`;
    await tx`INSERT INTO payment_attempts (id, booking_id, provider_invoice_id) VALUES (${attemptId}, ${bookingId}, ${invoiceId})`;
    return { bookingId, providerInvoiceId: invoiceId, status: "held", reused };
  });
}
