export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidValueError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_VALUE");
  }
}

export class BookingConflictError extends DomainError {
  constructor(
    message: string,
    public readonly suggestedSlots: string[] = [],
  ) {
    super(message, "SLOT_CONFLICT");
  }
}

export class CancellationWindowExpiredError extends DomainError {
  constructor(message: string) {
    super(message, "CANCELLATION_WINDOW_EXPIRED");
  }
}

/** Thrown when a Booking lifecycle method (checkIn/start/complete/markNoShow/reschedule) is
 *  invoked from a status that doesn't allow it — e.g. completing a drive that never started. */
export class IllegalBookingStateError extends DomainError {
  constructor(message: string) {
    super(message, "ILLEGAL_BOOKING_STATE");
  }
}

export class RegistrationRequiredError extends DomainError {
  constructor(message = "Customer must complete registration and verification before booking a test drive.") {
    super(message, "REGISTRATION_REQUIRED");
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} was not found.`, "NOT_FOUND");
  }
}
