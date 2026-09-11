import { isTerminal } from "../domain/booking.ts";

export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script src="https://unpkg.com/htmx.org@1.9.12"></script>
<style>:root{--background:#fff;--foreground:#09090b;--muted:#f4f4f5;--muted-fg:#71717a;--border:#e4e4e7;--primary:#18181b;--radius:.625rem}*{box-sizing:border-box}html,body{height:100%}body{margin:0;min-height:100dvh;background:var(--background);color:var(--foreground);font-family:ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}.navbar{position:sticky;top:0;z-index:10;width:100%;border-bottom:1px solid var(--border);background:var(--background)}.navbar>div{width:100%;max-width:1200px;margin:0 auto;padding:.8rem 1.5rem;display:flex;gap:1.25rem;align-items:center}.navbar b{font-size:.95rem}.navbar a{color:var(--muted-fg);text-decoration:none;font-size:.875rem}.navbar a:hover{color:var(--foreground)}main{width:100%;max-width:1200px;margin:0 auto;padding:1.5rem;min-height:calc(100dvh - 57px)}h1{font-size:1.5rem;letter-spacing:-.02em;margin:0 0 1rem}.card{border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin:0 0 1rem;background:var(--background)}.card.poll{border-left:3px solid #a1a1aa}.terminal{border-color:#16a34a}.failed{border-color:#dc2626}.poll{color:var(--muted-fg)}label{display:grid;gap:.35rem;margin:0 0 .9rem;font-size:.875rem;font-weight:500}select,button{font:inherit}select{padding:.5rem .75rem;border:1px solid var(--border);border-radius:calc(var(--radius) - 2px);background:var(--background);margin:0;max-width:100%}button{padding:.55rem 1.1rem;background:var(--primary);color:#fafafa;border:1px solid var(--primary);border-radius:calc(var(--radius) - 2px);cursor:pointer;font-weight:500}button:hover{opacity:.9}.hint{color:var(--muted-fg);font-size:.8rem}.htmx-request{opacity:.6}code{background:var(--muted);padding:.1rem .35rem;border-radius:.25rem;font-size:.85em}.badge{display:inline-block;padding:.15rem .6rem;border-radius:9999px;font-size:.75rem;font-weight:600;white-space:nowrap}.badge-green{background:#dcfce7;color:#166534}.badge-blue{background:#dbeafe;color:#1d4ed8}.badge-red{background:#fee2e2;color:#b91c1c}.badge-gray{background:var(--muted);color:var(--muted-fg)}.admin{display:flex;gap:1.5rem;align-items:flex-start}.filters{min-width:180px;border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;background:var(--muted)}.filters h3{margin:.25rem 0 .5rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-fg)}.filters a{display:block;padding:.35rem .6rem;border-radius:calc(var(--radius) - 4px);color:var(--foreground);text-decoration:none;font-size:.875rem}.filters a.on{background:var(--primary);color:#fafafa}.result{flex:1;min-width:0;border:1px solid var(--border);border-radius:var(--radius);overflow-x:auto;background:var(--background)}.result table{width:100%;border-collapse:collapse;font-size:.875rem}.result th{background:var(--muted);text-align:left;padding:.6rem .9rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-fg);border-bottom:1px solid var(--border);white-space:nowrap}.result td{padding:.6rem .9rem;border-bottom:1px solid var(--border)}.result tr:last-child td{border-bottom:none}.result tr:nth-child(even) td{background:#fafafa}.count{color:var(--muted-fg);font-size:.85rem;margin:.5rem 0}.crumbs{color:var(--muted-fg);font-size:.85rem;margin:.75rem 0}.crumbs a{color:var(--foreground)}@media(max-width:640px){main{padding:1rem}.admin{flex-direction:column}.filters{min-width:0;width:100%}}</style>
</head>
<body><nav class="navbar"><div><b>Trial bookings</b><a href="/">Book</a><a href="/admin/roster">Roster</a><a href="/admin/payments">Payments</a></div></nav><main><h1>${title}</h1>${body}</main></body>
</html>`;
}

export function bookingPage(
  parents: { id: string; name: string }[],
  classes: { id: string; title: string; seats_left: number; held_count: number }[],
  initialChildren: { id: string; name: string }[] = [],
): string {
  if (parents.length === 0 || classes.length === 0) {
    return layout("Book a Trial", `<div class="card">No trial classes available right now — please check back later.</div>`);
  }
  const parentOpts = parents.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  const childOpts = childOptions(initialChildren) || `<option value="" disabled selected>Select a parent first</option>`;
  const classOpts = classes
    .map((c) => {
      const seats = Number(c.seats_left);
      const held = Number(c.held_count ?? 0);
      const heldBit = held > 0 ? `, ${held} held` : "";
      return seats > 0
        ? `<option value="${c.id}">${c.title} (${seats} seat${seats === 1 ? "" : "s"} left${heldBit})</option>`
        : `<option value="${c.id}" disabled>${c.title} — Full${heldBit}</option>`;
    })
    .join("");
  const allFull = classes.every((c) => Number(c.seats_left) <= 0);
  return layout(
    "Book a Trial",
    `<div class="card"><form hx-post="/bookings" hx-target="#status" hx-swap="innerHTML" hx-indicator="#book-btn">
      <label>Parent <select name="parent_id" hx-get="/api/children" hx-target="#child" hx-trigger="change" required>${parentOpts}</select></label>
      <label>Child <select id="child" name="student_id" required>${childOpts}</select></label>
      <label>Class <select name="trial_class_id" required>${classOpts}</select></label>
      ${allFull ? `<p class="hint">All classes are full — check back later, held seats return when their 10 minutes run out.</p>` : ""}
      <button id="book-btn" type="submit">Book trial</button>
    </form></div><div id="status" aria-live="polite"></div>
    <p><a href="/admin/roster">View confirmed roster</a></p>`,
  );
}

export function childOptions(children: { id: string; name: string }[]): string {
  return children.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

const STATUS_COPY: Record<string, string> = {
  held: "Seat held — complete payment within 10 minutes…",
  confirmed: "Confirmed — see you at the trial!",
  payment_failed: "Payment failed — no charge was made.",
  hold_expired: "Hold expired — the seat was released.",
};

export function bookingStatusFragment(bookingId: string, status: string, invoiceId = ""): string {
  const copy = STATUS_COPY[status] ?? status;
  const invoice = invoiceId ? `<div>Invoice <code>${invoiceId}</code></div>` : "";
  if (status === "payment_failed" || status === "hold_expired") {
    return `<div class="card failed" id="booking-${bookingId}">Booking ${bookingId}: <strong>${copy}</strong>${invoice}
      <div><button hx-post="/bookings/${bookingId}/retry" hx-target="#booking-${bookingId}" hx-swap="outerHTML">Try again</button></div></div>`;
  }
  if (isTerminal(status as never)) {
    return `<div class="card terminal" id="booking-${bookingId}">Booking ${bookingId}: <strong>${copy}</strong>${invoice}</div>`;
  }
  return `<div class="card poll" hx-get="/bookings/${bookingId}/status" hx-trigger="load delay:1000ms" hx-swap="outerHTML">Booking ${bookingId}: <strong>${copy}</strong>${invoice}</div>`;
}

export function paymentsPage(
  parents: { id: string; name: string }[],
  selected: string,
  rows: { provider_invoice_id: string; parent_name: string; student_name: string; class_title: string; attempt_status: string; event_type: string | null }[],
): string {
  const opts =
    `<option value="">All parents</option>` +
    parents.map((p) => `<option value="${p.id}"${p.id === selected ? " selected" : ""}>${p.name}</option>`).join("");
  const badge: Record<string, string> = { succeeded: "badge-green", created: "badge-blue", failed: "badge-red" };
  const body =
    rows
      .map(
        (r) =>
          `<tr><td><code>${r.provider_invoice_id}</code></td><td>${r.parent_name}</td><td>${r.student_name}</td><td>${r.class_title}</td><td><span class="badge ${badge[r.attempt_status] ?? "badge-gray"}">${r.attempt_status}</span></td><td>${r.event_type ?? "—"}</td></tr>`,
      )
      .join("") || `<tr><td colspan="6">No payment attempts recorded yet</td></tr>`;
  return layout(
    "Payments",
    `<div class="card"><form method="get" action="/admin/payments">
      <label>Parent <select name="parent_id">${opts}</select></label>
      <button type="submit">Filter</button>
    </form></div>
    <div class="result"><table><thead><tr><th>Invoice</th><th>Parent</th><th>Child</th><th>Class</th><th>Attempt</th><th>Event</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p><a href="/">Back</a> · <a href="/admin/roster">Roster</a></p>`,
  );
}

export function rosterPage(
  rows: { booking_id: string; student_name: string; parent_name: string; class_title: string; created_at: string }[],
  classes: { id: string; title: string }[] = [],
  selected = "",
): string {
  const links =
    `<a href="/admin/roster" class="${selected ? "" : "on"}">All classes</a>` +
    classes.map((c) => `<a href="/admin/roster?class_id=${c.id}" class="${c.id === selected ? "on" : ""}">${c.title}</a>`).join("");
  const body =
    rows
      .map(
        (r) =>
          `<tr><td>${r.student_name}</td><td>${r.parent_name}</td><td>${r.class_title}</td><td>${new Date(r.created_at).toLocaleDateString()}</td></tr>`,
      )
      .join("") || `<tr><td colspan="4">No confirmed bookings yet</td></tr>`;
  return layout(
    "Roster",
    `<div class="crumbs"><a href="/">Home</a> / Roster</div>
    <p class="count">${rows.length} enrolled${rows.length === 1 ? "" : "s"}</p>
    <div class="admin"><div class="filters"><h3>By class</h3>${links}</div>
    <div class="result"><table><thead><tr><th>Child</th><th>Parent</th><th>Class</th><th>Enrolled</th></tr></thead>
    <tbody>${body}</tbody></table></div></div>
    <p><a href="/admin/payments">Payments</a></p>`,
  );
}
