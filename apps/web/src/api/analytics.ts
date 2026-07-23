import { apiClient } from "@/lib/api-client";

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

export async function getDashboardSummary(): Promise<DashboardSummaryDto> {
  const { data } = await apiClient.get<DashboardSummaryDto>("/analytics/dashboard");
  return data;
}
