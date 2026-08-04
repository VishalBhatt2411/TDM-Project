import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogRepository, BookingRepository, BookingStatus, SalesRepRepository } from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, BOOKING_REPOSITORY, SALES_REP_REPOSITORY } from "../infrastructure/tokens";
import { bookingToDto } from "../bookings/bookings.service";
import { AssignSalesRepDto } from "./dto";

@Injectable()
export class AdminBookingsService {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
  ) {}

  async list(filters: { status?: BookingStatus; branchId?: string; page?: number; pageSize?: number }) {
    const { items, total } = await this.bookings.findAll(filters);
    return {
      items: items.map(bookingToDto),
      total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 25,
    };
  }

  async getById(bookingId: string) {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} was not found.`);
    return bookingToDto(booking);
  }

  /**
   * Reassigns which Sales_Rep__c is handling a booking. This writes straight through
   * to Salesforce (Booking__c.Sales_Rep__c) via the same BookingRepository the customer
   * flows use — the admin console has no separate/shadow copy of this data.
   */
  async assignSalesRep(bookingId: string, dto: AssignSalesRepDto, actorId: string) {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} was not found.`);

    const rep = await this.salesReps.findById(dto.salesRepId);
    if (!rep) throw new NotFoundException(`Sales representative ${dto.salesRepId} was not found.`);

    booking.assignRep(rep.id);
    const saved = await this.bookings.save(booking);

    await this.auditLog.append({
      actorId,
      action: "BOOKING_REP_REASSIGNED",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { salesRepId: rep.id },
    });

    return bookingToDto(saved);
  }
}
