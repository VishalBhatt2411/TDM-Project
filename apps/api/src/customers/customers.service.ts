import { randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  BookingRepository,
  HeuristicRecommendationEngine,
  Vehicle,
  VehicleRepository,
  WishlistItem,
  WishlistRepository,
} from "@tdm/domain";
import type { CustomerDashboardDto, VehicleDto, VehicleRecommendationDto } from "@tdm/types";
import { BOOKING_REPOSITORY, VEHICLE_REPOSITORY, WISHLIST_REPOSITORY } from "../infrastructure/tokens";
import { bookingToDto } from "../bookings/bookings.service";
import { vehicleToDto } from "../vehicles/vehicles.service";

const UPCOMING_STATUSES = new Set(["Requested", "Confirmed", "Waitlisted", "InProgress"]);
const recommendationEngine = new HeuristicRecommendationEngine();

@Injectable()
export class CustomersService {
  constructor(
    @Inject(WISHLIST_REPOSITORY) private readonly wishlist: WishlistRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
  ) {}

  async listWishlist(customerId: string): Promise<VehicleDto[]> {
    const items = await this.wishlist.findByCustomer(customerId);
    const vehicles = await Promise.all(items.map((item) => this.vehicles.findById(item.toProps().vehicleId)));
    return vehicles.filter((v): v is Vehicle => v !== null).map(vehicleToDto);
  }

  async addToWishlist(customerId: string, vehicleId: string): Promise<{ added: true }> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) {
      throw new ConflictException(`Vehicle ${vehicleId} was not found.`);
    }
    const existing = await this.wishlist.findByCustomer(customerId);
    if (existing.some((item) => item.toProps().vehicleId === vehicleId)) {
      return { added: true };
    }
    await this.wishlist.add(WishlistItem.create({ id: randomUUID(), customerId, vehicleId, createdAt: new Date() }));
    return { added: true };
  }

  async removeFromWishlist(customerId: string, vehicleId: string): Promise<{ removed: true }> {
    await this.wishlist.remove(customerId, vehicleId);
    return { removed: true };
  }

  async getDashboard(customerId: string): Promise<CustomerDashboardDto> {
    const [bookings, wishlistItems] = await Promise.all([
      this.bookings.findByCustomer(customerId),
      this.wishlist.findByCustomer(customerId),
    ]);

    const upcoming = bookings
      .filter((b) => UPCOMING_STATUSES.has(b.status))
      .sort((a, b) => a.toProps().slot.start.getTime() - b.toProps().slot.start.getTime());
    const past = bookings.filter((b) => !UPCOMING_STATUSES.has(b.status));
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
    const [bookings, wishlistItems] = await Promise.all([
      this.bookings.findByCustomer(customerId),
      this.wishlist.findByCustomer(customerId),
    ]);

    const priorVehicleIds = new Set([
      ...wishlistItems.map((item) => item.toProps().vehicleId),
      ...bookings.map((b) => b.vehicleId),
    ]);

    const [priorVehicles, candidatePool] = await Promise.all([
      Promise.all([...priorVehicleIds].map((id) => this.vehicles.findById(id))),
      this.vehicles.search({ status: "Available", pageSize: 50 }),
    ]);

    const wishlistedVehicles = priorVehicles.filter((v): v is Vehicle => v !== null);
    const candidates = candidatePool.items.filter((v) => !priorVehicleIds.has(v.toProps().id));

    const scored = recommendationEngine.recommend(
      { wishlistedVehicles, pastBookedVehicles: wishlistedVehicles },
      candidates,
      limit,
    );

    return scored.map((s) => ({ vehicle: vehicleToDto(s.vehicle), score: s.score, reasons: s.reasons }));
  }
}
