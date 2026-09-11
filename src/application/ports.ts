export interface PaymentGateway {
  refund(eventId: string, amountCents: number): Promise<{ already: boolean }>;
  refunded(eventId: string): boolean;
}
