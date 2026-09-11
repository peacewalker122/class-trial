# Rundowns — Otto trial booking

## 1. Talk script (how problems are prevented)

### Opening — what I built
I built a trial-class booking app. Parents book trial seats for their children
and pay online. Stack is Bun, TypeScript, Postgres, and HTMX — no frontend
framework, pages render on the server.

### Problems that can happen in booking
Booking has four classic problems. One: the same child gets booked twice. Two:
more students confirmed than seats — overbooking. Three: two payments arrive at
the same moment for the last seat. Four: payment fails halfway and the booking
gets stuck.

### How each is prevented
Duplicate bookings: the database has a unique rule on child plus class. Same
child and class can never have two rows. If two requests arrive together, the
loser reuses the winner's booking instead of crashing.

Overbooking: each class has a `maximum_capacity`. The seat is taken with one
conditional update — count goes up only if it is still below the cap. Two
bookers cannot both win. The database also rejects any count above the cap, so
even a bug in my code cannot overbook.

Last seat: the seat is held at booking time with a 10-minute expiry. The loser
is rejected before paying — nobody is charged for a seat they don't get.
Expired holds and failed payments release the seat automatically.

Failed payment: the booking waits for payment first and only joins the roster
after payment succeeds. If payment fails, the parent can re-book — the old
failed attempt stays as history and a new invoice is created. Retried callbacks
are idempotent, so nothing is ever counted twice.

### How I built it, step by step
First the database: tables for parents, students, classes, bookings, payment
attempts, an append-only payment event log. Rules live in
the database, not in application code. Then the booking service, then the
payment callback intake with signature check, which confirms synchronously,
then a sweeper that releases expired holds. UI last: booking form, live status cards,
roster, payment ledger.

### How I proved it works
Eight integration tests, all passing: dedupe, callback replay, hold rejection,
hold expiry, and fail-releases-seat. A script checks the invariants — no
duplicates, no over-capacity, no unpaid booking on the roster. I also tested
the real HTTP flow: book, fail the payment, press try again, succeed, and land
confirmed.

### Honest limits
Three things cut on purpose. The payment gateway is mocked, so no real money
moves. Admin pages have no login — internal use only. Capacity is one seat per
class right now; raising it is a plain data update, no code change needed.

## 2. Deck rundown — "How I proved it works" slide

I prove it in three layers: automated tests, an invariant checker, and a live
click-through. Here is each one.

Layer one, eight integration tests, all passing. Booking tests: first, booking
the same child and class twice creates only one row — the second call reuses
the first booking. Second, an unpaid booking never appears on the roster.
Third, a stranger parent booking someone else's child is rejected, and so is a
class that already started.

Callback tests: a succeeded payment confirms synchronously, and replaying
the same callback changes nothing — still one event, still confirmed. A failed
payment stays failed, releases the held seat, and never reaches the roster.

Hold tests: a second booker on a held seat is rejected before paying; an
expired hold frees the seat for the next booker.

Layer two, the invariant script. It queries the real database and fails on:
duplicate bookings, count above maximum capacity, a confirmed booking with no
succeeded payment, seat counts not reconciling against seated bookings, and
holds without expiry. After every change I run it — output is `invariants ok`.

Layer three, the live HTTP flow, which I can demo now. Book from the form,
copy the invoice from the status card, fail the payment, see the red card with
Try again, press it, succeed the new invoice, watch it poll, and land
confirmed. That path exercises every layer together: UI, callback, roster.

So: unit behavior in tests, global truth in the invariant script, user reality
in the live demo. If all three agree, I ship.

## 3. Video walkthrough script (~7 minutes)

### 0:00–0:45 — Open: what this is
This is my trial-class booking app: Bun, TypeScript, Postgres, HTMX. Parents
book trial seats, pay, land on a roster. Three guarantees: one booking per
child and class, never more seated students than capacity — currently one seat
per class — and only paid bookings reach the roster. Let me run it.

### 0:45–2:00 — Run it (type each command, show output)
podman compose -f compose.yaml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/otto
bun scripts/db-setup.ts          # → "database ready"
bun src/index.ts                 # → listening on :3000

Open localhost:3000. Book Science Trial for Cici Jr 1 — point at the seat
count, the "Seat held" card, the invoice id, the polling. Then open
/admin/roster — empty, because unpaid bookings stay off. Open /admin/payments —
the attempt is there with status created.

### 2:00–3:30 — Pay + fail + retry (browser + one command)
bun scripts/mock-payment.ts <invoiceId> failed

Red card, Try again button — click it, new invoice appears. Now succeed it:
bun scripts/mock-payment.ts <newInvoiceId> succeeded

Card polls, lands confirmed. Roster now lists the student. Ledger shows
succeeded. Note: every retry replays safely — callbacks dedupe on the event id,
and failed payments release the held seat at once.

### 3:30–5:30 — Hold contention (terminal)
bun test tests/last-seat-race.integration.test.ts

While it runs, explain: the seat is taken at booking time by one conditional
update — count increments only if below maximum_capacity. There is no lock to
hold across requests, so this scales. The second booker gets ClassFull before
any payment page. Expired holds are swept back by the sweeper. Then run the
invariant script:
bun scripts/verify-invariants.ts   # → invariants ok

It checks the whole database: no duplicates, nothing over capacity, no unpaid
booking on the roster, seat counts reconcile, no hold without expiry.

### 5:30–6:30 — Tradeoffs (talk to camera)
Three deliberate cuts. One: payment is record-only, no money moves and no
refund path — a real PSP needs durable idempotency keys and manual exception
handling. Two: no login on the admin pages — fine for a take-home,
required before release. Three: no retry budget needed — callbacks dedupe on
the event id and the sweeper is idempotent, so replays are free.
And the core tradeoff, documented in the README: I chose reserve-before-pay
(holds) over optimistic pay-then-refund — losers get an instant sold-out
instead of a charge followed by a refund, at the cost of a sweeper, two extra
states, and held seats looking full for 10 minutes. For paid trials that trade
is right; for free seats it would be overkill.

### 6:30–7:00 — Close
Eight tests green, invariants hold, full flow demoed. Capacity is a data
column, so rule changes are an UPDATE, not a migration. Thanks — links to repo
and this recording are in the submission.

Checklist before recording: podman up, db-setup fresh, invoice ids copied from
the card, race test green once already (avoid live flakes), mic check.
