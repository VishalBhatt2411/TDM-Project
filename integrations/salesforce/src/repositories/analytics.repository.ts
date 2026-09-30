import { AnalyticsRepository, AnalyticsScope, CustomerSegmentCounts, DashboardSummary, FunnelStageCounts } from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { dealershipCondition, escapeSoql, withConnection } from "../soql";

/**
 * ` AND ...` conditions limiting a query to the scope. `path` is the relationship prefix that
 * reaches Branch__c/Dealership__c from the queried object — "" on Booking__c and Vehicle__c,
 * "Booking__r." on Opportunity and Drive_Feedback__c.
 */
function scopeFilter(scope: AnalyticsScope | undefined, path = ""): string {
  const conditions: string[] = [];
  if (scope?.branchId) conditions.push(`${path}Branch__c = '${escapeSoql(scope.branchId)}'`);
  const dealership = dealershipCondition(`${path}Dealership__c`, scope?.dealershipIds);
  if (dealership) conditions.push(dealership);
  return conditions.map((c) => ` AND ${c}`).join("");
}

export class SalesforceAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async getDashboardSummary(scope?: AnalyticsScope): Promise<DashboardSummary> {
    const integrationUserId = await this.connectionProvider.getIntegrationUserId();
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = scopeFilter(scope);
      const bookingPathFilter = scopeFilter(scope, "Booking__r.");
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
        branchConversionResult,
        repPerfResult,
        repCompletedResult,
        vehicleDemandResult,
        npsResult,
        satisfactionResult,
      ] = await Promise.all([
        conn.query(`SELECT COUNT() FROM Booking__c WHERE Scheduled_Start__c = TODAY${branchFilter}`),
        conn.query(
          `SELECT COUNT() FROM Booking__c WHERE Scheduled_Start__c > ${nowIso} AND Status__c IN ('Requested','Confirmed')${branchFilter}`,
        ),
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Vehicle__c WHERE Branch__c != null${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Booking__c WHERE CreatedDate = LAST_N_DAYS:30${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT COUNT() FROM Opportunity WHERE CreatedDate = LAST_N_DAYS:30 AND Booking__c != null${bookingPathFilter}`,
        ),
        conn.query(
          `SELECT DAY_ONLY(Scheduled_Start__c) d, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE Scheduled_Start__c = LAST_N_DAYS:14${branchFilter} GROUP BY DAY_ONLY(Scheduled_Start__c) ORDER BY DAY_ONLY(Scheduled_Start__c) ASC`,
        ),
        conn.query(
          `SELECT Branch__c b, Branch__r.Name bn, COUNT(Id) cnt FROM Booking__c WHERE CreatedDate = LAST_N_DAYS:30${branchFilter} ` +
            `GROUP BY Branch__c, Branch__r.Name`,
        ),
        conn.query(
          `SELECT Booking__r.Branch__c b, COUNT(Id) cnt FROM Opportunity ` +
            `WHERE CreatedDate = LAST_N_DAYS:30 AND Booking__c != null${bookingPathFilter} GROUP BY Booking__r.Branch__c`,
        ),
        conn.query(
          // Excludes the integration user — every never-assigned booking defaults to being
          // owned by it (see SalesforceConnectionSource.getIntegrationUserId), so without
          // this filter "unassigned" shows up as a phantom sales rep in the results.
          `SELECT OwnerId r, Owner.Name rn, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE CreatedDate = LAST_N_DAYS:30 AND OwnerId != '${escapeSoql(integrationUserId)}'${branchFilter} GROUP BY OwnerId, Owner.Name`,
        ),
        conn.query(
          `SELECT OwnerId r, COUNT(Id) cnt FROM Booking__c WHERE CreatedDate = LAST_N_DAYS:30 ` +
            `AND Status__c = 'Completed' AND OwnerId != '${escapeSoql(integrationUserId)}'${branchFilter} GROUP BY OwnerId`,
        ),
        conn.query(
          `SELECT Vehicle__c v, Vehicle__r.Make__c mk, Vehicle__r.Model__c md, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE CreatedDate = LAST_N_DAYS:90${branchFilter} GROUP BY Vehicle__c, Vehicle__r.Make__c, Vehicle__r.Model__c ` +
            `ORDER BY COUNT(Id) DESC LIMIT 5`,
        ),
        conn.query(`SELECT AVG(NPS_Score__c) avgNps FROM Drive_Feedback__c WHERE NPS_Score__c != null${bookingPathFilter}`),
        conn.query(
          `SELECT AVG(Dealership_Experience_Rating__c) avgSat FROM Drive_Feedback__c ` +
            `WHERE Dealership_Experience_Rating__c != null${bookingPathFilter}`,
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

      const branchConversionsById = new Map<string, number>(
        (branchConversionResult.records as any[]).map((r) => [r.b, r.cnt]),
      );
      const repCompletedById = new Map<string, number>(
        (repCompletedResult.records as any[]).map((r) => [r.r, r.cnt]),
      );

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
          conversions: branchConversionsById.get(r.b) ?? 0,
        })),
        repPerformance: (repPerfResult.records as any[]).map((r) => ({
          repId: r.r,
          repName: r.rn ?? "Unassigned",
          bookings: r.cnt,
          completed: repCompletedById.get(r.r) ?? 0,
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

  async getFunnelCounts(scope?: AnalyticsScope): Promise<FunnelStageCounts> {
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = scopeFilter(scope);
      const opportunityBranchFilter = scopeFilter(scope, "Booking__r.");

      const [statusResult, opportunityResult] = await Promise.all([
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Booking__c WHERE CreatedDate = LAST_N_DAYS:30${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT COUNT() FROM Opportunity WHERE CreatedDate = LAST_N_DAYS:30 AND Booking__c != null${opportunityBranchFilter}`,
        ),
      ]);

      const rows = statusResult.records as { s: string; cnt: number }[];
      const countOf = (statuses: string[]) =>
        rows.filter((r) => statuses.includes(r.s)).reduce((sum, r) => sum + r.cnt, 0);

      return {
        requested: rows.reduce((sum, r) => sum + r.cnt, 0),
        confirmed: countOf(["Confirmed", "InProgress", "Completed", "NoShow"]),
        completed: countOf(["Completed"]),
        opportunitiesCreated: (opportunityResult as any).totalSize ?? 0,
      };
    });
  }

  async getCustomerSegments(scope?: AnalyticsScope): Promise<CustomerSegmentCounts> {
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = scopeFilter(scope);
      const opportunityBranchFilter = scopeFilter(scope, "Booking__r.");

      const [completedResult, activityResult, convertedResult] = await Promise.all([
        conn.query(`SELECT Contact__c c, COUNT(Id) cnt FROM Booking__c WHERE Status__c = 'Completed'${branchFilter} GROUP BY Contact__c`),
        conn.query(`SELECT Contact__c c, MAX(CreatedDate) last FROM Booking__c WHERE Contact__c != null${branchFilter} GROUP BY Contact__c`),
        conn.query(
          `SELECT Booking__r.Contact__c c FROM Opportunity WHERE StageName = 'Closed Won' AND Booking__c != null${opportunityBranchFilter} GROUP BY Booking__r.Contact__c`,
        ),
      ]);

      const completedByContact = new Map<string, number>((completedResult.records as any[]).map((r) => [r.c, r.cnt]));
      const convertedContacts = new Set<string>((convertedResult.records as any[]).map((r) => r.c));
      const dormantCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

      const counts: CustomerSegmentCounts = { converted: 0, dormant: 0, repeatVisitors: 0, activeShoppers: 0, newProspects: 0 };
      for (const row of activityResult.records as any[]) {
        const contactId = row.c;
        if (convertedContacts.has(contactId)) {
          counts.converted++;
        } else if (new Date(row.last).getTime() < dormantCutoff) {
          counts.dormant++;
        } else {
          const completed = completedByContact.get(contactId) ?? 0;
          if (completed >= 2) counts.repeatVisitors++;
          else if (completed === 1) counts.activeShoppers++;
          else counts.newProspects++;
        }
      }
      return counts;
    });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
