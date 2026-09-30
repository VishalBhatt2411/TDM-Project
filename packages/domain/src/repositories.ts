import { Branch, SalesRepresentative } from "./entities/branch";
import { Booking, ComplianceRecord, DriveFeedback } from "./entities/booking";
import { Customer } from "./entities/customer";
import { Dealership } from "./entities/dealership";
import { StaffAssignment, StaffRole } from "./entities/staff-assignment";
import { VehicleAllocation, WishlistItem } from "./entities/inventory";
import { SalesOpportunity } from "./entities/sales-opportunity";
import { Vehicle, VehicleStatus, VehicleVariant } from "./entities/vehicle";
import { FunnelStageCounts } from "./services/recommendation-engine";
import { TimeSlot } from "./value-objects";

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}

/**
 * Limits a query to some dealerships. Absent `dealershipIds` means every dealership in the
 * tenant (a Company Admin, or a customer on the company-wide host); an empty list matches nothing.
 */
export interface DealershipScope {
  dealershipIds?: readonly string[];
}

export interface VehicleSearchCriteria extends DealershipScope {
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
  findFeatured(kind: "featured" | "bestSeller" | "newLaunch", limit?: number, scope?: DealershipScope): Promise<Vehicle[]>;
  /** Related vehicles always come from the same dealership as `vehicleId`. */
  findRelated(vehicleId: string, limit?: number): Promise<Vehicle[]>;
  /** Returns the persisted aggregate — on first save this carries the provider-assigned id. */
  save(vehicle: Vehicle): Promise<Vehicle>;
  delete(id: string): Promise<void>;
}

export interface VehicleVariantRepository {
  findByVehicle(vehicleId: string): Promise<VehicleVariant[]>;
  findById(id: string): Promise<VehicleVariant | null>;
}

export interface BranchRepository {
  findById(id: string): Promise<Branch | null>;
  findAll(scope?: DealershipScope): Promise<Branch[]>;
  /** Includes inactive branches, unlike findAll. */
  findAllIncludingInactive(scope?: DealershipScope): Promise<Branch[]>;
  /** Returns the persisted aggregate — on first save this carries the provider-assigned id. */
  save(branch: Branch): Promise<Branch>;
}

export interface DealershipRepository {
  /** Every dealership in the current tenant, active or not — callers filter. */
  findAll(): Promise<Dealership[]>;
  findById(id: string): Promise<Dealership | null>;
}

/** Assignable reps are users with an active Sales Rep staff assignment — see StaffAssignment. */
export interface SalesRepRepository {
  findById(id: string): Promise<SalesRepresentative | null>;
  findByBranch(branchId: string): Promise<SalesRepresentative[]>;
  /** The branch's rep with the fewest slot-occupying bookings that day, skipping reps already at their daily cap. */
  findLeastLoadedForBranch(branchId: string, onDate: Date): Promise<SalesRepresentative | null>;
  /** Active reps across the scoped dealerships — used by the admin console's assignment dropdown. */
  findAllActive(scope?: DealershipScope): Promise<SalesRepresentative[]>;
}

export interface StaffAssignmentFilter extends DealershipScope {
  userId?: string;
  role?: StaffRole;
  /** Inactive assignments are excluded unless asked for. */
  includeInactive?: boolean;
}

export interface StaffAssignmentRepository {
  findById(id: string): Promise<StaffAssignment | null>;
  /** Active assignments of an active user — the source of that user's access. Empty means no access. */
  findActiveByUser(userId: string): Promise<StaffAssignment[]>;
  /** A dealership filter keeps Company Admin assignments (no dealership) out unless the scope is unrestricted. */
  findAll(filter?: StaffAssignmentFilter): Promise<StaffAssignment[]>;
  /** Returns the persisted aggregate — on first save this carries the provider-assigned id. */
  save(assignment: StaffAssignment): Promise<StaffAssignment>;
}

/** A user of the business-data provider who can be given staff access (a Salesforce User). */
export interface StaffDirectoryUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export interface StaffDirectory {
  /** Active users matching `query` against name or email; lists the first `limit` when no query is given. */
  search(query?: string, limit?: number): Promise<StaffDirectoryUser[]>;
  findById(id: string): Promise<StaffDirectoryUser | null>;
}

