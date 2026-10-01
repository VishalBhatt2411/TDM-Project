import { adminApiClient } from "@/lib/admin-api-client";
import type { RegionalSettingsDto } from "@/api/config";
import type {
  AdminBookingDto,
  BookingDto,
  BookingStatus,
  ComplianceStatusDto,
  LicenseAiAssessment,
  Paginated,
  VehicleAvailabilityResponse,
  VehicleDto,
} from "@tdm/types";

export type StaffRole = "Company_Admin" | "Dealer_Admin" | "Manager" | "Sales_Rep";

/** A Salesforce user holding a role — Company Admins span every dealership, every other role is tied to one. */
export interface StaffAssignmentDto {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role: StaffRole;
  dealershipId?: string;
  branchId?: string;
  isActive: boolean;
  maxDailyBookings?: number;
  phone?: string;
}

export interface StaffDirectoryUserDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export interface CreateStaffAssignmentRequest {
  userId: string;
  role: StaffRole;
  dealershipId?: string;
  branchId?: string;
  maxDailyBookings?: number;
  phone?: string;
}

/** `null` clears an optional field; an omitted field is left unchanged. */
export interface UpdateStaffAssignmentRequest {
  role?: StaffRole;
  dealershipId?: string | null;
  branchId?: string | null;
  maxDailyBookings?: number | null;
  phone?: string | null;
  isActive?: boolean;
}

export async function listStaffAssignments(): Promise<StaffAssignmentDto[]> {
  const { data } = await adminApiClient.get<StaffAssignmentDto[]>("/admin/users");
  return data;
}

/** Active Salesforce users who can be granted access. */
export async function searchStaffDirectory(q?: string): Promise<StaffDirectoryUserDto[]> {
  const { data } = await adminApiClient.get<StaffDirectoryUserDto[]>("/admin/users/directory", { params: { q: q || undefined } });
  return data;
}

export async function createStaffAssignment(input: CreateStaffAssignmentRequest): Promise<StaffAssignmentDto> {
  const { data } = await adminApiClient.post<StaffAssignmentDto>("/admin/users", input);
  return data;
}

export async function updateStaffAssignment(id: string, input: UpdateStaffAssignmentRequest): Promise<StaffAssignmentDto> {
  const { data } = await adminApiClient.patch<StaffAssignmentDto>(`/admin/users/${id}`, input);
  return data;
}

export interface AdminBookingListQuery {
  status?: BookingStatus;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminBookings(query: AdminBookingListQuery): Promise<Paginated<AdminBookingDto>> {
  const { data } = await adminApiClient.get<Paginated<AdminBookingDto>>("/admin/bookings", { params: query });
  return data;
}

export interface RepBookingListQuery {
  status?: BookingStatus;
  page?: number;
  pageSize?: number;
}

/** Bookings currently assigned to the signed-in staff member. */
export async function listMyAssignedBookings(query: RepBookingListQuery): Promise<Paginated<AdminBookingDto>> {
  const { data } = await adminApiClient.get<Paginated<AdminBookingDto>>("/admin/bookings/mine", { params: query });
  return data;
}

export async function assignSalesRep(bookingId: string, salesRepId: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/assign-rep`, { salesRepId });
  return data;
}

/** A rep handing their own booking off to a colleague. */
export async function handoffBooking(bookingId: string, salesRepId: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/handoff`, { salesRepId });
  return data;
}

export async function checkInBookingAsStaff(bookingId: string, method: "QR" | "Manual", qrToken?: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/check-in`, { method, qrToken });
  return data;
}

export async function startDriveAsStaff(bookingId: string, odometerStart: number): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/start`, { odometerStart });
  return data;
}

export async function completeDriveAsStaff(bookingId: string, odometerEnd: number): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/complete`, { odometerEnd });
  return data;
}

export async function markNoShowAsStaff(bookingId: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/no-show`, {});
  return data;
}

