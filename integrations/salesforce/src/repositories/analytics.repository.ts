import { AnalyticsRepository, DashboardSummary } from "@tdm/domain";
import { SalesforceConnectionProvider } from "../connection";
import { withConnection } from "../soql";

export class SalesforceAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async getDashboardSummary(branchId?: string): Promise<DashboardSummary> {
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = branchId ? ` AND Branch__c = '${branchId}'` : "";
      // SOQL has no bare `NOW` literal for datetime comparisons — use an actual ISO instant.
      const nowIso = new Date().toISOString();

      const [
        todaysTestDrives,
        upcomingBookings,
        vehicleCounts,
        cancellationCounts,
        conversionCounts,
        trendResult,
        branchPerfResult,
        repPerfResult,
        vehicleDemandResult,
        npsResult,
        satisfactionResult,
      ] = await Promise.all([
        conn.query(`SELECT COUNT() FROM Booking__c WHERE Scheduled_Start__c = TODAY${branchFilter}`),
        conn.query(
          `SELECT COUNT() FROM Booking__c WHERE Scheduled_Start__c > ${nowIso} AND Status__c IN ('Requested','Confirmed')${branchFilter}`,
        ),
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Vehicle__c WHERE Branch__c != null${branchId ? ` AND Branch__c = '${branchId}'` : ""} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Booking__c WHERE CreatedDate = LAST_N_DAYS:30${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT COUNT() FROM Opportunity WHERE CreatedDate = LAST_N_DAYS:30 AND Booking__c != null`,
        ),
        conn.query(
          `SELECT DAY_ONLY(Scheduled_Start__c) d, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE Scheduled_Start__c = LAST_N_DAYS:14${branchFilter} GROUP BY DAY_ONLY(Scheduled_Start__c) ORDER BY DAY_ONLY(Scheduled_Start__c) ASC`,
        ),
        conn.query(
          `SELECT Branch__c b, Branch__r.Name bn, COUNT(Id) cnt FROM Booking__c WHERE CreatedDate = LAST_N_DAYS:30 ` +
            `GROUP BY Branch__c, Branch__r.Name`,
        ),
        conn.query(
          `SELECT Sales_Rep__c r, Sales_Rep__r.Name rn, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE CreatedDate = LAST_N_DAYS:30 AND Sales_Rep__c != null${branchFilter} GROUP BY Sales_Rep__c, Sales_Rep__r.Name`,
        ),
        conn.query(
          `SELECT Vehicle__c v, Vehicle__r.Make__c mk, Vehicle__r.Model__c md, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE CreatedDate = LAST_N_DAYS:90${branchFilter} GROUP BY Vehicle__c, Vehicle__r.Make__c, Vehicle__r.Model__c ` +
            `ORDER BY COUNT(Id) DESC LIMIT 5`,
        ),
        conn.query(`SELECT AVG(NPS_Score__c) avgNps FROM Drive_Feedback__c WHERE NPS_Score__c != null`),
        conn.query(
          `SELECT AVG(Dealership_Experience_Rating__c) avgSat FROM Drive_Feedback__c WHERE Dealership_Experience_Rating__c != null`,
        ),
      ]);

      const vehicleRows = vehicleCounts.records as any[];
      const totalVehicles = vehicleRows.reduce((sum, r) => sum + r.cnt, 0);
      const inUseVehicles = vehicleRows
        .filter((r) => r.s === "In_Drive" || r.s === "Reserved")
        .reduce((sum, r) => sum + r.cnt, 0);
      const vehicleUtilizationPct = totalVehicles > 0 ? (inUseVehicles / totalVehicles) * 100 : 0;

      const cancellationRows = cancellationCounts.records as any[];
      const totalBookings30d = cancellationRows.reduce((sum, r) => sum + r.cnt, 0);
      const cancelled30d = cancellationRows.filter((r) => r.s === "Cancelled").reduce((sum, r) => sum + r.cnt, 0);
      const completed30d = cancellationRows.filter((r) => r.s === "Completed").reduce((sum, r) => sum + r.cnt, 0);
      const cancellationRatePct = totalBookings30d > 0 ? (cancelled30d / totalBookings30d) * 100 : 0;

      const opportunities30d = (conversionCounts as any).totalSize ?? 0;
      const conversionRatePct = totalBookings30d > 0 ? (opportunities30d / totalBookings30d) * 100 : 0;

      return {
        todaysTestDrives: (todaysTestDrives as any).totalSize ?? 0,
        upcomingBookings: (upcomingBookings as any).totalSize ?? 0,
        vehicleUtilizationPct: round1(vehicleUtilizationPct),
        cancellationRatePct: round1(cancellationRatePct),
        conversionRatePct: round1(conversionRatePct),
        bookingTrend: (trendResult.records as any[]).map((r) => ({ date: r.d, count: r.cnt })),
        branchPerformance: (branchPerfResult.records as any[]).map((r) => ({
          branchId: r.b,
          branchName: r.bn ?? "Unknown",
          bookings: r.cnt,
          conversions: 0,
        })),
        repPerformance: (repPerfResult.records as any[]).map((r) => ({
          repId: r.r,
          repName: r.rn ?? "Unassigned",
          bookings: r.cnt,
          completed: 0,
        })),
        mostRequestedVehicles: (vehicleDemandResult.records as any[]).map((r) => ({
          vehicleId: r.v,
          label: `${r.mk ?? ""} ${r.md ?? ""}`.trim(),
          count: r.cnt,
        })),
        averageNpsScore: (npsResult.records[0] as any)?.avgNps ?? null,
        averageSatisfactionRating: (satisfactionResult.records[0] as any)?.avgSat ?? null,
      };
    });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
