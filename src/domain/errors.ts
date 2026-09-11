export type BookingErrorCode =
  | "ParentNotFound"
  | "StudentNotFound"
  | "StudentNotOwnedByParent"
  | "TrialClassNotFound"
  | "ClassAlreadyStarted"
  | "ClassFull";

export type CallbackErrorCode = "InvalidSignature" | "InvalidPayload" | "UnknownInvoice";

export type AllocationOutcome = "Confirmed" | "AlreadyProcessed";

export class BookingError extends Error {
  readonly code: BookingErrorCode;
  constructor(code: BookingErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export class CallbackError extends Error {
  readonly code: CallbackErrorCode;
  constructor(code: CallbackErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
