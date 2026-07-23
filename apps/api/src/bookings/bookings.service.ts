import { randomUUID } from "node:crypto";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditLogRepository,
  Booking,
  BookingConflictChecker,
  BookingRepository,
  BranchRepository,
  CustomerRepository,
  DriveFeedback,
  PersonName,
  PhoneNumber,
  SalesOpportunity,
  SalesOpportunityRepository,
  SalesRepRepository,
  TimeSlot,
  VehicleRepository,
} from "@tdm/domain";
import { BookingDto } from "@tdm/types";
import { AuthService } from "../auth/auth.service";
import {
  AUDIT_LOG_REPOSITORY,
  BOOKING_REPOSITORY,
  BRANCH_REPOSITORY,
  CUSTOMER_REPOSITORY,
  SALES_OPPORTUNITY_REPOSITORY,
  SALES_REP_REPOSITORY,
  VEHICLE_REPOSITORY,
} from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContext } from "../notifications/email-templates";
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
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(SALES_OPPORTUNITY_REPOSITORY) private readonly opportunities: SalesOpportunityRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly authService: AuthService,
    private readonly notifications: NotificationsService,
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
    }

    const booking = await this.createBookingInternal(customer.id, dto);
    const customerName = `${customer.name.firstName} ${customer.name.lastName}`;

    await this.sendConfirmation(booking, customer.email.value, customerName);

    const magicLink = await this.authService.issueMagicLoginLink(customer.id);
    await this.notifications.sendAccountAccess(customer.email.value, customerName, magicLink);
    void isNewAccount; // both new and existing customers get a fresh sign-in link — see NotificationsService

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
    const emailCtx = await this.buildEmailContext(booking);

    // Throws CancellationWindowExpiredError (-> 400) if past the policy cutoff.
    booking.cancel(dto.reason);
    await this.bookings.save(booking);

    await this.auditLog.append({
      actorId: customerId,
      action: "BOOKING_CANCELLED",
      entityType: "Booking",
      entityId: booking.id,
      metadata: { reason: dto.reason },
    });

    if (emailCtx) {
      const customer = await this.customers.findById(customerId);
      if (customer) {
        await this.notifications.sendCancellation(customer.email.value, emailCtx, dto.reason);
      }
      if (booking.salesRepId) {
        const rep = await this.salesReps.findById(booking.salesRepId);
        if (rep) await this.notifications.sendCancellation(rep.toProps().email, emailCtx, dto.reason);
      }
    }

    return bookingToDto(booking);
  }

  async reschedule(customerId: string, bookingId: string, dto: RescheduleBookingDto): Promise<BookingDto> {
    const booking = await this.requireOwnedBooking(customerId, bookingId);
    const previousStart = booking.slot.start;
    const newSlot = TimeSlot.create(dto.slot.start, dto.slot.end);

    const conflictChecker = new BookingConflictChecker(this.bookings);
    await conflictChecker.assertNoConflict(booking.vehicleId, newSlot);

    // Throws CancellationWindowExpiredError (-> 400) if past the policy cutoff.
    const newBooking = booking.reschedule(newSlot, randomUUID());
    await this.bookings.save(booking);
    const saved = await this.bookings.save(newBooking);

    const emailCtx = await this.buildEmailContext(saved);
    if (emailCtx) {
      const customer = await this.customers.findById(customerId);
      if (customer) await this.notifications.sendReschedule(customer.email.value, emailCtx, previousStart);
      if (saved.salesRepId) {
        const rep = await this.salesReps.findById(saved.salesRepId);
        if (rep) await this.notifications.sendReschedule(rep.toProps().email, emailCtx, previousStart);
      }
    }

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
    await conflictChecker.assertNoConflict(dto.vehicleId, slot);

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

    const rep = await this.salesReps.findLeastLoadedForBranch(dto.branchId, slot.start);
    if (rep) {
      booking.assignRep(rep.id);
    }

    booking = await this.bookings.save(booking);
    return booking;
  }

  private async sendConfirmation(booking: Booking, customerEmail: string, customerName: string): Promise<void> {
    const emailCtx = await this.buildEmailContext(booking, customerName);
    if (emailCtx) {
      await this.notifications.sendBookingConfirmation(customerEmail, emailCtx);
    }
  }

  private async buildEmailContext(booking: Booking, customerNameOverride?: string): Promise<BookingEmailContext | null> {
    const [vehicle, branch, rep, customer] = await Promise.all([
      this.vehicles.findById(booking.vehicleId),
      this.branches.findById(booking.branchId),
      booking.salesRepId ? this.salesReps.findById(booking.salesRepId) : Promise.resolve(null),
      customerNameOverride ? Promise.resolve(null) : this.customers.findById(booking.customerId),
    ]);
    if (!vehicle || !branch) return null;

    const vehicleProps = vehicle.toProps();
    const branchProps = branch.toProps();
    return {
      customerName: customerNameOverride ?? (customer ? `${customer.name.firstName} ${customer.name.lastName}` : "there"),
      vehicleLabel: `${vehicleProps.year} ${vehicleProps.make} ${vehicleProps.model}`,
      bookingReference: booking.id,
      scheduledStart: booking.slot.start,
      driveType: booking.toProps().driveType,
      branchName: branchProps.name,
      branchAddress: branchProps.address.line1,
      salesRepName: rep ? rep.toProps().name : undefined,
    };
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
