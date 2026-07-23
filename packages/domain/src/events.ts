export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  name: TName;
  occurredAt: Date;
  payload: TPayload;
}

function event<TName extends string, TPayload>(name: TName, payload: TPayload): DomainEvent<TName, TPayload> {
  return { name, occurredAt: new Date(), payload };
}

export const DomainEvents = {
  customerRegistered: (payload: { customerId: string; email: string }) => event("CustomerRegistered", payload),
  bookingRequested: (payload: { bookingId: string; customerId: string; vehicleId: string }) =>
    event("BookingRequested", payload),
  bookingConfirmed: (payload: { bookingId: string }) => event("BookingConfirmed", payload),
  bookingWaitlisted: (payload: { bookingId: string; position: number }) => event("BookingWaitlisted", payload),
  bookingPromotedFromWaitlist: (payload: { bookingId: string }) => event("BookingPromotedFromWaitlist", payload),
  bookingCancelled: (payload: { bookingId: string; reason: string }) => event("BookingCancelled", payload),
  bookingRescheduled: (payload: { oldBookingId: string; newBookingId: string }) => event("BookingRescheduled", payload),
  driveCheckedIn: (payload: { bookingId: string }) => event("DriveCheckedIn", payload),
  driveStarted: (payload: { bookingId: string }) => event("DriveStarted", payload),
  driveCompleted: (payload: { bookingId: string }) => event("DriveCompleted", payload),
  complianceCaptured: (payload: { bookingId: string; complianceRecordId: string }) => event("ComplianceCaptured", payload),
  feedbackSubmitted: (payload: { bookingId: string; purchaseInterest: boolean }) => event("FeedbackSubmitted", payload),
  opportunityCreated: (payload: { opportunityId: string; bookingId: string }) => event("OpportunityCreated", payload),
  vehicleAllocationRequested: (payload: { allocationId: string; vehicleId: string }) =>
    event("VehicleAllocationRequested", payload),
  vehicleAllocationCompleted: (payload: { allocationId: string }) => event("VehicleAllocationCompleted", payload),
};

export type DomainEventPublisher = {
  publish(event: DomainEvent): Promise<void>;
};
