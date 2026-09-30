import { Connection } from "jsforce";
import {
  AnalyticsDay,
  AnalyticsRepository,
  AnalyticsScope,
  AnalyticsWindow,
  CustomerSegmentCounts,
  DashboardSummary,
  FunnelStageCounts,
  analyticsPeriodStart,
} from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { dealershipCondition, escapeSoql, withConnection } from "../soql";

/** Salesforce returns at most 2,000 groups from an aggregate query, and aggregates don't support queryMore. */
const MAX_AGGREGATE_GROUPS = 2000;
const HOUR_MS = 60 * 60 * 1000;

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

/** Explicit instants, never TODAY/LAST_N_DAYS — those follow the integration user's time zone, not the tenant's. */
function createdInPeriod(window: AnalyticsWindow): string {
  return `CreatedDate >= ${analyticsPeriodStart(window).toISOString()}`;
}

export class SalesforceAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async getDashboardSummary(window: AnalyticsWindow, scope?: AnalyticsScope): Promise<DashboardSummary> {
    const integrationUserId = await this.connectionProvider.getIntegrationUserId();
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = scopeFilter(scope);
      const bookingPathFilter = scopeFilter(scope, "Booking__r.");
      const nowIso = window.now.toISOString();
      const startsToday =
        `Scheduled_Start__c >= ${window.today.start.toISOString()} AND Scheduled_Start__c <= ${window.today.end.toISOString()}`;
      const inPeriod = createdInPeriod(window);

