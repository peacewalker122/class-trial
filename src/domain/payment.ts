export type PaymentEventType = "succeeded" | "failed";
export type PaymentAttemptStatus = "created" | "succeeded" | "failed";

export interface PaymentAttempt {
  id: string;
  booking_id: string;
  provider_invoice_id: string;
  status: PaymentAttemptStatus;
  amount_cents: number;
}

export interface ProviderCallback {
  provider_event_id: string;
  provider_invoice_id: string;
  type: PaymentEventType;
}

export function isTerminalAttempt(status: PaymentAttemptStatus): boolean {
  return status === "succeeded" || status === "failed";
}
