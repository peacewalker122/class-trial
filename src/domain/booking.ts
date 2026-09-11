export type BookingStatus = "held" | "confirmed" | "payment_failed" | "hold_expired";

export const TERMINAL_STATUSES: Partial<Record<BookingStatus, true>> = {
  confirmed: true,
  payment_failed: true,
  hold_expired: true,
};
export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES[status] === true;
}
