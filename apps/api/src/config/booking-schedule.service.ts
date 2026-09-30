import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BookingRepository,
  BookingSchedule,
  BookingScheduleRepository,
  ResolvedBookingSchedule,
  TimeSlot,
  WEEKDAYS,
  resolveBookingSchedule,
  slotTimesFor,
} from "@tdm/domain";
import { addIsoDays, zonedDateTimeToUtc, zonedIsoDate, type VehicleAvailabilityResponse } from "@tdm/types";
import { BOOKING_REPOSITORY, BOOKING_SCHEDULE_REPOSITORY } from "../infrastructure/tokens";
import { TenantContext } from "../tenancy/tenant-context";
import { DealershipSettingsCache } from "./dealership-settings-cache";
import { RegionalSettingsService } from "./regional-settings.service";

/** One bookable slot: its wall-clock start on the dealership's clock, and the instants it spans. */
export interface DaySlot {
  time: string;
  start: Date;
  end: Date;
}

/**
 * Who is booking: a customer must give the schedule's minimum notice; staff (booking a walk-in,
 * or moving a booking for a customer) may take any slot that hasn't started yet.
 */
export type BookingAudience = "customer" | "staff";

type DayAvailability = Pick<VehicleAvailabilityResponse, "timeZone" | "slots" | "isOpen" | "earliestDate">;

function durationLabel(minutes: number): string {
  const units: [number, string][] = [
    [24 * 60, "day"],
    [60, "hour"],
    [1, "minute"],
  ];
  const parts: string[] = [];
  let rest = minutes;
  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (count) parts.push(`${count} ${name}${count > 1 ? "s" : ""}`);
    rest %= size;
  }
  return parts.join(" ");
}

/**
 * Resolves when a dealership takes test drives — its own schedule, else the company's, else
 * the data provider org's default business hours (see resolveBookingSchedule) — and is the one
 * place a day's slots are generated, so availability and booking validation can't drift apart.
 */
@Injectable()
export class BookingScheduleService {
  private readonly cache = new DealershipSettingsCache<ResolvedBookingSchedule>();

  constructor(
    @Inject(BOOKING_SCHEDULE_REPOSITORY) private readonly schedules: BookingScheduleRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    private readonly regional: RegionalSettingsService,
  ) {}

  /** The schedule for `dealershipId`, else the current host dealership's, else the company's. */
  async resolve(dealershipId: string | undefined = TenantContext.hostDealershipId()): Promise<ResolvedBookingSchedule> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Unknown dealership.");

    return this.cache.getOrLoad(organizationId, dealershipId, async () => {
      const [own, company, providerHours] = await Promise.all([
        dealershipId ? this.schedules.findLayer(dealershipId) : Promise.resolve(null),
        this.schedules.findLayer(),
        this.schedules.findProviderHours(),
      ]);
      const layers = [own, company].filter((layer): layer is BookingSchedule => !!layer);
      return resolveBookingSchedule(layers, providerHours);
    });
  }

  /**
   * A vehicle's slots on `isoDate` that `audience` may still book — slots too soon are left out,
   * and one overlapping a Confirmed/InProgress booking of that vehicle is `available: false`.
   */
  async vehicleDay(
    vehicle: { id: string; dealershipId: string },
    isoDate: string,
    audience: BookingAudience,
    now: Date = new Date(),
  ): Promise<DayAvailability> {
    const [activeBookings, schedule, { timeZone }] = await Promise.all([
      this.bookings.findActiveByVehicle(vehicle.id),
      this.resolve(vehicle.dealershipId),
      this.regional.resolve(vehicle.dealershipId),
    ]);
    const from = this.bookableFrom(schedule, audience, now);
    const scheduled = this.slotsOn(schedule, timeZone, isoDate);
    const earliestDate = this.earliestDate(schedule, timeZone, from);
    return {
      timeZone,
      isOpen: scheduled.length > 0,
      ...(earliestDate ? { earliestDate } : {}),
      slots: scheduled
        .filter((slot) => slot.start >= from)
        .map((candidate) => {
          const candidateSlot = TimeSlot.create(candidate.start, candidate.end);
          return {
            time: candidate.time,
            start: candidate.start.toISOString(),
            end: candidate.end.toISOString(),
            available: !activeBookings.some((booking) => candidateSlot.overlaps(booking.toProps().slot)),
          };
        }),
    };
  }

  /** Rejects a slot that isn't exactly one of the dealership's scheduled slots on its day, or that `audience` can no longer book. */
  async assertBookable(dealershipId: string | undefined, slot: TimeSlot, audience: BookingAudience, now: Date = new Date()): Promise<void> {
    const [schedule, { timeZone }] = await Promise.all([this.resolve(dealershipId), this.regional.resolve(dealershipId)]);
    const slots = this.slotsOn(schedule, timeZone, zonedIsoDate(slot.start, timeZone));
    const matches = slots.some((s) => s.start.getTime() === slot.start.getTime() && s.end.getTime() === slot.end.getTime());
    if (!matches) throw new BadRequestException("That time isn't a bookable slot at this dealership — pick one of the times offered.");

    if (slot.start < now) throw new BadRequestException("That time has already passed — pick a later one.");
    if (slot.start < this.bookableFrom(schedule, audience, now)) {
      throw new BadRequestException(`Test drives here need to be booked at least ${durationLabel(schedule.minNoticeMinutes)} ahead.`);
    }
  }

  /** Drops cached schedules after an edit: one dealership's, or — for a company-wide edit — all of the organization's. */
  invalidate(organizationId: string, dealershipId?: string): void {
    this.cache.invalidate(organizationId, dealershipId);
  }

  /** The first instant `audience` may book a slot starting at. */
  private bookableFrom(schedule: ResolvedBookingSchedule, audience: BookingAudience, now: Date): Date {
    const noticeMinutes = audience === "customer" ? schedule.minNoticeMinutes : 0;
    return new Date(now.getTime() + noticeMinutes * 60_000);
  }

  /** The scheduled slots of `isoDate` (a calendar date on the dealership's clock). */
  private slotsOn(schedule: ResolvedBookingSchedule, timeZone: string, isoDate: string): DaySlot[] {
    return slotTimesFor(schedule, isoDate).map(({ time, minutes }) => {
      const start = zonedDateTimeToUtc(isoDate, time, timeZone);
      return { time, start, end: new Date(start.getTime() + minutes * 60_000) };
    });
  }

  /**
   * The first date with a slot starting at or after `from`. The schedule repeats weekly, so if
   * none falls within a week and a day of it, none ever will (undefined: the schedule is shut).
   */
  private earliestDate(schedule: ResolvedBookingSchedule, timeZone: string, from: Date): string | undefined {
    const firstDate = zonedIsoDate(from, timeZone);
    for (let offset = 0; offset <= WEEKDAYS.length; offset++) {
      const date = addIsoDays(firstDate, offset);
      if (this.slotsOn(schedule, timeZone, date).some((slot) => slot.start >= from)) return date;
    }
    return undefined;
  }
}
