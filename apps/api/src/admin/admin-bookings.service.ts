import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogRepository, Booking, BookingRepository, BookingStatus, SalesRepRepository, SalesRepresentative } from "@tdm/domain";
import { BookingDto, VehicleAvailabilityResponse } from "@tdm/types";
import { AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { bookingToDto } from "../bookings/bookings.service";
import { BookingMutationService } from "../bookings/booking-mutation.service";
import { QrCheckinService } from "../bookings/qr-checkin.service";
import { BookingScheduleService } from "../config/booking-schedule.service";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";
import { BookingAccessPolicy } from "./booking-access.policy";
import { PERMISSIONS } from "./permissions";
import type { StaffAccess } from "./staff-access";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { AssignSalesRepDto, CheckInBookingDto, CompleteDriveDto, SetStaffNotesDto, StartDriveDto } from "./dto";
import { CancelBookingDto, RescheduleBookingDto } from "../bookings/dto";

/** Adds staff-only fields (never surfaced to the customer-facing BookingDto) for Admin Console consumers. */
function adminBookingToDto(booking: Booking): BookingDto & { staffNotes?: string } {
  return { ...bookingToDto(booking), staffNotes: booking.toProps().staffNotes };
}

@Injectable()
export class AdminBookingsService {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly access: BookingAccessPolicy,
    private readonly notifications: NotificationsService,
    private readonly emailContext: BookingEmailContextService,
    private readonly mutations: BookingMutationService,
    private readonly qrCheckin: QrCheckinService,
    private readonly schedule: BookingScheduleService,
  ) {}

  /** Every booking at the dealerships where the actor holds MANAGE_BOOKINGS. */
  async list(filters: { status?: BookingStatus; branchId?: string; page?: number; pageSize?: number }, access: StaffAccess) {
    const scope = access.scopeFor(PERMISSIONS.MANAGE_BOOKINGS) ?? { dealershipIds: [] };
    const { items, total } = await this.bookings.findAll({ ...filters, ...scope });
    return {
      items: items.map(adminBookingToDto),
      total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 25,
    };
  }

  /** A rep's self-service view — every booking currently assigned to them, any status. */
  async listMine(access: StaffAccess, filters: { status?: BookingStatus; page?: number; pageSize?: number }) {
    const { items, total } = await this.bookings.findAll({ ...filters, salesRepId: access.salesforceUserId });
    return {
      items: items.map(adminBookingToDto),
      total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 25,
    };
  }

  async getById(bookingId: string, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);
    return adminBookingToDto(booking);
  }

  /**
   * Reassigns which Sales_Rep__c is handling a booking. This writes straight through
   * to Salesforce (Booking__c.Sales_Rep__c) via the same BookingRepository the customer
   * flows use — the admin console has no separate/shadow copy of this data. Restricted
   * to staff holding MANAGE_BOOKINGS at the booking's dealership — a rep hands off via
   * handoff() instead, which is scoped to bookings already assigned to them.
   */
  async assignSalesRep(bookingId: string, dto: AssignSalesRepDto, actorId: string, access: StaffAccess) {
    const booking = await this.requireBooking(bookingId);
    // Another dealership's booking is indistinguishable from a nonexistent one.
    if (!access.canIn(PERMISSIONS.MANAGE_BOOKINGS, booking.dealershipId)) {
      throw new NotFoundException(`Booking ${bookingId} was not found.`);
    }
    const rep = await this.requireActiveRep(dto.salesRepId, booking.dealershipId);

    booking.assignRep(rep.id);
    const saved = await this.bookings.save(booking);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_REP_REASSIGNED",
      entityType: "Booking",
      entityId: bookingId,
      dealershipId: saved.dealershipId,
      metadata: { salesRepId: rep.id },
    });

    const emailCtx = await this.emailContext.build(saved);
    if (emailCtx) await this.notifications.sendRepAssignment(rep.toProps().email, rep.toProps().name, emailCtx);

    return adminBookingToDto(saved);
  }

  /** A rep handing their own booking off to a colleague — Admin/Manager may also use it on any booking. */
  async handoff(bookingId: string, dto: AssignSalesRepDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);
    const rep = await this.requireActiveRep(dto.salesRepId, booking.dealershipId);

    booking.assignRep(rep.id);
    const saved = await this.bookings.save(booking);

    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "BOOKING_REP_HANDOFF",
      entityType: "Booking",
      entityId: bookingId,
      dealershipId: saved.dealershipId,
      metadata: { salesRepId: rep.id },
    });

    const emailCtx = await this.emailContext.build(saved);
    if (emailCtx) await this.notifications.sendRepAssignment(rep.toProps().email, rep.toProps().name, emailCtx);

    return adminBookingToDto(saved);
  }

  async checkIn(bookingId: string, dto: CheckInBookingDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    if (dto.method === "QR") {
      if (!dto.qrToken) {
        throw new BadRequestException("A QR token is required for a QR check-in.");
      }
      this.qrCheckin.verifyToken(dto.qrToken, bookingId);
    }

    booking.checkIn(dto.method);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_CHECKED_IN", saved, { method: dto.method });
    return adminBookingToDto(saved);
  }

  async start(bookingId: string, dto: StartDriveDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    // FR-52/54/55: a vehicle never leaves the lot without a staff-verified license and a
    // signed consent on file for this booking.
    const compliance = await this.bookings.findComplianceByBooking(bookingId);
    if (!compliance?.isComplete) {
      throw new BadRequestException(
        "Pre-drive compliance is incomplete — the customer's license must be verified by staff and consent signed before the drive can start.",
      );
    }

    booking.start(dto.odometerStart);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_STARTED", saved, { odometerStart: dto.odometerStart });
    return adminBookingToDto(saved);
  }

  async complete(bookingId: string, dto: CompleteDriveDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    booking.complete(dto.odometerEnd);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_COMPLETED", saved, { odometerEnd: dto.odometerEnd });
    return adminBookingToDto(saved);
  }

  async markNoShow(bookingId: string, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    booking.markNoShow();
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_NO_SHOW", saved, {});
    return adminBookingToDto(saved);
  }

  async setNotes(bookingId: string, dto: SetStaffNotesDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    booking.setStaffNotes(dto.notes);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_NOTES_UPDATED", saved, {});
    return adminBookingToDto(saved);
  }

  async cancel(bookingId: string, dto: CancelBookingDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    const cancelled = await this.mutations.cancelBooking(booking, dto.reason, staff.staffUserId, "staff");
    return adminBookingToDto(cancelled);
  }

  async reschedule(bookingId: string, dto: RescheduleBookingDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);

    const saved = await this.mutations.rescheduleBooking(booking, dto.slot, staff.staffUserId, "staff");
    return adminBookingToDto(saved);
  }

  /** The booking's vehicle's slots on `date` at its dealership — what a reschedule can pick from. */
  async slots(bookingId: string, date: string, staff: AuthenticatedStaff): Promise<VehicleAvailabilityResponse> {
    const booking = await this.requireBooking(bookingId);
    await this.access.assertCanActOn(staff, booking);
    const { vehicleId, dealershipId } = booking.toProps();
    return { vehicleId, date, ...(await this.schedule.vehicleDay({ id: vehicleId, dealershipId }, date, "staff")) };
  }

  private async requireBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} was not found.`);
    return booking;
  }

  /** A booking can only go to a rep holding an active Sales Rep assignment at the booking's own dealership. */
  private async requireActiveRep(salesRepId: string, dealershipId: string): Promise<SalesRepresentative> {
    const reps = await this.salesReps.findAllActive({ dealershipIds: [dealershipId] });
    const rep = reps.find((r) => r.id === salesRepId);
    if (!rep) throw new BadRequestException("That sales representative isn't active at this booking's dealership.");
    return rep;
  }

  private async logAction(staff: AuthenticatedStaff, action: string, booking: Booking, metadata: Record<string, unknown>) {
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action,
      entityType: "Booking",
      entityId: booking.id,
      dealershipId: booking.dealershipId,
      metadata,
    });
  }
}
