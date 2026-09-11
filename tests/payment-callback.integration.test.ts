import { describe, expect, test, beforeAll, beforeEach, afterAll } from "bun:test";
import { startTrialBooking } from "../src/application/start-trial-booking.ts";
import { recordValidatedCallback } from "../src/application/record-payment-callback.ts";
import { getConfirmedRoster } from "../src/application/queries.ts";
import { fixture, migrate, reset, testDb } from "./helpers.ts";

const db = testDb();
beforeAll(() => migrate(db));
beforeEach(() => reset(db));
afterAll(() => db.close());

describe("payment callback", () => {
  test("succeeded payment confirms via worker; retry is idempotent", async () => {
    const f = await fixture(db, "pc1");
    const started = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    await recordValidatedCallback(db, "evt_pc1", started.providerInvoiceId, "succeeded", {});
    await recordValidatedCallback(db, "evt_pc1", started.providerInvoiceId, "succeeded", {});
    const booking = await db`SELECT status FROM bookings WHERE id = ${started.bookingId}`;
    expect(booking[0].status).toBe("confirmed");
    expect(Number((await db`SELECT COUNT(*) c FROM payment_events`)[0].c)).toBe(1);
    expect((await getConfirmedRoster(db)).length).toBe(1);
  });

  test("failed payment never reaches roster", async () => {
    const f = await fixture(db, "pc2");
    const started = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    await recordValidatedCallback(db, "evt_pc2", started.providerInvoiceId, "failed", {});
    const booking = await db`SELECT status FROM bookings WHERE id = ${started.bookingId}`;
    expect(booking[0].status).toBe("payment_failed");
    expect(await getConfirmedRoster(db)).toEqual([]);
  });
  test("failed payment releases the held seat for re-booking", async () => {
    const f = await fixture(db, "pc3");
    const started = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    expect(started.status).toBe("held");
    await recordValidatedCallback(db, "evt_pc3", started.providerInvoiceId, "failed", {});
    const cls = await db`SELECT confirmed_count FROM trial_classes WHERE id = ${f.classId}`;
    expect(Number(cls[0].confirmed_count)).toBe(0);
    const retry = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    expect(retry.bookingId).toBe(started.bookingId);
    expect(retry.status).toBe("held");
  });
});
