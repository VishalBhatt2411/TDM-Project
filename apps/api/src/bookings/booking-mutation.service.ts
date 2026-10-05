import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AuditLogRepository,
  Booking,
  BookingConflictChecker,
  BookingRepository,
  BookingStatus,
  CustomerRepository,
  ExclusiveLock,
  SalesRepRepository,
  TimeSlot,
  UNASSIGNED_ID,
  WaitlistPromotionService,
} from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, CUSTOMER_REPOSITORY, EXCLUSIVE_LOCK, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";
import { BookingAudience, BookingScheduleService } from "../config/booking-schedule.service";

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
  private readonly logger = new Logger(BookingMutationService.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    @Inject(EXCLUSIVE_LOCK) private readonly locks: ExclusiveLock,
    private readonly notifications: NotificationsService,
    private readonly emailContext: BookingEmailContextService,
    private readonly schedule: BookingScheduleService,
  ) {}

  async cancelBooking(booking: Booking, reason: string, actorId: string, audience: BookingAudience): Promise<Booking> {
    const [emailCtx, cutoffMinutes] = await Promise.all([
      this.emailContext.build(booking),
      this.schedule.cancellationCutoffMinutes(booking.dealershipId, audience),
    ]);
    const freesSlot = SLOT_OCCUPYING_STATUSES.has(booking.status);

    // Throws CancellationWindowExpiredError (-> 400) if past the dealership's cutoff.
    booking.cancel(reason, cutoffMinutes);
    await this.bookings.save(booking);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_CANCELLED",
      entityType: "Booking",
      entityId: booking.id,
      dealershipId: booking.dealershipId,
      metadata: { reason },
    });

    // The cancellation is committed. Waitlist promotion and e-mail are best-effort follow-ups: a
    // failure in either must not turn a successful cancel into a 500 (whose retry would then be
    // refused as an illegal state change) or leave the next waitlisted customer unpromoted.
    if (freesSlot) {
      await this.bestEffort("waitlist_promotion_failed", booking.id, () => this.promoteNextWaitlisted(booking.vehicleId));
    }
    if (emailCtx) {
      await this.bestEffort("cancellation_email_failed", booking.id, async () => {
        const customer = await this.customers.findById(booking.customerId);
        if (customer) await this.notifications.sendCancellation(customer.email.value, emailCtx, reason);
        if (booking.salesRepId) {
          const rep = await this.salesReps.findById(booking.salesRepId);
          if (rep) {
            const { email, name } = rep.toProps();
            await this.notifications.sendCancellation(email, emailCtx, reason, { kind: "rep", name });
          }
        }
      });
    }

    return booking;
  }

  async rescheduleBooking(
    booking: Booking,
    newSlotInput: { start: string; end: string },
    actorId: string,
    audience: BookingAudience,
  ): Promise<Booking> {
    const previousStart = booking.slot.start;
    const freesSlot = SLOT_OCCUPYING_STATUSES.has(booking.status);
    const newSlot = TimeSlot.create(newSlotInput.start, newSlotInput.end);
    const [, cutoffMinutes] = await Promise.all([
      this.schedule.assertBookable(booking.dealershipId, newSlot, audience),
      this.schedule.cancellationCutoffMinutes(booking.dealershipId, audience),
    ]);

    // Throws CancellationWindowExpiredError (-> 400) if past the dealership's cutoff.
    // UNASSIGNED_ID, not a client-generated id — the repository only creates a new
    // Salesforce record (vs. attempting to update a nonexistent one) when it sees
    // this exact sentinel, then returns the booking with the provider-assigned id.
    // `reschedule` mutates `booking` to Cancelled in memory and returns the replacement —
    // but we persist the replacement FIRST. If creating it fails (conflict, validation,
    // a Salesforce hiccup), the original booking must still be safely in place; nothing
    // has been cancelled yet. Only once the new booking exists do we cancel the old one.
    const newBooking = booking.reschedule(newSlot, UNASSIGNED_ID, cutoffMinutes);
    // The new slot must clear the conflict check, so — like a fresh booking that clears it — it is
    // Confirmed. Left as Requested it could never be checked in, started, or marked a no-show.
    newBooking.confirm();
    // Check and save under the vehicle's lock: two simultaneous reschedules/bookings into the same slot
    // must not both pass the check.
    const saved = await this.locks.runExclusive(`vehicle:${booking.vehicleId}`, async () => {
      await new BookingConflictChecker(this.bookings).assertNoConflict(booking.vehicleId, newSlot, booking.id);
      return this.bookings.save(newBooking);
    });
    try {
      await this.bookings.save(booking);
    } catch (err) {
      // Never leave the customer holding two active bookings: withdraw the replacement.
      saved.cancel("Reschedule could not be completed", 0);
      await this.bookings.save(saved).catch(() => undefined);
      throw err;
    }

    await this.auditLog.append({
      actorId,
      action: "BOOKING_RESCHEDULED",
      entityType: "Booking",
      entityId: saved.id,
      dealershipId: saved.dealershipId,
      metadata: { previousBookingId: booking.id },
    });

    if (freesSlot) {
      await this.bestEffort("waitlist_promotion_failed", booking.id, () => this.promoteNextWaitlisted(booking.vehicleId));
    }
    await this.bestEffort("reschedule_email_failed", saved.id, async () => {
      const emailCtx = await this.emailContext.build(saved);
      if (!emailCtx) return;
      const customer = await this.customers.findById(saved.customerId);
      if (customer) await this.notifications.sendReschedule(customer.email.value, emailCtx, previousStart);
      if (saved.salesRepId) {
        const rep = await this.salesReps.findById(saved.salesRepId);
        if (rep) {
          const { email, name } = rep.toProps();
          await this.notifications.sendReschedule(email, emailCtx, previousStart, { kind: "rep", name });
        }
      }
    });

    return saved;
  }

  /** Runs a post-commit follow-up whose failure must be logged, not surfaced to a caller whose change already succeeded. */
  private async bestEffort(event: string, bookingId: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      this.logger.error(JSON.stringify({ event, bookingId, reason: (err as Error).message }));
    }
  }

  /** Confirms the earliest-position waitlisted booking for a vehicle once a slot frees up, and notifies the customer. */
  private async promoteNextWaitlisted(vehicleId: string): Promise<void> {
    const promotionService = new WaitlistPromotionService(this.bookings);
    const promoted = await this.locks.runExclusive(`vehicle:${vehicleId}`, () => promotionService.promoteNextFor(vehicleId));
    if (!promoted) return;

    const emailCtx = await this.emailContext.build(promoted);
    if (!emailCtx) return;

    const customer = await this.customers.findById(promoted.customerId);
    if (customer) {
      await this.notifications.sendWaitlistPromotion(customer.email.value, emailCtx);
    }
  }
}
