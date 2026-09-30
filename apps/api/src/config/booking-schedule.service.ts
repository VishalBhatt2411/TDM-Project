import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BookingRepository,
  BookingSchedule,
  BookingScheduleRepository,
  ResolvedBookingSchedule,
  TimeSlot,
  resolveBookingSchedule,
  slotTimesFor,
} from "@tdm/domain";
import { zonedDateTimeToUtc, zonedIsoDate, type VehicleAvailabilityResponse } from "@tdm/types";
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

  /** The bookable slots of `isoDate` (a calendar date on the dealership's clock), and that clock's zone. */
  async daySlots(dealershipId: string | undefined, isoDate: string): Promise<{ timeZone: string; slots: DaySlot[] }> {
    const [schedule, { timeZone }] = await Promise.all([this.resolve(dealershipId), this.regional.resolve(dealershipId)]);
    const slots = slotTimesFor(schedule, isoDate).map(({ time, minutes }) => {
      const start = zonedDateTimeToUtc(isoDate, time, timeZone);
      return { time, start, end: new Date(start.getTime() + minutes * 60_000) };
    });
    return { timeZone, slots };
  }

  /** A vehicle's slots on `isoDate` — a slot is unavailable if it overlaps a Confirmed/InProgress booking of that vehicle. */
  async vehicleDay(
    vehicle: { id: string; dealershipId: string },
    isoDate: string,
  ): Promise<Pick<VehicleAvailabilityResponse, "timeZone" | "slots">> {
    const [activeBookings, { timeZone, slots }] = await Promise.all([
      this.bookings.findActiveByVehicle(vehicle.id),
      this.daySlots(vehicle.dealershipId, isoDate),
    ]);
    return {
      timeZone,
      slots: slots.map((candidate) => {
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

  /** Rejects a slot that isn't exactly one of the dealership's scheduled slots on its day. */
  async assertBookable(dealershipId: string | undefined, slot: TimeSlot): Promise<void> {
    const { timeZone } = await this.regional.resolve(dealershipId);
    const { slots } = await this.daySlots(dealershipId, zonedIsoDate(slot.start, timeZone));
    const matches = slots.some((s) => s.start.getTime() === slot.start.getTime() && s.end.getTime() === slot.end.getTime());
    if (!matches) throw new BadRequestException("That time isn't a bookable slot at this dealership — pick one of the times offered.");
  }

  /** Drops cached schedules after an edit: one dealership's, or — for a company-wide edit — all of the organization's. */
  invalidate(organizationId: string, dealershipId?: string): void {
    this.cache.invalidate(organizationId, dealershipId);
  }
}
