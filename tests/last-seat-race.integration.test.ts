import { describe, expect, test, beforeAll, beforeEach, afterAll } from "bun:test";
import { startTrialBooking } from "../src/application/start-trial-booking.ts";
import { recordValidatedCallback } from "../src/application/record-payment-callback.ts";
import { expireHolds } from "../src/infrastructure/hold-sweeper.ts";
import { BookingError } from "../src/domain/errors.ts";
import { migrate, reset, testDb } from "./helpers.ts";

const db = testDb();
beforeAll(() => migrate(db));
beforeEach(() => reset(db));
afterAll(() => db.close());

async function raceClass(): Promise<string> {
  const classId = "c_race";
  const week = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  await db`INSERT INTO trial_classes (id, title, starts_at, maximum_capacity) VALUES (${classId}, 'Race', ${week}::timestamptz, 1) ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO parents (id, name) VALUES ('p_a', 'A'), ('p_b', 'B') ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO students (id, parent_id, name) VALUES ('s_a', 'p_a', 'A'), ('s_b', 'p_b', 'B') ON CONFLICT (id) DO NOTHING`;
  return classId;
}

describe("last seat race", () => {
  test("second booker rejected before paying; first confirms", async () => {
    const classId = await raceClass();
    const a = await startTrialBooking(db, { parentId: "p_a", studentId: "s_a", trialClassId: classId });
    expect(a.status).toBe("held");
    expect(startTrialBooking(db, { parentId: "p_b", studentId: "s_b", trialClassId: classId })).rejects.toThrow(
      BookingError,
    );

    await recordValidatedCallback(db, "evt_a", a.providerInvoiceId, "succeeded", {});
    const booking = await db`SELECT status FROM bookings WHERE id = ${a.bookingId}`;
    expect(booking[0].status).toBe("confirmed");
    const cls = await db`SELECT confirmed_count FROM trial_classes WHERE id = ${classId}`;
    expect(Number(cls[0].confirmed_count)).toBe(1);
  });

  test("expired hold frees the seat for the next booker", async () => {
    const classId = await raceClass();
    const a = await startTrialBooking(db, { parentId: "p_a", studentId: "s_a", trialClassId: classId });
    await db`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${a.bookingId}`;
    expect(await expireHolds(db)).toBe(1);

    const booking = await db`SELECT status FROM bookings WHERE id = ${a.bookingId}`;
    expect(booking[0].status).toBe("hold_expired");
    const b = await startTrialBooking(db, { parentId: "p_b", studentId: "s_b", trialClassId: classId });
    expect(b.status).toBe("held");
  });
});
