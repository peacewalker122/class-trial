# Otto Trial Booking

Bun + TypeScript + HTMX trial-class booking app. Parents book trial seats for
their children, pay through a (mocked) provider, and land on a confirmed roster.
One booking per child/class, four seats per class, only paid
bookings reach the roster, the seat is held at booking time so the loser is
rejected before paying, retries never duplicate state changes.

## Run

```sh
docker compose -f compose.yaml up -d   # postgres 17 on :5433, db `otto`
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/otto
bun scripts/db-setup.ts                # migrate + seed demo data
bun src/index.ts                       # http://localhost:3000 (PORT= to override)
```

npm-script equivalents: `bun run db:setup`, `bun run dev`, `bun run test`,
`bun run typecheck`, `bun run verify:invariants`.

Pages: `/` booking form · `/admin/roster` confirmed roster ·
`/admin/payments[?parent_id=]` payment ledger · `/healthz`.

Pay flow end to end:

```sh
# book via UI, copy the invoice id from the status card, then:
bun scripts/mock-payment.ts <invoiceId> [succeeded|failed] [eventId]
bun scripts/verify-invariants.ts
bun test
```

Callbacks are HMAC-SHA256 signed (`x-signature` over the raw body,
`PAYMENT_WEBHOOK_SECRET`, default `dev-secret` for local dev). Status cards
poll via HTMX until terminal (`confirmed`, `payment_failed`, `hold_expired`).

## Synthetic data

`bun scripts/db-setup.ts` truncates and reseeds everything (safe to rerun).
4 parents (Ana, Budi, Cici, Dewi), 6 students, 3 classes at cap 4:

| Class | Seated | Shows |
|---|---|---|
| Math Trial | 2 confirmed + 1 held | open seats, held-seat picker note, roster rows |
| Robot Trial | 1 confirmed | nearly-full class |
| Science Trial | 1 confirmed + 1 failed | roster row + failed-payment retry demo (`bk_fail`: re-book reuses it) |

## Verification

```sh
bun run typecheck            # tsc --noEmit, must be clean
bun test                     # 9 integration tests: dedupe, roster exclusion,
                             # callback idempotency, hold rejection, hold expiry,
                             # fail-releases-seat, late-callback auto-refund
bun scripts/verify-invariants.ts   # no dupes, nothing over maximum_capacity,
                             # no unpaid booking on roster, seat counts reconcile,
                             # no hold without expiry → "invariants ok"
```

Manual click-through: book from `/` → fail the invoice via `mock-payment.ts`
→ red card with Try again → retry → succeed → polls to confirmed on the roster.
Late-success-after-expiry lands in `/admin/payments` and drains as a refund.

## What was built

- Booking: parent/child/class validation, idempotent start (UNIQUE
  student+class, `ON CONFLICT DO NOTHING` + reselect so concurrent double
  starts reuse one row), seat taken immediately as `held` (10-minute expiry,
  `ClassFull` when none left), retry-after-fail/expiry resets to `held`.
- Payments: signed callback intake, append-only `payment_events` (DB trigger
  rejects UPDATE/DELETE), monotonic attempt transitions, succeeded callbacks
  confirm synchronously in the same transaction. Failed payments release
  the held seat at once.
- Hold sweeper (`hold-sweeper.ts`, 30 s tick): expires timed-out holds back
  to `hold_expired` with seat release, drains queued refunds. No allocation queue.
- UI: booking form (preloaded children, seat counts, Full badges), live status
  cards with invoice id + retry-after-fail button, roster, per-parent payment
  ledger. Every `INSERT` is console-logged (`[db-insert] <table> […]`) from a
  single proxy in `src/infrastructure/database.ts`.
- Checks: 9 integration tests (dedupe, roster exclusion, callback idempotency,
  hold rejection + expiry + fail-release + late-callback auto-refund),
  `verify-invariants.ts` (no dupes, no over-capacity, no unpaid in roster,
  seat counts reconcile against seated bookings, no hold without expiry).

## Time spent

One evening session, ~1.5 h of active build (file activity 22:23–23:40):
plan → implement (6/6 green) → review → must-fix pass (retry strand, worker
strand, double-start race, seed fidelity, scripts) → UX passes (booking page,
invoice display, payments ledger, docs). Review and verification included.

## Assumptions

- Capacity is per class (`trial_classes.maximum_capacity`, default 4), changed with a plain `UPDATE` — no schema change. The DB rejects lowering it below `confirmed_count`.
- One payment attempt chain per booking; a new attempt supersedes the old one.
- Payment is record-only: callbacks mark attempts succeeded/failed, no money moves; late success after expiry auto-queues a refund drained by the sweeper.
- Single deployment; a 30 s sweeper loop expires holds, nothing else runs in the background.
- `/admin/*` is trusted (no auth) — internal tool surface.
- Webhook secret shared out-of-band; clock skew negligible for `starts_at`.
- Refund is not cheap

## Key architecture / backend decisions

- Reserve-before-pay (holds), not optimistic confirm-then-refund: booking takes the seat immediately as `held` with a 10-minute expiry; losers get `ClassFull` before any payment page, so nobody is ever charged for a seat they don't get. Worker sweeps expired holds and failed payments release the seat at once.
- Atomic seat-taking: one conditional `UPDATE … WHERE confirmed_count < maximum_capacity`
  decides the winner; the DB `CHECK` backs it up.
- Idempotency keys everywhere: `provider_event_id` PK, `ON CONFLICT DO
  NOTHING` on booking/event writes.
- `Bun.serve` fetch router (the method/path-key router form is rejected by
  Bun 1.3.14, so plain `fetch(req)` dispatch), `Bun.SQL` pooling +
  transactions, `bun:test` only — no test framework or ORM.
- HTMX polling fragments that stop at terminal states; server-rendered admin
  pages, no client build step.

## Why holds instead of optimistic confirm-then-refund

The optimistic design (pay first, race at confirm, refund the loser) is simpler — fewer states, no sweeper, no utilization loss. We rejected it because the failure lands on the parent: they pay, then learn the seat is gone, then wait for money back. For paid trials that is the worst possible outcome, and support tickets cost more than the machinery. Holds move the race before money: instant sold-out signal, no refund path at all (true exceptions go manual). Accepted costs: held-but-unpaid seats look full (10-minute window), two extra states plus a sweeper that must stay alive, and expiry tuning (too short annoys payers, too long invites squatting). Literal pessimistic locking (holding a row lock while the user pays) was never an option — locks span milliseconds, not checkouts.

## Deliberately cut

- Auth on `/admin/*`, pagination, roster class filter.
- Value-union error contract from the plan — throws `BookingError` /
  `CallbackError` with mapped HTTP codes instead (internally consistent).
- Migration version tracking — files run in order on every setup (idempotent, no schema-migrations table).
- Log routing/alerting — insert log is `console.log` only.

## Monitor after release

- Sweeper health: oldest `held` age and sweep lag — a stalled loop shows classes as full while seats sit expired.
- Callback `4xx/5xx` rate by code (`InvalidSignature` spikes = secret or
  attacker issue), `payment_failed` rate, seat fill rate per class.

## Next with more time

1. Real PSP webhook + durable idempotency keys server-side.
2. Per-class hold windows and a waitlist for full classes.
3. Auth for `/admin/*`, per-class roster filter, pagination on ledger.
4. Read replicas / caching for roster and ledger reads.
5. Overbooking windows once caps vary by class.
