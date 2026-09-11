import { SQL } from "bun";
import { startTrialBooking } from "../application/start-trial-booking.ts";
import { recordPaymentCallback } from "../application/record-payment-callback.ts";
import { getBookingStatus, getConfirmedRoster, getPaymentLedger, listChildren, listParents, listTrialClasses } from "../application/queries.ts";
import { BookingError, CallbackError } from "../domain/errors.ts";
import { bookingPage, bookingStatusFragment, childOptions, paymentsPage, rosterPage } from "./views.ts";

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function routeRequest(db: SQL, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method === "GET" && pathname === "/healthz") return Response.json({ ok: true });

  if (req.method === "GET" && pathname === "/") {
    const [parents, classes] = await Promise.all([listParents(db), listTrialClasses(db)]);
    const first = (parents as unknown as { id: string }[])[0];
    const initialChildren = first ? ((await listChildren(db, first.id)) as never) : [];
    return html(bookingPage(parents as never, classes as never, initialChildren as never));
  }

  if (req.method === "GET" && pathname === "/api/children") {
    return html(childOptions((await listChildren(db, url.searchParams.get("parent_id") ?? "")) as never));
  }

  if (req.method === "POST" && pathname === "/bookings") {
    const form = await req.formData();
    try {
      const result = await startTrialBooking(db, {
        parentId: String(form.get("parent_id")),
        studentId: String(form.get("student_id")),
        trialClassId: String(form.get("trial_class_id")),
      });
      return html(bookingStatusFragment(result.bookingId, result.status, result.providerInvoiceId));
    } catch (e) {
      if (e instanceof BookingError) return html(`<div class="card">${e.code}</div>`, 400);
      throw e;
    }
  }

  const retryMatch = pathname.match(/^\/bookings\/([^/]+)\/retry$/);
  if (req.method === "POST" && retryMatch) {
    const booking = await getBookingStatus(db, retryMatch[1]);
    if (!booking) return html("not found", 404);
    const students = (await db`SELECT parent_id FROM students WHERE id = ${booking.student_id}`) as unknown as { parent_id: string }[];
    if (students.length === 0) return html("not found", 404);
    try {
      const result = await startTrialBooking(db, {
        parentId: students[0].parent_id,
        studentId: booking.student_id,
        trialClassId: booking.trial_class_id,
      });
      return html(bookingStatusFragment(result.bookingId, result.status, result.providerInvoiceId));
    } catch (e) {
      if (e instanceof BookingError) return html(`<div class="card">${e.code}</div>`, 400);
      throw e;
    }
  }

  const statusMatch = pathname.match(/^\/bookings\/([^/]+)\/status$/);
  if (req.method === "GET" && statusMatch) {
    const booking = await getBookingStatus(db, statusMatch[1]);
    if (!booking) return html("not found", 404);
    const inv =
      (await db`SELECT provider_invoice_id FROM payment_attempts WHERE booking_id = ${statusMatch[1]} ORDER BY created_at DESC LIMIT 1`) as unknown as { provider_invoice_id: string }[];
    return html(bookingStatusFragment(statusMatch[1], booking.status, inv[0]?.provider_invoice_id ?? ""));
  }


  if (req.method === "POST" && pathname === "/payments/callback") {
    const rawBody = await req.text();
    try {
      const result = await recordPaymentCallback(db, rawBody, req.headers.get("x-signature") ?? "");
      return Response.json({ ok: true, ...result });
    } catch (e) {
      if (e instanceof CallbackError) {
        const status = e.code === "InvalidSignature" ? 401 : e.code === "UnknownInvoice" ? 404 : 400;
        return Response.json({ ok: false, code: e.code }, { status });
      }
      throw e;
    }
  }

  if (req.method === "GET" && pathname === "/admin/roster") {
    const classId = url.searchParams.get("class_id") || undefined;
    const [classes, rows] = await Promise.all([listTrialClasses(db), getConfirmedRoster(db, classId)]);
    return html(rosterPage(rows, classes as never, classId ?? ""));
  }
  if (req.method === "GET" && pathname === "/admin/roster.json") {
    return Response.json(await getConfirmedRoster(db));
  }
  if (req.method === "GET" && pathname === "/admin/payments") {
    const parentId = url.searchParams.get("parent_id") || undefined;
    const [parents, rows] = await Promise.all([listParents(db), getPaymentLedger(db, parentId)]);
    return html(paymentsPage(parents as never, parentId ?? "", rows));
  }

  return new Response("not found", { status: 404 });
}
