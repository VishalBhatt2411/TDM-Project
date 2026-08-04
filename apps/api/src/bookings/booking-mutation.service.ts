import { Inject, Injectable } from "@nestjs/common";
import {
  AuditLogRepository,
  Booking,
  BookingConflictChecker,
  BookingRepository,
  BookingStatus,
  CustomerRepository,
  SalesRepRepository,
  TimeSlot,
  UNASSIGNED_ID,
  WaitlistPromotionService,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, CUSTOMER_REPOSITORY, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";

/** Statuses that occupy a vehicle's slot and therefore free one up when they end. */
export const SLOT_OCCUPYING_STATUSES: ReadonlySet<BookingStatus> = new Set(["Requested", "Confirmed", "InProgress"]);

/**
 * Cancel/reschedule mutation logic shared by the customer-facing booking flow and
 * the staff-facing (rep/admin) flows — the domain rules, notifications, and
 * waitlist promotion are identical regardless of who initiated the change; only
 * the authorization check differs per caller, so that stays with each caller.
 */
@Injectable()
export class BookingMutationService {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly notifications: NotificationsService,
    private readonly emailContext: BookingEmailContextService,
  ) {}

  async cancelBooking(booking: Booking, reason: string, actorId: string): Promise<Booking> {
    const emailCtx = await this.emailContext.build(booking);
    const freesSlot = SLOT_OCCUPYING_STATUSES.has(booking.status);

    // Throws CancellationWindowExpiredError (-> 400) if past the policy cutoff.
    booking.cancel(reason);
    await this.bookings.save(booking);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_CANCELLED",
      entityType: "Booking",
      entityId: booking.id,
      metadata: { reason },
    });

    if (emailCtx) {
      const customer = await this.customers.findById(booking.customerId);
      if (customer) await this.notifications.sendCancellation(customer.email.value, emailCtx, reason);
      if (booking.salesRepId) {
        const rep = await this.salesReps.findById(booking.salesRepId);
        if (rep) await this.notifications.sendCancellation(rep.toProps().email, emailCtx, reason);
      }
    }

    if (freesSlot) {
      await this.promoteNextWaitlisted(booking.vehicleId);
    }

    return booking;
  }

  async rescheduleBooking(booking: Booking, newSlotInput: { start: string; end: string }, actorId: string): Promise<Booking> {
    const previousStart = booking.slot.start;
    const freesSlot = SLOT_OCCUPYING_STATUSES.has(booking.status);
    const newSlot = TimeSlot.create(newSlotInput.start, newSlotInput.end);

    const conflictChecker = new BookingConflictChecker(this.bookings);
    await conflictChecker.assertNoConflict(booking.vehicleId, newSlot);

    // Throws CancellationWindowExpiredError (-> 400) if past the policy cutoff.
    // UNASSIGNED_ID, not a client-generated id — the repository only creates a new
    // Salesforce record (vs. attempting to update a nonexistent one) when it sees
    // this exact sentinel, then returns the booking with the provider-assigned id.
    const newBooking = booking.reschedule(newSlot, UNASSIGNED_ID);
    await this.bookings.save(booking);
    const saved = await this.bookings.save(newBooking);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_RESCHEDULED",
      entityType: "Booking",
      entityId: saved.id,
      metadata: { previousBookingId: booking.id },
    });

    const emailCtx = await this.emailContext.build(saved);
    if (emailCtx) {
      const customer = await this.customers.findById(saved.customerId);
      if (customer) await this.notifications.sendReschedule(customer.email.value, emailCtx, previousStart);
      if (saved.salesRepId) {
        const rep = await this.salesReps.findById(saved.salesRepId);
        if (rep) await this.notifications.sendReschedule(rep.toProps().email, emailCtx, previousStart);
      }
    }

    if (freesSlot) {
      await this.promoteNextWaitlisted(booking.vehicleId);
    }

    return saved;
  }

  /** Confirms the earliest-position waitlisted booking for a vehicle once a slot frees up, and notifies the customer. */
  private async promoteNextWaitlisted(vehicleId: string): Promise<void> {
    const promotionService = new WaitlistPromotionService(this.bookings);
    const promoted = await promotionService.promoteNextFor(vehicleId);
    if (!promoted) return;

    const emailCtx = await this.emailContext.build(promoted);
    if (!emailCtx) return;

    const customer = await this.customers.findById(promoted.customerId);
    if (customer) {
      await this.notifications.sendWaitlistPromotion(customer.email.value, emailCtx);
    }
  }
}