export interface BookingListFilter extends DealershipScope {
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
  /** Upserts by booking — a booking has at most one compliance record, so a resubmission or staff confirmation updates it in place rather than creating a duplicate. */
  saveCompliance(record: ComplianceRecord): Promise<void>;
  findComplianceByBooking(bookingId: string): Promise<ComplianceRecord | null>;
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
  /** Returns the persisted aggregate — on first save this carries the provider-assigned id. */
  save(allocation: VehicleAllocation): Promise<VehicleAllocation>;
  findById(id: string): Promise<VehicleAllocation | null>;
  findAll(filter?: { status?: VehicleAllocation["status"] }): Promise<VehicleAllocation[]>;
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

/** Mutually exclusive, lifetime customer-lifecycle buckets for the Manager Dashboard (FR-42). Every customer with at least one booking falls into exactly one segment. */
export interface CustomerSegmentCounts {
  /** Won at least one opportunity off a booking. */
  converted: number;
  /** Not converted; no booking activity in 90+ days. */
  dormant: number;
  /** Not converted, not dormant; 2+ completed test drives. */
  repeatVisitors: number;
  /** Not converted, not dormant; exactly 1 completed test drive. */
  activeShoppers: number;
  /** Not converted, not dormant; no completed test drive yet (booking still pending/upcoming). */
  newProspects: number;
}

export interface AnalyticsScope extends DealershipScope {
  branchId?: string;
}

/** Every figure, including branch/rep breakdowns and feedback averages, is limited to the scope. */
export interface AnalyticsRepository {
  getDashboardSummary(scope?: AnalyticsScope): Promise<DashboardSummary>;
  /** Raw booking-lifecycle-stage counts (last 30 days) for funnel/conversion analysis — see HeuristicInsightEngine.analyzeFunnel. */
  getFunnelCounts(scope?: AnalyticsScope): Promise<FunnelStageCounts>;
  getCustomerSegments(scope?: AnalyticsScope): Promise<CustomerSegmentCounts>;
}

export interface FeatureFlagRepository {
  isEnabled(key: string, context?: { branchId?: string }): Promise<boolean>;
  setFlag(key: string, enabled: boolean, context?: { branchId?: string }): Promise<void>;
}

export interface NotificationTemplateOverrideRecord {
  key: string;
  subject?: string;
  note?: string;
  updatedBy?: string;
  updatedAt: Date;
}

/** Staff-editable overrides layered on top of the hardcoded email templates in
 *  apps/api/src/notifications/email-templates.ts — see NOTIFICATION_TEMPLATE_KEYS
 *  for the fixed set of keys this repository stores rows for. */
export interface NotificationTemplateRepository {
  findByKey(key: string): Promise<NotificationTemplateOverrideRecord | null>;
  findAll(): Promise<NotificationTemplateOverrideRecord[]>;
  upsert(key: string, patch: { subject?: string; note?: string }, updatedBy?: string): Promise<NotificationTemplateOverrideRecord>;
  delete(key: string): Promise<void>;
}

export type AssetPurpose = "license_photo" | "signature";

export interface StoredAsset {
  id: string;
  contentType: string;
  data: Buffer;
  purpose: AssetPurpose;
  bookingId?: string;
}

/** In-house binary storage for compliance images (license photo, canvas signature) — see NOTIFICATION_TEMPLATE_REPOSITORY's sibling operational repositories. No external blob/CDN dependency. */
export interface AssetRepository {
  save(input: { contentType: string; data: Buffer; purpose: AssetPurpose; bookingId?: string }): Promise<{ id: string }>;
  findById(id: string): Promise<StoredAsset | null>;
  deleteMany(ids: string[]): Promise<void>;
}

/** Reachability probe for the current tenant's business-data provider — keeps health checks provider-agnostic. */
export interface DataProviderHealth {
  readonly name: string;
  /** Throws when the provider is unreachable or the tenant's connection is unusable. */
  ping(): Promise<void>;
}

export { TimeSlot };
