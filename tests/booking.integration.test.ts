import { describe, expect, test, beforeAll, beforeEach, afterAll } from "bun:test";
import { startTrialBooking } from "../src/application/start-trial-booking.ts";
import { getConfirmedRoster } from "../src/application/queries.ts";
import { BookingError } from "../src/domain/errors.ts";
import { fixture, migrate, reset, testDb } from "./helpers.ts";

const db = testDb();
beforeAll(() => migrate(db));
beforeEach(() => reset(db));
afterAll(() => db.close());

describe("booking", () => {
  test("double booking same child/class reuses one row", async () => {
    const f = await fixture(db, "bk1");
    const first = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    const second = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    expect(second.bookingId).toBe(first.bookingId);
    expect(second.providerInvoiceId).toBe(first.providerInvoiceId);
    const rows = await db`SELECT COUNT(*) c FROM bookings WHERE student_id = ${f.studentId}`;
    expect(Number(rows[0].c)).toBe(1);
  });

  test("unpaid booking stays off roster", async () => {
    const f = await fixture(db, "bk2");
    await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    expect(await getConfirmedRoster(db)).toEqual([]);
  });

  test("wrong parent rejected, started class rejected", async () => {
    const f = await fixture(db, "bk3");
    await db`INSERT INTO parents (id, name) VALUES ('p_other', 'Other') ON CONFLICT DO NOTHING`;
    expect(startTrialBooking(db, { parentId: "p_other", studentId: f.studentId, trialClassId: f.classId })).rejects.toThrow(BookingError);
    await db`UPDATE trial_classes SET starts_at = now() - interval '1 hour' WHERE id = ${f.classId}`;
    expect(startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId })).rejects.toThrow(BookingError);
  });
});
