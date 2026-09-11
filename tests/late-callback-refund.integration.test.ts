import { describe, expect, test, beforeAll, beforeEach, afterAll } from "bun:test";
import { startTrialBooking } from "../src/application/start-trial-booking.ts";
import { recordValidatedCallback } from "../src/application/record-payment-callback.ts";
import { drainRefunds, expireHolds } from "../src/infrastructure/hold-sweeper.ts";
import { MockPaymentGateway } from "../src/infrastructure/mock-payment-gateway.ts";
import { getConfirmedRoster } from "../src/application/queries.ts";
import { fixture, migrate, reset, testDb } from "./helpers.ts";

const db = testDb();
beforeAll(() => migrate(db));
beforeEach(() => reset(db));
afterAll(() => db.close());

describe("late success callback after hold expiry", () => {
  test("freed seat goes to second booking; late money refunded once", async () => {
    const f = await fixture(db, "lr1");
    await db`INSERT INTO parents (id, name) VALUES ('p_lr1b', 'B') ON CONFLICT (id) DO NOTHING`;
    await db`INSERT INTO students (id, parent_id, name) VALUES ('s_lr1b', 'p_lr1b', 'B') ON CONFLICT (id) DO NOTHING`;

    const a = await startTrialBooking(db, { parentId: f.parentId, studentId: f.studentId, trialClassId: f.classId });
    await db`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${a.bookingId}`;
    await expireHolds(db);

    const b = await startTrialBooking(db, { parentId: "p_lr1b", studentId: "s_lr1b", trialClassId: f.classId });
    await recordValidatedCallback(db, "evt_lr1b", b.providerInvoiceId, "succeeded", {});

    const late = await recordValidatedCallback(db, "evt_lr1a", a.providerInvoiceId, "succeeded", {});
    expect(late.duplicate).toBe(false);
    expect(late.refundQueued).toBe(true);

    const replay = await recordValidatedCallback(db, "evt_lr1a", a.providerInvoiceId, "succeeded", {});
    expect(replay.duplicate).toBe(true);
    expect(replay.refundQueued).toBe(false);

    const gateway = new MockPaymentGateway();
    expect(await drainRefunds(db, gateway)).toBe(1);
    expect(await drainRefunds(db, gateway)).toBe(0);
    expect(gateway.refunded("refund:evt_lr1a")).toBe(true);

    const statuses = (await db`SELECT id, status FROM bookings ORDER BY id`) as unknown as { id: string; status: string }[];
    const byId = Object.fromEntries(statuses.map((r) => [r.id, r.status]));
    expect(byId[a.bookingId]).toBe("hold_expired");
    expect(byId[b.bookingId]).toBe("confirmed");

    const roster = await getConfirmedRoster(db);
    expect(roster.length).toBe(1);
    expect(roster[0].booking_id).toBe(b.bookingId);

    const cls = await db`SELECT confirmed_count FROM trial_classes WHERE id = ${f.classId}`;
    expect(Number(cls[0].confirmed_count)).toBe(1);

    const jobs = await db`SELECT COUNT(*) c FROM outbox_jobs WHERE status <> 'done'`;
    expect(Number(jobs[0].c)).toBe(0);
    const refunded = await db`SELECT COUNT(*) c FROM outbox_events WHERE type = 'refund_succeeded'`;
    expect(Number(refunded[0].c)).toBe(1);
  });
});
