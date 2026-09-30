import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BookingRepository, CustomerRepository, DealershipRepository, VehicleRepository } from "@tdm/domain";
import { addIsoDays, zonedIsoDate } from "@tdm/types";
import { FollowUpLogRepository, OrganizationRepository } from "@tdm/postgres-adapter";
import {
  BOOKING_REPOSITORY,
  CUSTOMER_REPOSITORY,
  DEALERSHIP_REPOSITORY,
  FOLLOW_UP_LOG_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  VEHICLE_REPOSITORY,
} from "../infrastructure/tokens";
import { runForEachTenant } from "../tenancy/tenant-context";
import { NotificationsService } from "../notifications/notifications.service";
import { RegionalSettingsService } from "../config/regional-settings.service";
import { BookingScheduleService } from "../config/booking-schedule.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Once a day, checks completed test drives with no resulting sales opportunity and
 * sends a follow-up nudge on each of its dealership's follow-up days (see the booking schedule's
 * `followUpDays`) after the drive. FollowUpLogRepository ensures each (booking, interval) pair
 * is only ever sent once. Runs per connected tenant.
 */
@Injectable()
export class FollowUpScheduler {
  private readonly logger = new Logger(FollowUpScheduler.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(FOLLOW_UP_LOG_REPOSITORY) private readonly followUpLog: FollowUpLogRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
    private readonly notifications: NotificationsService,
    private readonly regional: RegionalSettingsService,
    private readonly schedule: BookingScheduleService,
  ) {}

  @Cron("0 10 * * *")
  async sendDueFollowUps(): Promise<void> {
    const now = new Date();
    await runForEachTenant(
      await this.organizations.listConnectedIds(),
      async () => {
        for (const days of await this.intervalsInUse()) {
          await this.processInterval(days, now);
        }
      },
      this.logger,
      "follow_up_job_failed",
    );
  }

  /** Every follow-up day any of the tenant's dealerships uses, ascending. */
  private async intervalsInUse(): Promise<number[]> {
    const dealerships = await this.dealerships.findAll();
    const schedules = await Promise.all(dealerships.map((d) => this.schedule.resolve(d.id)));
    return [...new Set(schedules.flatMap((s) => s.followUpDays))].sort((a, b) => a - b);
  }

  private async processInterval(days: number, now: Date): Promise<void> {
    // "N days ago" is a calendar day where each booking's dealership is. Scan a window that
    // covers that day in every zone, then keep the bookings on exactly that local date.
    const start = new Date(now.getTime() - (days + 2) * DAY_MS);
    const end = new Date(now.getTime() - (days - 2) * DAY_MS);
    const scanned = await this.bookings.findCompletedWithoutOpportunity(start, end);
    const dealershipIds = [...new Set(scanned.map((b) => b.dealershipId))];
    const [zones, schedules] = await Promise.all([
      this.regional.timeZonesOf(dealershipIds),
      Promise.all(dealershipIds.map(async (id) => [id, await this.schedule.resolve(id)] as const)),
    ]);
    const followUpDays = new Map(schedules.map(([id, s]) => [id, s.followUpDays]));
    const candidates = scanned.filter((b) => {
      if (!followUpDays.get(b.dealershipId)?.includes(days)) return false;
      const timeZone = zones.get(b.dealershipId)!;
      return zonedIsoDate(b.slot.start, timeZone) === addIsoDays(zonedIsoDate(now, timeZone), -days);
    });

    for (const booking of candidates) {
      if (await this.followUpLog.wasSent(booking.id, days)) continue;

      const [customer, vehicle] = await Promise.all([
        this.customers.findById(booking.customerId),
        this.vehicles.findById(booking.vehicleId),
      ]);
      if (!customer || !vehicle) continue;

      const vehicleProps = vehicle.toProps();
      await this.notifications.sendFollowUp(
        customer.email.value,
        booking.dealershipId,
        `${customer.name.firstName} ${customer.name.lastName}`,
        `${vehicleProps.year} ${vehicleProps.make} ${vehicleProps.model}`,
        days,
      );
      await this.followUpLog.markSent(booking.id, days);
      this.logger.log(`Sent ${days}-day follow-up for booking ${booking.id}`);
    }
  }
}
