import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Booking, BookingRepository, CustomerRepository } from "@tdm/domain";
import { zonedIsoDate } from "@tdm/types";
import { OrganizationRepository, ReminderLogRepository, ReminderType } from "@tdm/postgres-adapter";
import { BOOKING_REPOSITORY, CUSTOMER_REPOSITORY, ORGANIZATION_REPOSITORY, REMINDER_LOG_REPOSITORY } from "../infrastructure/tokens";
import { runForEachTenant } from "../tenancy/tenant-context";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";
import { RegionalSettingsService } from "../config/regional-settings.service";

/**
 * Sends 24h / 2h / day-of test-drive reminders. Runs every 15 minutes and scans a
 * window around each threshold; ReminderLogRepository guarantees each booking gets
 * at most one reminder per type even though the window is scanned repeatedly.
 * Each connected tenant is processed in its own context; one org's failure never
 * blocks another's reminders.
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(REMINDER_LOG_REPOSITORY) private readonly reminderLog: ReminderLogRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    private readonly notifications: NotificationsService,
    private readonly emailContext: BookingEmailContextService,
    private readonly regional: RegionalSettingsService,
  ) {}

  @Cron("*/15 * * * *")
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    await runForEachTenant(
      await this.organizations.listConnectedIds(),
      async () => {
        await this.processWindow("24h", addHours(now, 23), addHours(now, 25));
        await this.processWindow("2h", addHours(now, 1.5), addHours(now, 2.5));
        // Later today where each booking's dealership is: scan the next 24h, keep same-local-date slots.
        await this.processWindow("day_of", now, addHours(now, 24), (bookings) => this.onLocalDateOf(now, bookings));
      },
      this.logger,
      "reminder_job_failed",
    );
  }

  private async processWindow(
    type: ReminderType,
    start: Date,
    end: Date,
    keep?: (bookings: Booking[]) => Promise<Booking[]>,
  ): Promise<void> {
    const [candidates, alsoRequested] = await Promise.all([
      this.bookings.findByStatusWithinWindow("Confirmed", start, end),
      this.bookings.findByStatusWithinWindow("Requested", start, end),
    ]);
    const due = keep ? await keep([...candidates, ...alsoRequested]) : [...candidates, ...alsoRequested];

    for (const booking of due) {
      if (await this.reminderLog.wasSent(booking.id, type)) continue;
      if (type === "day_of" && booking.slot.start.getTime() < Date.now()) continue; // already started/passed

      const ctx = await this.emailContext.build(booking);
      const customer = await this.customers.findById(booking.customerId);
      if (ctx && customer) {
        await this.notifications.sendReminder(customer.email.value, ctx, type);
        await this.reminderLog.markSent(booking.id, type);
        this.logger.log(`Sent ${type} reminder for booking ${booking.id}`);
      }
    }
  }

  /** Bookings whose slot falls on the same calendar date as `instant` in their dealership's zone. */
  private async onLocalDateOf(instant: Date, bookings: Booking[]): Promise<Booking[]> {
    const zones = await this.regional.timeZonesOf(bookings.map((b) => b.dealershipId));
    return bookings.filter((b) => {
      const timeZone = zones.get(b.dealershipId)!;
      return zonedIsoDate(b.slot.start, timeZone) === zonedIsoDate(instant, timeZone);
    });
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
