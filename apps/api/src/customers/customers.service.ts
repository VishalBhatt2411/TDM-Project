import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BookingRepository,
  ExclusiveLock,
  HeuristicRecommendationEngine,
  RETIRED_VEHICLE_STATUSES,
  Vehicle,
  VehicleRepository,
  WishlistItem,
  WishlistRepository,
} from "@tdm/domain";
import type { CustomerDashboardDto, VehicleDto, VehicleRecommendationDto } from "@tdm/types";
import { BOOKING_REPOSITORY, EXCLUSIVE_LOCK, VEHICLE_REPOSITORY, WISHLIST_REPOSITORY } from "../infrastructure/tokens";
import { bookingToDto } from "../bookings/bookings.service";
import { FeatureFlagService } from "../config/feature-flag.service";
import { vehicleToDto } from "../vehicles/vehicles.service";

const UPCOMING_STATUSES = new Set(["Requested", "Confirmed", "Waitlisted", "InProgress"]);
/** Size of the available-stock pool recommendations are ranked from. */
const RECOMMENDATION_POOL_SIZE = 50;
const recommendationEngine = new HeuristicRecommendationEngine();

@Injectable()
export class CustomersService {
  constructor(
    @Inject(WISHLIST_REPOSITORY) private readonly wishlist: WishlistRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(EXCLUSIVE_LOCK) private readonly locks: ExclusiveLock,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async listWishlist(customerId: string): Promise<VehicleDto[]> {
    await this.featureFlags.assertEnabled("wishlist");
    const items = await this.wishlist.findByCustomer(customerId);
    const vehicles = await this.findVisible(items.map((item) => item.toProps().vehicleId));
    return [...vehicles.values()].map(vehicleToDto);
  }

  async addToWishlist(customerId: string, vehicleId: string): Promise<{ added: true }> {
    await this.featureFlags.assertEnabled("wishlist");
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found.");
    }
    if (RETIRED_VEHICLE_STATUSES.includes(vehicle.status)) {
      throw new BadRequestException("This vehicle is no longer available.");
    }
    // Check-then-add under a lock, or two simultaneous taps both pass the check and save the vehicle twice.
    await this.locks.runExclusive(`wishlist:${customerId}`, async () => {
      const existing = await this.wishlist.findByCustomer(customerId);
      if (existing.some((item) => item.toProps().vehicleId === vehicleId)) return;
      await this.wishlist.add(WishlistItem.create({ id: randomUUID(), customerId, vehicleId, createdAt: new Date() }));
    });
    return { added: true };
  }

  async removeFromWishlist(customerId: string, vehicleId: string): Promise<{ removed: true }> {
    await this.featureFlags.assertEnabled("wishlist");
    await this.wishlist.remove(customerId, vehicleId);
    return { removed: true };
  }

  async getDashboard(customerId: string): Promise<CustomerDashboardDto> {
    const [bookings, wishlistItems] = await Promise.all([
      this.bookings.findByCustomer(customerId),
      this.wishlist.findByCustomer(customerId),
    ]);

    // A booking whose slot has ended is history even if nobody closed it out.
    const now = Date.now();
    const isUpcoming = (b: (typeof bookings)[number]) => UPCOMING_STATUSES.has(b.status) && b.slot.end.getTime() > now;
    const upcoming = bookings.filter(isUpcoming).sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
    const past = bookings.filter((b) => !isUpcoming(b));
    const recent = [...bookings]
      .sort((a, b) => b.toProps().createdAt.getTime() - a.toProps().createdAt.getTime())
      .slice(0, 5);

    return {
      upcomingBookingsCount: upcoming.length,
      pastBookingsCount: past.length,
      wishlistCount: wishlistItems.length,
      nextBooking: upcoming[0] ? bookingToDto(upcoming[0]) : null,
      recentBookings: recent.map(bookingToDto),
    };
  }

  /** Heuristic recommendations (see packages/domain HeuristicRecommendationEngine) scored from this customer's wishlist + booking history. */
  async getRecommendations(customerId: string, limit = 6): Promise<VehicleRecommendationDto[]> {
    await this.featureFlags.assertEnabled("ai_recommendations");
    const [bookings, wishlistItems] = await Promise.all([
      this.bookings.findByCustomer(customerId),
      this.wishlist.findByCustomer(customerId),
    ]);

    const wishlistedIds = wishlistItems.map((item) => item.toProps().vehicleId);
    const bookedIds = bookings.map((b) => b.vehicleId);
    const priorVehicleIds = new Set([...wishlistedIds, ...bookedIds]);

    const [priorVehicles, candidatePool] = await Promise.all([
      this.findVisible(priorVehicleIds),
      this.vehicles.search({ status: "Available", pageSize: RECOMMENDATION_POOL_SIZE }),
    ]);

    const pick = (ids: string[]) => [...new Set(ids)].flatMap((id) => priorVehicles.get(id) ?? []);
    const candidates = candidatePool.items.filter((v) => !priorVehicleIds.has(v.toProps().id));

    const scored = recommendationEngine.recommend(
      { wishlistedVehicles: pick(wishlistedIds), pastBookedVehicles: pick(bookedIds) },
      candidates,
      limit,
    );

    return scored.map((s) => ({ vehicle: vehicleToDto(s.vehicle), score: s.score, reasons: s.reasons }));
  }

  /** Each distinct vehicle once, keyed by id — dropping any that no longer exist. */
  private async findVisible(ids: Iterable<string>): Promise<Map<string, Vehicle>> {
    const vehicles = await Promise.all([...new Set(ids)].map((id) => this.vehicles.findById(id)));
    return new Map(vehicles.filter((v): v is Vehicle => v !== null).map((v) => [v.toProps().id, v]));
  }
}