export async function setBookingStaffNotes(bookingId: string, notes: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/notes`, { notes });
  return data;
}

export async function cancelBookingAsStaff(bookingId: string, reason: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/cancel`, { reason });
  return data;
}

export async function rescheduleBookingAsStaff(bookingId: string, slot: { start: string; end: string }): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/reschedule`, { slot });
  return data;
}

/** The slots a booking can be moved to on `date` (a calendar date on its dealership's clock). */
export async function getBookingSlotsAsStaff(bookingId: string, date: string): Promise<VehicleAvailabilityResponse> {
  const { data } = await adminApiClient.get<VehicleAvailabilityResponse>(`/admin/bookings/${bookingId}/slots`, { params: { date } });
  return data;
}

export interface SalesRepLookupDto {
  id: string;
  name: string;
  email: string;
  dealershipId?: string;
  branchId?: string;
}

export interface BranchLookupDto {
  id: string;
  name: string;
  dealershipId: string;
}

export interface DealershipLookupDto {
  id: string;
  name: string;
  /** IANA zone the dealership operates in — its bookings' times are shown in it. */
  timeZone: string;
  /** Whether staff there may check drives in by scanning the customer's QR code. */
  qrCheckIn: boolean;
}

export async function listSalesRepsLookup(): Promise<SalesRepLookupDto[]> {
  const { data } = await adminApiClient.get<SalesRepLookupDto[]>("/admin/lookups/sales-reps");
  return data;
}

export async function listBranchesLookup(): Promise<BranchLookupDto[]> {
  const { data } = await adminApiClient.get<BranchLookupDto[]>("/admin/lookups/branches");
  return data;
}

/** Active dealerships the signed-in staff member holds an assignment at (all of them for a Company Admin). */
export async function listDealershipsLookup(): Promise<DealershipLookupDto[]> {
  const { data } = await adminApiClient.get<DealershipLookupDto[]>("/admin/lookups/dealerships");
  return data;
}

export interface DashboardSummaryDto {
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

export async function getAdminDashboardSummary(periodDays: number, branchId?: string): Promise<DashboardSummaryDto> {
  const { data } = await adminApiClient.get<DashboardSummaryDto>("/analytics/dashboard", { params: { branchId, periodDays } });
  return data;
}

export interface FunnelStageCountsDto {
  requested: number;
  confirmed: number;
  completed: number;
  opportunitiesCreated: number;
}

export interface FunnelInsightDto {
  conversionRate: number;
  dropOffStage: "requested-to-confirmed" | "confirmed-to-completed" | "completed-to-opportunity" | "none";
  summary: string;
}

export async function getFunnelInsight(
  periodDays: number,
  branchId?: string,
): Promise<{ counts: FunnelStageCountsDto; insight: FunnelInsightDto }> {
  const { data } = await adminApiClient.get<{ counts: FunnelStageCountsDto; insight: FunnelInsightDto }>("/analytics/funnel", {
    params: { branchId, periodDays },
  });
  return data;
}

export interface CustomerSegmentCountsDto {
  converted: number;
  dormant: number;
  repeatVisitors: number;
  activeShoppers: number;
  newProspects: number;
}

export async function getCustomerSegments(dormantAfterDays: number, branchId?: string): Promise<CustomerSegmentCountsDto> {
  const { data } = await adminApiClient.get<CustomerSegmentCountsDto>("/analytics/customer-segments", {
    params: { branchId, dormantAfterDays },
  });
  return data;
}

/** Where a config setting applies: a branch, a dealership, or (neither) company-wide. */
export interface ConfigScopeParams {
  dealershipId?: string;
  branchId?: string;
}

export interface FeatureFlagDto {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** What the flag is when set nowhere. */
  defaultEnabled: boolean;
  /** The scope the effective value comes from — "default" means nothing is set anywhere. */
  source: "branch" | "dealership" | "company" | "default";
}

export async function listFeatureFlags(scope: ConfigScopeParams): Promise<FeatureFlagDto[]> {
  const { data } = await adminApiClient.get<FeatureFlagDto[]>("/admin/feature-flags", { params: scope });
  return data;
}

export async function setFeatureFlag(key: string, enabled: boolean, scope: ConfigScopeParams): Promise<void> {
  await adminApiClient.put(`/admin/feature-flags/${key}`, { enabled, ...scope });
}

/** Removes the setting at exactly this scope so the flag inherits from the next wider one. */
export async function clearFeatureFlag(key: string, scope: ConfigScopeParams): Promise<void> {
  await adminApiClient.delete(`/admin/feature-flags/${key}`, { params: scope });
}

export type CustomDomainStatus = "live" | "pending" | "conflict";

export interface CustomDomainDto {
  hostname: string;
  status: CustomDomainStatus;
  /** DNS TXT record proving ownership — present until the domain is live. */
  verification?: { name: string; value: string };
}

export interface SiteDomainsDto {
  /** null for the company-wide site. */
  dealershipId: string | null;
  name: string;
  platformHost?: string;
  customDomains: CustomDomainDto[];
}

export interface CustomDomainsDto {
  /** Host a custom domain's CNAME record must point at. */
  target: string;
  sites: SiteDomainsDto[];
}

export async function listCustomDomains(): Promise<CustomDomainsDto> {
  const { data } = await adminApiClient.get<CustomDomainsDto>("/admin/domains");
  return data;
}

export async function addCompanyDomain(hostname: string): Promise<CustomDomainDto> {
  const { data } = await adminApiClient.post<CustomDomainDto>("/admin/domains", { hostname });
  return data;
}

export async function removeCompanyDomain(hostname: string): Promise<void> {
  await adminApiClient.delete(`/admin/domains/${encodeURIComponent(hostname)}`);
}

/** null clears the dealership's domain. */
export async function setDealershipDomain(dealershipId: string, hostname: string | null): Promise<void> {
  await adminApiClient.put(`/admin/domains/dealerships/${dealershipId}`, { hostname });
}

export async function verifyCustomDomain(hostname: string, dealershipId: string | null): Promise<CustomDomainDto> {
  const { data } = await adminApiClient.post<CustomDomainDto>("/admin/domains/verify", {
    hostname,
    ...(dealershipId ? { dealershipId } : {}),
  });
  return data;
}

export interface AuditLogEntryDto {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Absent for a company-wide change — only unrestricted viewers see those. */
  dealershipId?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface AuditLogQuery {
  entityType?: string;
  actorId?: string;
  limit?: number;
}

export async function queryAuditLog(query: AuditLogQuery): Promise<AuditLogEntryDto[]> {
  const { data } = await adminApiClient.get<AuditLogEntryDto[]>("/admin/audit-log", { params: query });
  return data;
}

export interface AdminBranchDto {
  id: string;
  dealershipId: string;
  name: string;
  address: { line1: string; city: string; state: string; postalCode: string; country: string };
  geo?: { latitude: number; longitude: number };
  phone?: string;
  email?: string;
  operatingHours?: string;
  managerName?: string;
  isActive: boolean;
}

export interface BranchInput {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Omitted leaves the stored pin unchanged on update; null clears it. */
  geo?: { latitude: number; longitude: number } | null;
  phone?: string;
  email?: string;
  operatingHours?: string;
  managerName?: string;
}

export async function listAdminBranches(): Promise<AdminBranchDto[]> {
  const { data } = await adminApiClient.get<AdminBranchDto[]>("/admin/branches");
  return data;
}

/** A branch's dealership is fixed at creation, so it is only ever sent here. */
export async function createBranch(input: BranchInput & { dealershipId: string }): Promise<AdminBranchDto> {
  const { data } = await adminApiClient.post<AdminBranchDto>("/admin/branches", input);
  return data;
}

export async function updateBranch(id: string, input: BranchInput): Promise<AdminBranchDto> {
  const { data } = await adminApiClient.patch<AdminBranchDto>(`/admin/branches/${id}`, input);
  return data;
}

export async function setBranchActive(id: string, active: boolean): Promise<AdminBranchDto> {
  const { data } = await adminApiClient.patch<AdminBranchDto>(`/admin/branches/${id}/${active ? "activate" : "deactivate"}`);
  return data;
}

export interface AdminVehicleInput {
  make: string;
  model: string;
  trim?: string;
  year: number;
  vin: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  price: number;
  priceMax?: number;
  odometer?: number;
  status?: string;
  branchId: string;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  isNewLaunch?: boolean;
  availabilityStatus?: string;
  seatingCapacity?: number;
  mileageKmpl?: number;
  primaryImageUrl?: string;
  description?: string;
}

export async function listAdminVehicles(): Promise<VehicleDto[]> {
  const { data } = await adminApiClient.get<VehicleDto[]>("/admin/vehicles");
  return data;
}

export async function createVehicle(input: AdminVehicleInput): Promise<VehicleDto> {
  const { data } = await adminApiClient.post<VehicleDto>("/admin/vehicles", input);
  return data;
}

export async function updateVehicle(id: string, input: AdminVehicleInput): Promise<VehicleDto> {
  // PATCH is a partial update: an omitted key is left unchanged server-side, so a field
  // the user emptied must be sent as an explicit null to be cleared.
  const body = {
    ...input,
    priceMax: input.priceMax ?? null,
    seatingCapacity: input.seatingCapacity ?? null,
    mileageKmpl: input.mileageKmpl ?? null,
  };
  const { data } = await adminApiClient.patch<VehicleDto>(`/admin/vehicles/${id}`, body);
  return data;
}

export async function deleteVehicle(id: string): Promise<void> {
  await adminApiClient.delete(`/admin/vehicles/${id}`);
}

export type AllocationStatus = "Requested" | "In_Transit" | "Completed" | "Cancelled";

export interface VehicleAllocationDto {
  id: string;
  vehicleId: string;
  fromBranchId?: string;
  toBranchId: string;
  transferDate?: string;
  status: AllocationStatus;
}

export async function listVehicleAllocations(status?: AllocationStatus): Promise<VehicleAllocationDto[]> {
  const { data } = await adminApiClient.get<VehicleAllocationDto[]>("/admin/vehicle-allocations", { params: { status } });
  return data;
}

export async function requestVehicleAllocation(input: { vehicleId: string; fromBranchId?: string; toBranchId: string }): Promise<VehicleAllocationDto> {
  const { data } = await adminApiClient.post<VehicleAllocationDto>("/admin/vehicle-allocations", input);
  return data;
}

export async function advanceVehicleAllocation(id: string, action: "transit" | "complete" | "cancel"): Promise<VehicleAllocationDto> {
  const { data } = await adminApiClient.patch<VehicleAllocationDto>(`/admin/vehicle-allocations/${id}/${action}`);
  return data;
}

export interface SystemHealthDto {
  status: "ok" | "degraded" | "down";
  checkedAt: string;
  components: { name: string; status: "ok" | "degraded" | "down"; latencyMs?: number; message?: string }[];
}

export async function getSystemHealth(): Promise<SystemHealthDto> {
  const { data } = await adminApiClient.get<SystemHealthDto>("/admin/system-health");
  return data;
}

export interface NotificationTemplateDto {
  key: string;
  label: string;
  defaultSubject: string;
  subject?: string;
  note?: string;
  isCustomized: boolean;
  updatedAt?: string;
  /** The company-wide override a dealership inherits when it has none of its own. */
  inherited?: { subject?: string; note?: string };
}

export async function listNotificationTemplates(dealershipId?: string): Promise<NotificationTemplateDto[]> {
  const { data } = await adminApiClient.get<NotificationTemplateDto[]>("/admin/notification-templates", { params: { dealershipId } });
  return data;
}

export async function updateNotificationTemplate(
  key: string,
  input: { subject?: string; note?: string },
  dealershipId?: string,
): Promise<void> {
  await adminApiClient.put(`/admin/notification-templates/${key}`, { ...input, dealershipId });
}

export async function revertNotificationTemplate(key: string, dealershipId?: string): Promise<void> {
  await adminApiClient.delete(`/admin/notification-templates/${key}`, { params: { dealershipId } });
}

export interface BrandingFieldsDto {
  tagline?: string;
  logoText?: string;
  logoUrl?: string;
  primaryColorHex?: string;
  phone?: string;
  email?: string;
  address?: string;
  operatingHours?: string;
}

export type BrandImageKind = "logo" | "hero";

export interface SiteContentDto {
  logoAssetId?: string;
  heroImageUrl?: string;
  heroImageAssetId?: string;
  sections?: Record<string, boolean>;
  copy?: Record<string, Record<string, string>>;
}

export interface BrandLayerDto {
  branding: BrandingFieldsDto;
  content: SiteContentDto;
}

export interface BrandingEditorDto {
  name: string;
  own: BrandLayerDto;
  /** The company-wide layer a dealership inherits unset fields from; null when editing company-wide. */
  inherited: BrandLayerDto | null;
  /** The server's field rules, so the form mirrors them instead of duplicating them. */
  schema: {
    brandingMaxLength: Partial<Record<keyof BrandingFieldsDto, number>>;
    copyMaxLength: Record<string, number>;
    sectionKeys: string[];
    imageContentTypes: Record<BrandImageKind, string[]>;
    maxImageBytes: Record<BrandImageKind, number>;
  };
}

export async function getBranding(scope: ConfigScopeParams): Promise<BrandingEditorDto> {
  const { data } = await adminApiClient.get<BrandingEditorDto>("/admin/branding", { params: scope });
  return data;
}

/** Replaces the whole layer at this scope — anything omitted inherits again. */
export async function saveBranding(scope: ConfigScopeParams, layer: BrandLayerDto): Promise<BrandingEditorDto> {
  const { data } = await adminApiClient.put<BrandingEditorDto>("/admin/branding", layer, { params: scope });
  return data;
}

/** Stores an image for this scope without applying it; the returned id is applied by the next save. */
export async function uploadBrandImage(
  scope: ConfigScopeParams,
  input: { kind: BrandImageKind; contentType: string; dataBase64: string },
): Promise<{ assetId: string; url: string }> {
  const { data } = await adminApiClient.post<{ assetId: string; url: string }>("/admin/branding/images", input, { params: scope });
  return data;
}

/** The company-wide regional settings — how the console formats values not tied to one dealership. */
export async function getAdminRegional(): Promise<RegionalSettingsDto> {
  const { data } = await adminApiClient.get<RegionalSettingsDto>("/admin/lookups/regional");
  return data;
}

/** One scope's own regional settings; an unset field inherits. */
export interface RegionalSettingsLayerDto {
  locale?: string;
  timeZone?: string;
  phoneCountryCode?: string;
}

export interface RegionalSettingsEditorDto {
  own: RegionalSettingsLayerDto;
  /** The company layer when editing a dealership; null company-wide. */
  inherited: RegionalSettingsLayerDto | null;
  /** The data provider org's own settings — what a field unset everywhere falls back to. */
  providerDefaults: { locale: string; timeZone: string; currencyCode: string; country?: string };
  effective: RegionalSettingsDto;
  schema: { maxLength: { locale: number; timeZone: number }; timeZones: string[] };
}

export async function getRegionalSettings(scope: ConfigScopeParams): Promise<RegionalSettingsEditorDto> {
  const { data } = await adminApiClient.get<RegionalSettingsEditorDto>("/admin/regional-settings", { params: scope });
  return data;
}

/** Replaces the whole layer at this scope — anything omitted inherits again. */
export async function saveRegionalSettings(scope: ConfigScopeParams, layer: RegionalSettingsLayerDto): Promise<RegionalSettingsEditorDto> {
  const { data } = await adminApiClient.put<RegionalSettingsEditorDto>("/admin/regional-settings", layer, { params: scope });
  return data;
}

/** A wall-clock window on the dealership's clock, "HH:MM"; `end` may be "24:00" (midnight). */
export interface TimeWindowDto {
  start: string;
  end: string;
}

/** Opening hours keyed by weekday ("monday"…); null is closed all day. */
export type WeeklyHoursDto = Record<string, TimeWindowDto | null>;

/** One scope's own booking schedule; an unset field inherits. An empty `breaks` list means no breaks. */
export interface BookingScheduleLayerDto {
  slotMinutes?: number;
  weeklyHours?: WeeklyHoursDto;
  breaks?: TimeWindowDto[];
  /** How far ahead a customer must book; staff may book any slot that hasn't started. */
  minNoticeMinutes?: number;
  /** How long before a drive a customer can still cancel or reschedule it; staff may until it starts. */
  cancellationCutoffMinutes?: number;
  /** How long before a drive check-in (and the customer's QR code) opens; it closes when the slot ends. */
  checkInOpensMinutes?: number;
  /** Days after a completed drive with no sale to send a follow-up; an empty list sends none. */
  followUpDays?: number[];
  /** This scope's own closures — they add to the company's and the org's holidays. */
  closures?: ClosureDto[];
}

/** A date with no slots — all day, or between `start` and `end` on the showroom's clock. */
export interface ClosureDto {
  date: string;
  name?: string;
  start?: string;
  end?: string;
}

export interface BookingScheduleEditorDto {
  own: BookingScheduleLayerDto;
  /** The company layer when editing a dealership; null company-wide. */
  inherited: BookingScheduleLayerDto | null;
  /** The connected org's default business hours — what opening hours fall back to. */
  providerHours: WeeklyHoursDto;
  /** The connected org's holidays — closures every scope gets. */
  providerClosures: ClosureDto[];
  /** What each field this scope leaves unset resolves to. */
  fallback: Required<BookingScheduleLayerDto>;
  effective: Required<BookingScheduleLayerDto>;
  schema: {
    slotMinutes: { min: number; max: number; step: number };
    minNoticeMinutes: { min: number; max: number; step: number };
    cancellationCutoffMinutes: { min: number; max: number; step: number };
    checkInOpensMinutes: { min: number; max: number; step: number };
    followUpDays: { min: number; max: number; maxCount: number };
    maxBreaks: number;
    maxClosures: number;
    maxClosureName: number;
    weekdays: string[];
  };
}

export async function getBookingSchedule(scope: ConfigScopeParams): Promise<BookingScheduleEditorDto> {
  const { data } = await adminApiClient.get<BookingScheduleEditorDto>("/admin/booking-schedule", { params: scope });
  return data;
}

/** Replaces the whole schedule at this scope — anything omitted inherits again. */
export async function saveBookingSchedule(scope: ConfigScopeParams, layer: BookingScheduleLayerDto): Promise<BookingScheduleEditorDto> {
  const { data } = await adminApiClient.put<BookingScheduleEditorDto>("/admin/booking-schedule", layer, { params: scope });
  return data;
}

export async function getAdminComplianceStatus(bookingId: string): Promise<ComplianceStatusDto> {
  const { data } = await adminApiClient.get<ComplianceStatusDto>(`/admin/bookings/${bookingId}/compliance`);
  return data;
}

export async function verifyLicenseAi(bookingId: string): Promise<LicenseAiAssessment> {
  const { data } = await adminApiClient.post<LicenseAiAssessment>(`/admin/bookings/${bookingId}/compliance/verify-license`);
  return data;
}

export async function confirmLicense(bookingId: string): Promise<ComplianceStatusDto> {
  const { data } = await adminApiClient.patch<ComplianceStatusDto>(`/admin/bookings/${bookingId}/compliance/confirm-license`);
  return data;
}
