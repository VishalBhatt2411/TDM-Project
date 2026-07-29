import { randomUUID } from "node:crypto";
import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AuditLogRepository,
  Booking,
  BookingConflictChecker,
  BookingConflictError,
  BookingRepository,
  CustomerRepository,
  DriveFeedback,
  PersonName,
  PhoneNumber,
  SalesOpportunity,
  SalesOpportunityRepository,
  SalesRepRepository,
  TimeSlot,
} from "@tdm/domain";
import { BookingDto } from "@tdm/types";
import { AuthService } from "../auth/auth.service";
import {
  AUDIT_LOG_REPOSITORY,
  BOOKING_REPOSITORY,
  CUSTOMER_REPOSITORY,
  SALES_OPPORTUNITY_REPOSITORY,
  SALES_REP_REPOSITORY,
} from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";
import { BookingMutationService } from "./booking-mutation.service";
import { CancelBookingDto, CreateBookingDto, CreatePublicBookingDto, RescheduleBookingDto, SubmitSurveyDto } from "./dto";

export function bookingToDto(booking: Booking): BookingDto {
  const props = booking.toProps();
  return {
    id: props.id,
    customerId: props.customerId,
    vehicleId: props.vehicleId,
    branchId: props.branchId,
    salesRepId: props.salesRepId,
    driveType: props.driveType,
    slot: { start: props.slot.start.toISOString(), end: props.slot.end.toISOString() },
    status: props.status,
    homeAddress: props.homeAddress,
    checkInTimestamp: props.checkInTimestamp?.toISOString(),
    actualStart: props.actualStart?.toISOString(),
    actualEnd: props.actualEnd?.toISOString(),
    waitlistPosition: props.waitlistPosition,
    createdAt: props.createdAt.toISOString(),
    city: props.city,
    state: props.state,
    preferredVariantId: props.preferredVariantId,
    isExistingCustomer: props.isExistingCustomer,
    currentVehicleOwned: props.currentVehicleOwned,
    purchaseTimeline: props.purchaseTimeline,
    pickupRequired: props.pickupRequired,
    additionalNotes: props.additionalNotes,
  };
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(SALES_OPPORTUNITY_REPOSITORY) private readonly opportunities: SalesOpportunityRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly authService: AuthService,
    private readonly notifications: NotificationsService,
    private readonly emailContext: BookingEmailContextService,
    private readonly mutations: BookingMutationService,
  ) {}

  /** Authenticated booking creation — for a customer who already has an account/session. */
  async create(customerId: string, dto: CreateBookingDto): Promise<BookingDto & { conflictChecked: true }> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundException("Customer not found.");
    }
    customer.assertCanBook();

    const booking = await this.createBookingInternal(customerId, dto);
    await this.sendConfirmation(booking, customer.email.value, `${customer.name.firstName} ${customer.name.lastName}`);
    return { ...bookingToDto(booking), conflictChecked: true };
  }

  /**
   * Public (unauthenticated) booking creation for a first-time visitor. Personal
   * info doubles as inline registration: if no account matches the email, one is
   * created transparently and a magic sign-in link is emailed so the customer can
   * come back and manage their bookings — no password ever changes hands.
   */
  async createPublic(dto: CreatePublicBookingDto): Promise<BookingDto & { conflictChecked: true }> {
    let customer = await this.customers.findByEmail(dto.email);
    let isNewAccount = false;

    if (!customer) {
      customer = await this.authService.autoRegisterForBooking({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        mobileNumber: dto.mobileNumber,
      });
      isNewAccount = true;
    } else {
      // A returning customer's details can change between bookings (typo fix, new
      // number, booking for a different name) — keep the record in sync with what
      // was actually submitted on this form rather than silently keeping stale data.
      // This is a best-effort enrichment, not part of the booking's critical path:
      // a Salesforce write failure here must never block the booking itself.
      try {
        const submittedPhone = PhoneNumber.create(`+91${dto.mobileNumber}`);
        const submittedName = PersonName.create(dto.firstName, dto.lastName);
        if (
          submittedPhone.value !== customer.phone.value ||
          submittedName.firstName !== customer.name.firstName ||
          submittedName.lastName !== customer.name.lastName
        ) {
          customer.updateContactDetails({ name: submittedName, phone: submittedPhone });
          await this.customers.save(customer);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to sync contact details for customer ${customer.id} during booking: ${(error as Error).message}`,
        );
      }
    }

    const booking = await this.createBookingInternal(customer.id, dto);
    const customerName = `${customer.name.firstName} ${customer.name.lastName}`;

    await this.sendConfirmation(booking, customer.email.value, customerName);

    // A magic link is a nice one-click convenience, but it's only safe to send when the
    // customer already has a real password to fall back on — otherwise, once that single-use
    // link is consumed (or expires), they have no way back in. isNewAccount is checked first to
    // skip a redundant lookup, but a *returning* customer whose account was itself auto-registered
    // and never had its password set (e.g. from before this check existed) must get the same
    // password-setup email, not a magic link, on every booking until they actually set one.
    if (isNewAccount || (await this.authService.needsPasswordSetup(customer.id))) {
      await this.authService.issuePasswordSetupEmail(customer.id, customer.email.value, customerName, isNewAccount);
    } else {
      const magicLink = await this.authService.issueMagicLoginLink(customer.id);
      await this.notifications.sendAccountAccess(customer.email.value, customerName, magicLink);
    }

    return { ...bookingToDto(booking), conflictChecked: true };
  }

  async listForCustomer(customerId: string): Promise<BookingDto[]> {
    const bookings = await this.bookings.findByCustomer(customerId);
    return bookings.map(bookingToDto);
  }

  async getById(customerId: string, bookingId: string): Promise<BookingDto> {
    const booking = await this.requireOwnedBooking(customerId, bookingId);
    return bookingToDto(booking);
  }

  async cancel(customerId: string, bookingId: string, dto: CancelBookingDto): Promise<BookingDto> {
    const booking = await this.requireOwnedBooking(customerId, bookingId);
    const cancelled = await this.mutations.cancelBooking(booking, dto.reason, customerId);
    return bookingToDto(cancelled);
  }

  async reschedule(customerId: string, bookingId: string, dto: RescheduleBookingDto): Promise<BookingDto> {
    const booking = await this.requireOwnedBooking(customerId, bookingId);
    const saved = await this.mutations.rescheduleBooking(booking, dto.slot, customerId);
    return bookingToDto(saved);
  }

  async submitSurvey(customerId: string, bookingId: string, dto: SubmitSurveyDto): Promise<{ opportunityCreated: boolean }> {
    const booking = await this.requireOwnedBooking(customerId, bookingId);

    const interestLevel = dto.npsScore >= 8 || dto.purchaseInterest ? "High" : dto.npsScore >= 5 ? "Medium" : "Low";
    const feedback = DriveFeedback.create({
      id: randomUUID(),
      bookingId: booking.id,
      interestLevel,
      submittedBy: "Customer",
      purchaseInterest: dto.purchaseInterest,
      vehiclePerformanceRating: dto.vehiclePerformanceRating,
      comfortRating: dto.comfortRating,
      featuresRating: dto.featuresRating,
      staffExperienceRating: dto.staffExperienceRating,
      dealershipExperienceRating: dto.dealershipExperienceRating,
      npsScore: dto.npsScore,
      customerComments: dto.additionalComments,
      isSurveyResponse: true,
    });
    await this.bookings.saveFeedback(feedback);

    // Strong purchase intent auto-triggers the sales opportunity workflow.
    if (feedback.indicatesStrongIntent) {
      await this.opportunities.save(
        SalesOpportunity.create({
          bookingId: booking.id,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
        }),
      );
      return { opportunityCreated: true };
    }
    return { opportunityCreated: false };
  }

  private async createBookingInternal(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    const slot = TimeSlot.create(dto.slot.start, dto.slot.end);

    const conflictChecker = new BookingConflictChecker(this.bookings);
    let joinWaitlist = false;
    try {
      await conflictChecker.assertNoConflict(dto.vehicleId, slot);
    } catch (error) {
      if (!(error instanceof BookingConflictError) || !dto.joinWaitlistIfUnavailable) {
        throw error;
      }
      joinWaitlist = true;
    }

    let booking = Booking.request({
      customerId,
      vehicleId: dto.vehicleId,
      branchId: dto.branchId,
      driveType: dto.driveType,
      slot,
      homeAddress: dto.homeAddress,
      city: dto.city,
      state: dto.state,
      preferredVariantId: dto.preferredVariantId,
      isExistingCustomer: dto.isExistingCustomer,
      currentVehicleOwned: dto.currentVehicleOwned,
      purchaseTimeline: dto.purchaseTimeline as any,
      pickupRequired: dto.pickupRequired,
      additionalNotes: dto.additionalNotes,
    });

    let assignedRepEmail: string | undefined;
    let assignedRepName: string | undefined;
    if (joinWaitlist) {
      const currentWaitlist = await this.bookings.findWaitlistedForVehicle(dto.vehicleId);
      booking.waitlist(currentWaitlist.length + 1);
    } else {
      const rep = await this.salesReps.findLeastLoadedForBranch(dto.branchId, slot.start);
      if (rep) {
        booking.assignRep(rep.id);
        assignedRepEmail = rep.toProps().email;
        assignedRepName = rep.toProps().name;
      }
    }

    booking = await this.bookings.save(booking);

    if (assignedRepEmail && assignedRepName) {
      const emailCtx = await this.emailContext.build(booking);
      if (emailCtx) await this.notifications.sendRepAssignment(assignedRepEmail, assignedRepName, emailCtx);
    }

    return booking;
  }

  private async sendConfirmation(booking: Booking, customerEmail: string, customerName: string): Promise<void> {
    const emailCtx = await this.emailContext.build(booking, customerName);
    if (!emailCtx) return;

    if (booking.status === "Waitlisted") {
      await this.notifications.sendWaitlisted(customerEmail, emailCtx, booking.waitlistPosition ?? 1);
    } else {
      await this.notifications.sendBookingConfirmation(customerEmail, emailCtx);
    }
  }

  private async requireOwnedBooking(customerId: string, bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} was not found.`);
    }
    if (booking.customerId !== customerId) {
      throw new ForbiddenException("This booking does not belong to you.");
    }
    return booking;
  }
}
