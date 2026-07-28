import { adminApiClient } from "@/lib/admin-api-client";
import type { BookingDto, BookingStatus, Paginated } from "@tdm/types";

export interface StaffUserDto {
  id: string;
  email: string;
  name: string;
  role: "Admin" | "Manager" | "SalesRep";
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateStaffUserRequest {
  email: string;
  name: string;
  role: "Admin" | "Manager" | "SalesRep";
  permissions?: string[];
}

export interface UpdateStaffUserRequest {
  name?: string;
  email?: string;
  role?: "Admin" | "Manager" | "SalesRep";
  permissions?: string[];
  isActive?: boolean;
}

export async function listStaffUsers(): Promise<StaffUserDto[]> {
  const { data } = await adminApiClient.get<StaffUserDto[]>("/admin/users");
  return data;
}

export async function createStaffUser(input: CreateStaffUserRequest): Promise<StaffUserDto> {
  const { data } = await adminApiClient.post<StaffUserDto>("/admin/users", input);
  return data;
}

export async function updateStaffUser(id: string, input: UpdateStaffUserRequest): Promise<StaffUserDto> {
  const { data } = await adminApiClient.patch<StaffUserDto>(`/admin/users/${id}`, input);
  return data;
}

export interface AdminBookingListQuery {
  status?: BookingStatus;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminBookings(query: AdminBookingListQuery): Promise<Paginated<BookingDto>> {
  const { data } = await adminApiClient.get<Paginated<BookingDto>>("/admin/bookings", { params: query });
  return data;
}

export async function assignSalesRep(bookingId: string, salesRepId: string): Promise<BookingDto> {
  const { data } = await adminApiClient.patch<BookingDto>(`/admin/bookings/${bookingId}/assign-rep`, { salesRepId });
  return data;
}

export interface SalesRepLookupDto {
  id: string;
  name: string;
  email: string;
  branchId: string;
}

export interface BranchLookupDto {
  id: string;
  name: string;
}

export async function listSalesRepsLookup(): Promise<SalesRepLookupDto[]> {
  const { data } = await adminApiClient.get<SalesRepLookupDto[]>("/admin/lookups/sales-reps");
  return data;
}

export async function listBranchesLookup(): Promise<BranchLookupDto[]> {
  const { data } = await adminApiClient.get<BranchLookupDto[]>("/admin/lookups/branches");
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

export async function getAdminDashboardSummary(): Promise<DashboardSummaryDto> {
  const { data } = await adminApiClient.get<DashboardSummaryDto>("/analytics/dashboard");
  return data;
}
