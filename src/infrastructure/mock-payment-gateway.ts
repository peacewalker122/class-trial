import type { PaymentGateway } from "../application/ports.ts";

export class MockPaymentGateway implements PaymentGateway {
  private done = new Set<string>();

  async refund(eventId: string, _amountCents: number): Promise<{ already: boolean }> {
    if (this.done.has(eventId)) return { already: true };
    this.done.add(eventId);
    return { already: false };
  }

  refunded(eventId: string): boolean {
    return this.done.has(eventId);
  }
}
