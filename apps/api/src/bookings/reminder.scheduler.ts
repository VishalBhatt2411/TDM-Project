import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Booking, BookingRepository, BranchRepository, CustomerRepository, SalesRepRepository, VehicleRepository } from "@tdm/domain";
import { ReminderLogRepository, ReminderType } from "@tdm/postgres-adapter";
import {
  BOOKING_REPOSITORY,
  BRANCH_REPOSITORY,
  CUSTOMER_REPOSITORY,
  REMINDER_LOG_REPOSITORY,
  SALES_REP_REPOSITORY,
  VEHICLE_REPOSITORY,
} from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContext } from "../notifications/email-templates";

/**
 * Sends 24h / 2h / day-of test-drive reminders. Runs every 15 minutes and scans a
 * window around each threshold; ReminderLogRepository guarantees each booking gets
 * at most one reminder per type even though the window is scanned repeatedly.
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(REMINDER_LOG_REPOSITORY) private readonly reminderLog: ReminderLogRepository,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron("*/15 * * * *")
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    await this.processWindow("24h", addHours(now, 23), addHours(now, 25));
    await this.processWindow("2h", addHours(now, 1.5), addHours(now, 2.5));
    await this.processWindow("day_of", startOfDay(now), endOfDay(now));
  }

  private async processWindow(type: ReminderType, start: Date, end: Date): Promise<void> {
    const candidates = await this.bookings.findByStatusWithinWindow("Confirmed", start, end);
    const alsoRequested = await this.bookings.findByStatusWithinWindow("Requested", start, end);

    for (const booking of [...candidates, ...alsoRequested]) {
      if (await this.reminderLog.wasSent(booking.id, type)) continue;
      if (type === "day_of" && booking.slot.start.getTime() < Date.now()) continue; // already started/passed

      const ctx = await this.buildEmailContext(booking);
      const customer = await this.customers.findById(booking.customerId);
      if (ctx && customer) {
        await this.notifications.sendReminder(customer.email.value, ctx, type);
        await this.reminderLog.markSent(booking.id, type);
        this.logger.log(`Sent ${type} reminder for booking ${booking.id}`);
      }
    }
  }

  private async buildEmailContext(booking: Booking): Promise<BookingEmailContext | null> {
    const [vehicle, branch, rep] = await Promise.all([
      this.vehicles.findById(booking.vehicleId),
      this.branches.findById(booking.branchId),
      booking.salesRepId ? this.salesReps.findById(booking.salesRepId) : Promise.resolve(null),
    ]);
    if (!vehicle || !branch) return null;
    const vehicleProps = vehicle.toProps();
    const branchProps = branch.toProps();
    const customer = await this.customers.findById(booking.customerId);
    return {
      customerName: customer ? `${customer.name.firstName} ${customer.name.lastName}` : "there",
      vehicleLabel: `${vehicleProps.year} ${vehicleProps.make} ${vehicleProps.model}`,
      bookingReference: booking.id,
      scheduledStart: booking.slot.start,
      driveType: booking.toProps().driveType,
      branchName: branchProps.name,
      branchAddress: branchProps.address.line1,
      salesRepName: rep ? rep.toProps().name : undefined,
    };
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
