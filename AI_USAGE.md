# AI usage

## Tools used

Single AI coding assistant (Oh My Pi harness, `opencode-zen/muse-spark`
session) working inside a Luvus workspace checkout, with task tracking
(`plan t1` → `implement t3` → `review t4` → `fix t5`). No other AI tools.
Runtime checks: `bun test`, `tsc --noEmit`, `scripts/verify-invariants.ts`,
live `curl` smoke tests against a local server + Postgres.

## What AI was used for

- Drafting the implementation plan from the booking invariants (t1).
- Writing the full implementation: schema, application services, outbox
  worker, HTMX routes/views, seed, tests, scripts (t3).
- Reviewing the implementation against the plan as a separate pass (t4),
  which produced the 2 must-fix / 6 should-fix list.
- Applying the fixes, UX passes (booking page, invoice display, payments
  ledger), insert logging, seed/docs work, hold redesign (reserve-before-pay
  replaced the outbox allocator + refund path, later removed outright), and
  all verification in this session.

## Where AI moved faster

Boilerplate with sharp edges: the outbox claim query (`FOR UPDATE SKIP
LOCKED`), the idempotency-key layout (`alloc:` / `refund:` / `refunded:`
stable ids), and the three integration tests came out in one pass and passed
after one router-shape correction (see below). Hand-writing the same SQL +
test scaffolding would have taken materially longer.

## Where AI output was corrected or rejected

- Bun 1.3.14 rejects the method/path-key form of `Bun.serve` routing — the
  first implementation used it and failed at runtime; corrected to a plain
  `fetch(req)` dispatch after reading the runtime error.
- The review pass caught two real bugs in AI-written code: retry-after-fail
  stranded bookings (new attempt without status reset) and allocator
  exceptions stranding jobs (missing per-job catch). Both fixed at the root
  (shared functions), not per caller.
- Rejected scope expansions as over-engineering: durable PSP-side idempotency,
  value-union error-contract rewrite, roster class filter, log sink/levels.
  Each noted in code or docs as a deliberate cut with its trigger condition.
- Rejected adding test frameworks or an ORM — `bun:test` + throwaway
  `bun -e`/script proofs covered every fix; permanent tests kept only where a
  plausible bug would fail them.

## What would change about the AI workflow

Run the reviewer pass against a live database from the start (t4 did this and
it found the seed-fidelity bug that static review missed), and keep the
plan→implement→review→fix task split — the review beat re-reading my own code.
Also: verify with `curl` against the running server earlier; two bugs in this
session only showed at the HTTP layer (empty child dropdown, missing 404s from
a swallowed route handler).

## Verification of the final implementation

- `bunx tsc --noEmit`: clean. `bun test`: 6/6 pass (booking dedupe, roster
  exclusion, callback idempotency, last-seat race → confirmed + refunded).
- Throwaway proofs (deleted after): fail→rebook→succeed reaches `confirmed`;
  concurrent double-start reuses one row; failed card renders retry button and
  retry returns to polling.
- Live `curl` checks: booking form (preloaded children, seat counts),
  `POST /bookings`, `GET /bookings/:id/status`, `POST /bookings/:id/retry`
  (incl. 404s), `/admin/payments` + `?parent_id=` filter.
- `scripts/verify-invariants.ts`: `invariants ok` on the reseeded demo DB
  after every change; demo seed restored last.