      const [
        todaysTestDrives,
        upcomingBookings,
        vehicleCounts,
        cancellationCounts,
        conversionCounts,
        bookingTrend,
        branchPerfResult,
        branchConversionResult,
        repPerfResult,
        repCompletedResult,
        vehicleDemandResult,
        npsResult,
        satisfactionResult,
      ] = await Promise.all([
        conn.query(`SELECT COUNT() FROM Booking__c WHERE ${startsToday}${branchFilter}`),
        conn.query(
          `SELECT COUNT() FROM Booking__c WHERE Scheduled_Start__c > ${nowIso} AND Status__c IN ('Requested','Confirmed')${branchFilter}`,
        ),
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Vehicle__c WHERE Branch__c != null${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Booking__c WHERE ${inPeriod}${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT COUNT() FROM Opportunity WHERE ${inPeriod} AND Booking__c != null${bookingPathFilter}`,
        ),
        bookingsPerDay(conn, window.days, branchFilter),
        conn.query(
          `SELECT Branch__c b, Branch__r.Name bn, COUNT(Id) cnt FROM Booking__c WHERE ${inPeriod}${branchFilter} ` +
            `GROUP BY Branch__c, Branch__r.Name`,
        ),
        conn.query(
          `SELECT Booking__r.Branch__c b, COUNT(Id) cnt FROM Opportunity ` +
            `WHERE ${inPeriod} AND Booking__c != null${bookingPathFilter} GROUP BY Booking__r.Branch__c`,
        ),
        conn.query(
          // Excludes the integration user — every never-assigned booking defaults to being
          // owned by it (see SalesforceConnectionSource.getIntegrationUserId), so without
          // this filter "unassigned" shows up as a phantom sales rep in the results.
          `SELECT OwnerId r, Owner.Name rn, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE ${inPeriod} AND OwnerId != '${escapeSoql(integrationUserId)}'${branchFilter} GROUP BY OwnerId, Owner.Name`,
        ),
        conn.query(
          `SELECT OwnerId r, COUNT(Id) cnt FROM Booking__c WHERE ${inPeriod} ` +
            `AND Status__c = 'Completed' AND OwnerId != '${escapeSoql(integrationUserId)}'${branchFilter} GROUP BY OwnerId`,
        ),
        conn.query(
          `SELECT Vehicle__c v, Vehicle__r.Make__c mk, Vehicle__r.Model__c md, COUNT(Id) cnt FROM Booking__c ` +
            `WHERE ${inPeriod}${branchFilter} GROUP BY Vehicle__c, Vehicle__r.Make__c, Vehicle__r.Model__c ` +
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
        bookingTrend,
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

  async getFunnelCounts(window: AnalyticsWindow, scope?: AnalyticsScope): Promise<FunnelStageCounts> {
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = scopeFilter(scope);
      const opportunityBranchFilter = scopeFilter(scope, "Booking__r.");
      const inPeriod = createdInPeriod(window);

      const [statusResult, opportunityResult] = await Promise.all([
        conn.query(
          `SELECT Status__c s, COUNT(Id) cnt FROM Booking__c WHERE ${inPeriod}${branchFilter} GROUP BY Status__c`,
        ),
        conn.query(
          `SELECT COUNT() FROM Opportunity WHERE ${inPeriod} AND Booking__c != null${opportunityBranchFilter}`,
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

  async getCustomerSegments(dormantBefore: Date, scope?: AnalyticsScope): Promise<CustomerSegmentCounts> {
    return withConnection(this.connectionProvider, async (conn) => {
      const branchFilter = scopeFilter(scope);
      const opportunityBranchFilter = scopeFilter(scope, "Booking__r.");

      // Grouped per customer, so each is paged by customer Id past the 2,000-group cap.
      const [completedRows, activityRows, convertedRows] = await Promise.all([
        groupedByKey(conn, "Contact__c", "COUNT(Id) cnt", "Booking__c", `Status__c = 'Completed'${branchFilter}`),
        groupedByKey(conn, "Contact__c", "MAX(CreatedDate) lastBookedAt", "Booking__c", `Id != null${branchFilter}`),
        groupedByKey(
          conn,
          "Booking__r.Contact__c",
          "COUNT(Id) cnt",
          "Opportunity",
          `StageName = 'Closed Won' AND Booking__c != null${opportunityBranchFilter}`,
        ),
      ]);

      const completedByContact = new Map<string, number>(completedRows.map((r) => [r.k, r.cnt]));
      const convertedContacts = new Set<string>(convertedRows.map((r) => r.k));
      const dormantCutoff = dormantBefore.getTime();

      const counts: CustomerSegmentCounts = { converted: 0, dormant: 0, repeatVisitors: 0, activeShoppers: 0, newProspects: 0 };
      for (const row of activityRows) {
        const contactId = row.k;
        if (convertedContacts.has(contactId)) {
          counts.converted++;
        } else if (new Date(row.lastBookedAt).getTime() < dormantCutoff) {
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

type GroupRow = { k: string } & Record<string, any>;

/**
 * Every group of `SELECT key, aggregates FROM object WHERE where GROUP BY key` (null keys
 * excluded), fetched in pages of MAX_AGGREGATE_GROUPS ordered by `key` — a record Id, so a
 * keyset cursor on it is exact. Each row carries its key as `k`.
 */
async function groupedByKey(conn: Connection, key: string, aggregates: string, object: string, where: string): Promise<GroupRow[]> {
  const rows: GroupRow[] = [];
  let after: string | undefined;
  for (;;) {
    const cursor = after ? ` AND ${key} > '${escapeSoql(after)}'` : "";
    const result = await conn.query(
      `SELECT ${key} k, ${aggregates} FROM ${object} WHERE ${where} AND ${key} != null${cursor} ` +
        `GROUP BY ${key} ORDER BY ${key} ASC LIMIT ${MAX_AGGREGATE_GROUPS}`,
    );
    const page = result.records as GroupRow[];
    rows.push(...page);
    const last = page[page.length - 1];
    if (!last || page.length < MAX_AGGREGATE_GROUPS) return rows;
    after = last.k;
  }
}

/**
 * Bookings starting on each of `days` (tenant-zone calendar days). Counted per UTC hour — SOQL
 * date functions run in UTC without convertTimezone(), which would use the integration user's
 * zone — and each hour attributed to the day it falls in. An hour that a local midnight cuts
 * through (zones with a half- or quarter-hour offset) is resolved from its bookings' start times.
 */
async function bookingsPerDay(conn: Connection, days: AnalyticsDay[], branchFilter: string): Promise<{ date: string; count: number }[]> {
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (!firstDay || !lastDay) return [];
  const counts = new Map(days.map((day) => [day.date, 0]));
  const from = firstDay.start.getTime();
  const until = lastDay.end.getTime() + 1;

  const dayOf = (instant: number): string | undefined => {
    let lo = 0;
    let hi = days.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const day = days[mid]!;
      if (instant < day.start.getTime()) hi = mid - 1;
      else if (instant > day.end.getTime()) lo = mid + 1;
      else return day.date;
    }
    return undefined;
  };
  const add = (date: string | undefined, n: number) => {
    if (date !== undefined) counts.set(date, (counts.get(date) ?? 0) + n);
  };
  const startsBetween = (start: number, end: number) =>
    `Scheduled_Start__c >= ${new Date(start).toISOString()} AND Scheduled_Start__c < ${new Date(end).toISOString()}`;

  // A span of N whole hours can touch N + 1 UTC hours, so each aggregate stays within the group cap.
  const spanMs = (MAX_AGGREGATE_GROUPS - 1) * HOUR_MS;
  const spans: [number, number][] = [];
  for (let start = from; start < until; start += spanMs) spans.push([start, Math.min(start + spanMs, until)]);
  const hourly = await Promise.all(
    spans.map(([start, end]) =>
      conn.query(
        `SELECT DAY_ONLY(Scheduled_Start__c) d, HOUR_IN_DAY(Scheduled_Start__c) h, COUNT(Id) cnt FROM Booking__c ` +
          `WHERE ${startsBetween(start, end)}${branchFilter} GROUP BY DAY_ONLY(Scheduled_Start__c), HOUR_IN_DAY(Scheduled_Start__c)`,
      ),
    ),
  );

  const splitHours: [number, number][] = [];
  for (const row of hourly.flatMap((result) => result.records as { d: string; h: number; cnt: number }[])) {
    const hourStart = Date.parse(`${row.d}T${String(row.h).padStart(2, "0")}:00:00.000Z`);
    const first = Math.max(hourStart, from);
    const last = Math.min(hourStart + HOUR_MS, until) - 1;
    const date = dayOf(first);
    if (date === dayOf(last)) add(date, row.cnt);
    else splitHours.push([first, last + 1]);
  }
  if (splitHours.length > 0) {
    const starts = await conn.query(
      `SELECT Scheduled_Start__c FROM Booking__c ` +
        `WHERE (${splitHours.map(([start, end]) => `(${startsBetween(start, end)})`).join(" OR ")})${branchFilter}`,
      { autoFetch: true, maxFetch: Number.MAX_SAFE_INTEGER },
    );
    for (const record of starts.records as { Scheduled_Start__c: string }[]) add(dayOf(Date.parse(record.Scheduled_Start__c)), 1);
  }
  return days.map((day) => ({ date: day.date, count: counts.get(day.date) ?? 0 }));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
