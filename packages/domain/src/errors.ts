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

/** The user already holds a staff assignment at that dealership — edit it instead of adding another. */
export class StaffAssignmentConflictError extends DomainError {
  constructor(message = "This user already has an assignment at that dealership.") {
    super(message, "STAFF_ASSIGNMENT_CONFLICT");
  }
}

/** A unit of work reached the data provider without a resolved tenant — fail closed rather than guess one. */
export class TenantContextMissingError extends DomainError {
  constructor() {
    super("This request could not be associated with an organization.", "TENANT_CONTEXT_MISSING");
  }
}

/** The tenant exists but has no usable data-provider connection (never connected, or credentials revoked). */
export class TenantNotConnectedError extends DomainError {
  constructor(readonly organizationId: string) {
    super("This organization's data connection is not available. An administrator must reconnect it.", "TENANT_NOT_CONNECTED");
  }
}

/** The tenant's data provider lacks storage a feature needs (e.g. its TDM package predates the feature and must be redeployed). */
export class DataProviderOutdatedError extends DomainError {
  constructor(feature: string) {
    super(`This organization's data connection doesn't support ${feature} yet. An administrator must redeploy the TDM package.`, "DATA_PROVIDER_OUTDATED");
  }
}
