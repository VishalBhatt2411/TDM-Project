import { Branch, SalesRepresentative } from "./entities/branch";
import { Booking, ComplianceRecord, DriveFeedback } from "./entities/booking";
import { Customer } from "./entities/customer";
import { VehicleAllocation, WishlistItem } from "./entities/inventory";
import { SalesOpportunity } from "./entities/sales-opportunity";
import { Vehicle, VehicleStatus, VehicleVariant } from "./entities/vehicle";
import { TimeSlot } from "./value-objects";

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}

export interface VehicleSearchCriteria {
  q?: string;
  bodyType?: string;
  fuelType?: string;
  transmission?: string;
  minPrice?: number;
  maxPrice?: number;
  branchId?: string;
  status?: VehicleStatus;
  page?: number;
  pageSize?: number;
}

export interface VehicleRepository {
  findById(id: string): Promise<Vehicle | null>;
  search(criteria: VehicleSearchCriteria): Promise<{ items: Vehicle[]; total: number }>;
  findFeatured(kind: "featured" | "bestSeller" | "newLaunch", limit?: number): Promise<Vehicle[]>;
  findRelated(vehicleId: string, limit?: number): Promise<Vehicle[]>;
  save(vehicle: Vehicle): Promise<void>;
}

export interface VehicleVariantRepository {
  findByVehicle(vehicleId: string): Promise<VehicleVariant[]>;
  findById(id: string): Promise<VehicleVariant | null>;
}

export interface BranchRepository {
  findById(id: string): Promise<Branch | null>;
  findAll(): Promise<Branch[]>;
}

export interface SalesRepRepository {
  findById(id: string): Promise<SalesRepresentative | null>;
  findByBranch(branchId: string): Promise<SalesRepresentative[]>;
  findLeastLoadedForBranch(branchId: string, onDate: Date): Promise<SalesRepresentative | null>;
  /** All active reps across every branch — used by the admin console's assignment dropdown. */
  findAllActive(): Promise<SalesRepresentative[]>;
}

export interface BookingListFilter {
  status?: Booking["status"];
  branchId?: string;
  /** Scopes results to bookings assigned to a single sales rep — used for a rep's self-service view. */
  salesRepId?: string;
  page?: number;
  pageSize?: number;
}

export interface BookingRepository {
  findById(id: string): Promise<Booking | null>;
  findByCustomer(customerId: string): Promise<Booking[]>;
  /** Platform-wide booking listing for the admin console — not customer-scoped. */
  findAll(filter: BookingListFilter): Promise<{ items: Booking[]; total: number }>;
  /** Bookings for the same vehicle whose status is Confirmed/InProgress, used for conflict detection. */
  findActiveByVehicle(vehicleId: string): Promise<Booking[]>;
  findWaitlistedForVehicle(vehicleId: string): Promise<Booking[]>;
  findByRepAndDate(salesRepId: string, date: Date): Promise<Booking[]>;
  /** Returns the persisted aggregate — on first save this carries the provider-assigned id. */
  save(booking: Booking): Promise<Booking>;
  saveCompliance(record: ComplianceRecord): Promise<void>;
  saveFeedback(feedback: DriveFeedback): Promise<void>;
  findFeedbackByBooking(bookingId: string): Promise<DriveFeedback | null>;
  /** Bookings of the given status whose scheduled start falls within [start, end] — used for reminder scheduling. */
  findByStatusWithinWindow(status: Booking["status"], start: Date, end: Date): Promise<Booking[]>;
  /** Completed bookings with no linked SalesOpportunity, completed within [start, end] — used for follow-up scheduling. */
  findCompletedWithoutOpportunity(start: Date, end: Date): Promise<Booking[]>;
}

export interface WishlistRepository {
  findByCustomer(customerId: string): Promise<WishlistItem[]>;
  add(item: WishlistItem): Promise<void>;
  remove(customerId: string, vehicleId: string): Promise<void>;
}

export interface VehicleAllocationRepository {
  save(allocation: VehicleAllocation): Promise<void>;
  findById(id: string): Promise<VehicleAllocation | null>;
}

export interface SalesOpportunityRepository {
  save(opportunity: SalesOpportunity): Promise<SalesOpportunity>;
  findByBooking(bookingId: string): Promise<SalesOpportunity | null>;
}

// --- Operational store (Postgres) repositories ---

export interface AuthCredentials {
  customerId: string;
  passwordHash: string;
  /** True for a system-generated password the customer has never seen/chosen (e.g. auto-registered at booking time) — such an account has no real way to log in again once a one-time link is used, and should always be offered password setup rather than a magic link. */
  isTemporary: boolean;
}

export interface AuthRepository {
  saveCredentials(creds: AuthCredentials): Promise<void>;
  findCredentials(customerId: string): Promise<AuthCredentials | null>;
  saveOtp(customerId: string, codeHash: string, expiresAt: Date): Promise<void>;
  consumeOtp(customerId: string, code: string): Promise<boolean>;
  saveRefreshToken(customerId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  isRefreshTokenValid(customerId: string, tokenHash: string): Promise<boolean>;
  revokeRefreshToken(customerId: string, tokenHash: string): Promise<void>;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

export interface AuditLogRepository {
  append(entry: Omit<AuditLogEntry, "id" | "occurredAt">): Promise<void>;
  query(filter: { entityType?: string; actorId?: string; limit?: number }): Promise<AuditLogEntry[]>;
}

export interface DashboardSummary {
  todaysTestDrives: number;
  upcomingBookings: number;
  vehicleUtilizationPct: number;
  cancellationRatePct: number;
  conversionRatePct: number;
  bookingTrend: { date: string; count: number }[];
  branchPerformance: { branchId: string; branchName: string; bookings: number; conversions: number }[];
  repPerformance: { repId: string; repName: string; bookings: number; completed: number }[];
  mostRequestedVehicles: { vehicleId: string; label: string; count: number }[];
  averageNpsScore: number | null;
  averageSatisfactionRating: number | null;
}

export interface AnalyticsRepository {
  getDashboardSummary(branchId?: string): Promise<DashboardSummary>;
}

export interface FeatureFlagRepository {
  isEnabled(key: string, context?: { branchId?: string }): Promise<boolean>;
  setFlag(key: string, enabled: boolean, context?: { branchId?: string }): Promise<void>;
}

export { TimeSlot };
