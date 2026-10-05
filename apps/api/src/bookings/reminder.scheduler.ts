import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Booking, BookingRepository, CustomerRepository } from "@tdm/domain";
import { zonedDateTimeToUtc, zonedIsoDate } from "@tdm/types";
import { OrganizationRepository, ReminderLogRepository, ReminderType } from "@tdm/postgres-adapter";
import { BOOKING_REPOSITORY, CUSTOMER_REPOSITORY, ORGANIZATION_REPOSITORY, REMINDER_LOG_REPOSITORY } from "../infrastructure/tokens";
import { runForEachTenant } from "../tenancy/tenant-context";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingEmailContextService } from "../notifications/booking-email-context.service";
import { RegionalSettingsService } from "../config/regional-settings.service";
import { BookingScheduleService } from "../config/booking-schedule.service";

/**
 * Sends 24h / 2h / day-of test-drive reminders (day-of from the dealership's configured time that morning). Runs every 15 minutes and scans a
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
    private readonly schedule: BookingScheduleService,
  ) {}

  @Cron("*/15 * * * *")
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    await runForEachTenant(
      await this.organizations.listConnectedIds(),
      async () => {
        await this.processWindow("24h", addHours(now, 23), addHours(now, 25));
        await this.processWindow("2h", addHours(now, 1.5), addHours(now, 2.5));
        // Later today where each booking's dealership is, once that dealership's day-of reminder time has
        // passed: scan the next 24h, keep same-local-date slots.
        await this.processWindow("day_of", now, addHours(now, 24), (bookings) => this.dueDayOf(now, bookings));
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
      if (type === "day_of" && booking.slot.start.getTime() < Date.now()) continue; // already started/passed
      // One booking's failure must not cost the rest of the window their reminders.
      try {
        await this.remind(booking, type);
      } catch (err) {
        this.logger.error(
          JSON.stringify({ event: "reminder_failed", bookingId: booking.id, type, reason: (err as Error).message }),
        );
      }
    }
  }

  /**
   * Claim-then-send: the claim is an insert-first unique write, so two overlapping runs (multiple
   * instances, or a cron tick racing the external job trigger) can't both send. A failed send releases
   * the claim so the next tick retries. The claim comes first because the same bookings sit in the
   * scan window for several ticks — the already-reminded ones must cost one cheap write, not a round of
   * data-provider lookups.
   */
  private async remind(booking: Booking, type: ReminderType): Promise<void> {
    if (!(await this.reminderLog.claim(booking.id, type))) return;
    let delivered = false;
    try {
      const customer = await this.customers.findById(booking.customerId);
      if (!customer) return;
      const ctx = await this.emailContext.build(booking, `${customer.name.firstName} ${customer.name.lastName}`);
      if (!ctx) return;
      delivered = await this.notifications.sendReminder(customer.email.value, ctx, type);
    } finally {
      if (!delivered) await this.reminderLog.release(booking.id, type);
    }
    if (delivered) this.logger.log(JSON.stringify({ event: "reminder_sent", bookingId: booking.id, type }));
    else this.logger.warn(JSON.stringify({ event: "reminder_not_delivered", bookingId: booking.id, type }));
  }

  /**
   * Bookings whose slot falls on the same calendar date as `instant` in their dealership's zone, and
   * whose dealership's day-of reminder time (its booking schedule) has been reached on that date.
   */
  private async dueDayOf(instant: Date, bookings: Booking[]): Promise<Booking[]> {
    const dealershipIds = [...new Set(bookings.map((b) => b.dealershipId))];
    const [zones, schedules] = await Promise.all([
      this.regional.timeZonesOf(dealershipIds),
      Promise.all(dealershipIds.map(async (id) => [id, await this.schedule.resolve(id)] as const)),
    ]);
    const reminderTimes = new Map(schedules.map(([id, s]) => [id, s.dayOfReminderTime]));
    return bookings.filter((b) => {
      const timeZone = zones.get(b.dealershipId)!;
      const today = zonedIsoDate(instant, timeZone);
      if (zonedIsoDate(b.slot.start, timeZone) !== today) return false;
      return instant >= zonedDateTimeToUtc(today, reminderTimes.get(b.dealershipId)!, timeZone);
    });
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
