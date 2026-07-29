import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogRepository, Booking, BookingRepository, BookingStatus, SalesRepRepository } from "@tdm/domain";
import { BookingDto } from "@tdm/types";
import { AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { bookingToDto } from "../bookings/bookings.service";
import { BookingMutationService } from "../bookings/booking-mutation.service";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";
import { PERMISSIONS } from "./permissions";
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
    private readonly notifications: NotificationsService,
    private readonly emailContext: BookingEmailContextService,
    private readonly mutations: BookingMutationService,
  ) {}

  /** Platform-wide listing — Admin or a Manager/staff holding MANAGE_BOOKINGS only. */
  async list(filters: { status?: BookingStatus; branchId?: string; page?: number; pageSize?: number }) {
    const { items, total } = await this.bookings.findAll(filters);
    return {
      items: items.map(adminBookingToDto),
      total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 25,
    };
  }

  /** A rep's self-service view — every booking currently assigned to them, any status. */
  async listMine(staff: AuthenticatedStaff, filters: { status?: BookingStatus; page?: number; pageSize?: number }) {
    if (!staff.salesRepId) {
      throw new BadRequestException("Your staff account isn't linked to a Sales Rep record — ask an Admin to link one.");
    }
    const { items, total } = await this.bookings.findAll({ ...filters, salesRepId: staff.salesRepId });
    return {
      items: items.map(adminBookingToDto),
      total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 25,
    };
  }

  async getById(bookingId: string, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);
    return adminBookingToDto(booking);
  }

  /**
   * Reassigns which Sales_Rep__c is handling a booking. This writes straight through
   * to Salesforce (Booking__c.Sales_Rep__c) via the same BookingRepository the customer
   * flows use — the admin console has no separate/shadow copy of this data. Restricted
   * to Admin/Manager (MANAGE_BOOKINGS) — a rep hands off via handoff() instead, which is
   * scoped to bookings already assigned to them.
   */
  async assignSalesRep(bookingId: string, dto: AssignSalesRepDto, actorId: string) {
    const booking = await this.requireBooking(bookingId);
    const rep = await this.requireActiveRep(dto.salesRepId);

    booking.assignRep(rep.id);
    const saved = await this.bookings.save(booking);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_REP_REASSIGNED",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { salesRepId: rep.id },
    });

    const emailCtx = await this.emailContext.build(saved);
    if (emailCtx) await this.notifications.sendRepAssignment(rep.toProps().email, rep.toProps().name, emailCtx);

    return adminBookingToDto(saved);
  }

  /** A rep handing their own booking off to a colleague — Admin/Manager may also use it on any booking. */
  async handoff(bookingId: string, dto: AssignSalesRepDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);
    const rep = await this.requireActiveRep(dto.salesRepId);

    booking.assignRep(rep.id);
    const saved = await this.bookings.save(booking);

    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "BOOKING_REP_HANDOFF",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { salesRepId: rep.id },
    });

    const emailCtx = await this.emailContext.build(saved);
    if (emailCtx) await this.notifications.sendRepAssignment(rep.toProps().email, rep.toProps().name, emailCtx);

    return adminBookingToDto(saved);
  }

  async checkIn(bookingId: string, dto: CheckInBookingDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    booking.checkIn(dto.method);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_CHECKED_IN", bookingId, { method: dto.method });
    return adminBookingToDto(saved);
  }

  async start(bookingId: string, dto: StartDriveDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    booking.start(dto.odometerStart);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_STARTED", bookingId, { odometerStart: dto.odometerStart });
    return adminBookingToDto(saved);
  }

  async complete(bookingId: string, dto: CompleteDriveDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    booking.complete(dto.odometerEnd);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_COMPLETED", bookingId, { odometerEnd: dto.odometerEnd });
    return adminBookingToDto(saved);
  }

  async markNoShow(bookingId: string, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    booking.markNoShow();
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_NO_SHOW", bookingId, {});
    return adminBookingToDto(saved);
  }

  async setNotes(bookingId: string, dto: SetStaffNotesDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    booking.setStaffNotes(dto.notes);
    const saved = await this.bookings.save(booking);
    await this.logAction(staff, "BOOKING_NOTES_UPDATED", bookingId, {});
    return adminBookingToDto(saved);
  }

  async cancel(bookingId: string, dto: CancelBookingDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    const cancelled = await this.mutations.cancelBooking(booking, dto.reason, staff.staffUserId);
    return adminBookingToDto(cancelled);
  }

  async reschedule(bookingId: string, dto: RescheduleBookingDto, staff: AuthenticatedStaff) {
    const booking = await this.requireBooking(bookingId);
    this.assertCanActOn(staff, booking);

    const saved = await this.mutations.rescheduleBooking(booking, dto.slot, staff.staffUserId);
    return adminBookingToDto(saved);
  }

  private async requireBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} was not found.`);
    return booking;
  }

  private async requireActiveRep(salesRepId: string) {
    const rep = await this.salesReps.findById(salesRepId);
    if (!rep) throw new NotFoundException(`Sales representative ${salesRepId} was not found.`);
    if (!rep.isActive) throw new BadRequestException(`Sales representative ${salesRepId} is not active.`);
    return rep;
  }

  /** Admin/Manager(MANAGE_BOOKINGS) can act on any booking; a rep only on bookings currently assigned to them. */
  private assertCanActOn(staff: AuthenticatedStaff, booking: Booking): void {
    if (staff.role === "Admin" || staff.permissions.includes(PERMISSIONS.MANAGE_BOOKINGS)) return;
    if (staff.salesRepId && booking.salesRepId === staff.salesRepId) return;
    throw new ForbiddenException("You can only act on test drives assigned to you.");
  }

  private async logAction(staff: AuthenticatedStaff, action: string, bookingId: string, metadata: Record<string, unknown>) {
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action,
      entityType: "Booking",
      entityId: bookingId,
      metadata,
    });
  }
}
