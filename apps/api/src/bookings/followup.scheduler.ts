import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BookingRepository, CustomerRepository, VehicleRepository } from "@tdm/domain";
import { FollowUpLogRepository } from "@tdm/postgres-adapter";
import { BOOKING_REPOSITORY, CUSTOMER_REPOSITORY, FOLLOW_UP_LOG_REPOSITORY, VEHICLE_REPOSITORY } from "../infrastructure/tokens";
import { NotificationsService } from "../notifications/notifications.service";

const FOLLOW_UP_INTERVALS_DAYS = [3, 7, 14];

/**
 * Once a day, checks completed test drives with no resulting sales opportunity and
 * sends a follow-up nudge at 3/7/14 days post-drive. FollowUpLogRepository ensures
 * each (booking, interval) pair is only ever sent once.
 */
@Injectable()
export class FollowUpScheduler {
  private readonly logger = new Logger(FollowUpScheduler.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(FOLLOW_UP_LOG_REPOSITORY) private readonly followUpLog: FollowUpLogRepository,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron("0 10 * * *")
  async sendDueFollowUps(): Promise<void> {
    const now = new Date();
    for (const days of FOLLOW_UP_INTERVALS_DAYS) {
      await this.processInterval(days, now);
    }
  }

  private async processInterval(days: number, now: Date): Promise<void> {
    const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const start = startOfDay(target);
    const end = endOfDay(target);

    const candidates = await this.bookings.findCompletedWithoutOpportunity(start, end);
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
        `${customer.name.firstName} ${customer.name.lastName}`,
        `${vehicleProps.year} ${vehicleProps.make} ${vehicleProps.model}`,
        days,
      );
      await this.followUpLog.markSent(booking.id, days);
      this.logger.log(`Sent ${days}-day follow-up for booking ${booking.id}`);
    }
  }
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
