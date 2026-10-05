import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ANALYTICS_PERIOD_DAYS,
  DEFAULT_ANALYTICS_PERIOD_DAYS,
  DEFAULT_DORMANT_AFTER_DAYS,
  DORMANT_AFTER_DAYS_OPTIONS,
} from "@tdm/types";
import { getAdminDashboardSummary, getCustomerSegments, getFunnelInsight, listBranchesLookup } from "@/api/admin";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/ui/query-error";

const FUNNEL_STAGES: { key: "requested" | "confirmed" | "completed" | "opportunitiesCreated"; label: string }[] = [
  { key: "requested", label: "Requested" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "opportunitiesCreated", label: "Became Opportunity" },
];

const RANK_STYLES = ["bg-amber-100 text-amber-800", "bg-slate-100 text-slate-700", "bg-orange-100 text-orange-800"];

const SEGMENT_DISPLAY: { key: "converted" | "repeatVisitors" | "activeShoppers" | "newProspects" | "dormant"; label: string; barClass: string }[] = [
  { key: "converted", label: "Converted", barClass: "bg-emerald-500" },
  { key: "repeatVisitors", label: "Repeat Visitors", barClass: "bg-primary" },
  { key: "activeShoppers", label: "Active Shoppers", barClass: "bg-sky-500" },
  { key: "newProspects", label: "New Prospects", barClass: "bg-amber-500" },
  { key: "dormant", label: "Dormant", barClass: "bg-slate-400" },
];

function StatTile({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">
          {value}
          {suffix && <span className="text-base font-normal text-muted-foreground">{suffix}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

export function AdminDashboardPage() {
  const { hasPermission } = useAdminAuth();
  // A plain SalesRep (no grantable permissions) has nowhere to see dashboard KPIs —
  // land them on their own bookings instead of a dashboard call that will 403 forever.
  const canViewDashboard = hasPermission("view_dashboard");
  const [branchId, setBranchId] = React.useState("");
  const [periodDays, setPeriodDays] = React.useState<number>(DEFAULT_ANALYTICS_PERIOD_DAYS);
  const [dormantAfterDays, setDormantAfterDays] = React.useState<number>(DEFAULT_DORMANT_AFTER_DAYS);
  const period = `${periodDays} days`;

  const { data: branches } = useQuery({ queryKey: ["branches-lookup"], queryFn: listBranchesLookup, enabled: canViewDashboard });

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["admin-dashboard", branchId, periodDays],
    queryFn: () => getAdminDashboardSummary(periodDays, branchId || undefined),
    enabled: canViewDashboard,
    placeholderData: keepPreviousData,
  });

  const { data: funnel, error: funnelError, refetch: refetchFunnel } = useQuery({
    queryKey: ["admin-funnel", branchId, periodDays],
    queryFn: () => getFunnelInsight(periodDays, branchId || undefined),
    enabled: canViewDashboard,
    placeholderData: keepPreviousData,
  });

  const { data: segments, error: segmentsError, refetch: refetchSegments } = useQuery({
    queryKey: ["admin-customer-segments", branchId, dormantAfterDays],
    queryFn: () => getCustomerSegments(dormantAfterDays, branchId || undefined),
    enabled: canViewDashboard,
    placeholderData: keepPreviousData,
  });

  if (!canViewDashboard) {
    return <Navigate to="/admin/bookings" replace />;
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <QueryError error={error} subject="the dashboard" onRetry={() => refetch()} isRetrying={isRefetching} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const hasTrend = data.bookingTrend.some((d) => d.count > 0);
  const trendData = data.bookingTrend.map((d) => ({ date: d.date?.slice(5) ?? d.date, "Test Drives": d.count }));
  const branchData = data.branchPerformance.map((b) => ({ name: b.branchName, Bookings: b.bookings }));

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Operations Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Reporting period"
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
          >
            {ANALYTICS_PERIOD_DAYS.map((days) => (
              <option key={days} value={days}>Last {days} days</option>
            ))}
          </select>
          <select
            aria-label="Branch"
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">All Branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Today's Test Drives" value={data.todaysTestDrives} />
        <StatTile label="Upcoming Bookings" value={data.upcomingBookings} />
        <StatTile label="Vehicles Driven Today" value={data.vehicleUtilizationPct} suffix="%" />
        <StatTile label={`Cancellation Rate (${periodDays}d)`} value={data.cancellationRatePct} suffix="%" />
        <StatTile label={`Conversion Rate (${periodDays}d)`} value={data.conversionRatePct} suffix="%" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Trend ({period})</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {!hasTrend ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No bookings in this period yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="Test Drives" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Performance ({period})</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {branchData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No branch activity yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="Bookings" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Requested Vehicles ({period})</CardTitle>
          </CardHeader>
          <CardContent>
            {data.mostRequestedVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No booking data yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.mostRequestedVehicles.map((v, i) => (
                  <li key={v.vehicleId} className="flex items-center justify-between text-sm">
                    <span>{i + 1}. {v.label}</span>
                    <span className="font-semibold">{v.count} bookings</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" /> Sales Rep Leaderboard ({period})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.repPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rep activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {[...data.repPerformance]
                  .sort((a, b) => b.completed - a.completed)
                  .map((r, i) => (
                    <li key={r.repId} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            RANK_STYLES[i] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span>{r.repName}</span>
                      </div>
                      <span className="font-semibold">
                        {r.completed} completed <span className="font-normal text-muted-foreground">/ {r.bookings} booked</span>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {funnelError && !funnel && (
        <QueryError className="mt-4" error={funnelError} subject="the booking funnel" onRetry={() => refetchFunnel()} />
      )}

      {funnel && funnel.counts.requested > 0 && (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversion Funnel ({period})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {FUNNEL_STAGES.map((stage) => {
                  const value = funnel.counts[stage.key];
                  const pct = funnel.counts.requested > 0 ? (value / funnel.counts.requested) * 100 : 0;
                  return (
                    <div key={stage.key}>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{stage.label}</span>
                        <span>{value} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{funnel.insight.summary}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {segmentsError && !segments && (
        <QueryError className="mt-4" error={segmentsError} subject="customer segments" onRetry={() => refetchSegments()} />
      )}

      {segments && (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Customer Segments</CardTitle>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Dormant after
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={dormantAfterDays}
                    onChange={(e) => setDormantAfterDays(Number(e.target.value))}
                  >
                    {DORMANT_AFTER_DAYS_OPTIONS.map((days) => (
                      <option key={days} value={days}>{days} days</option>
                    ))}
                  </select>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const total = SEGMENT_DISPLAY.reduce((sum, s) => sum + segments[s.key], 0);
                if (total === 0) {
                  return <p className="text-sm text-muted-foreground">No customer activity yet.</p>;
                }
                return (
                  <div className="space-y-2">
                    {SEGMENT_DISPLAY.map((s) => {
                      const value = segments[s.key];
                      const pct = (value / total) * 100;
                      return (
                        <div key={s.key}>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{s.label}</span>
                            <span>{value} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${s.barClass}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatTile label="Avg. Likelihood to Recommend" value={data.averageNpsScore != null ? data.averageNpsScore.toFixed(1) : "—"} suffix="/10" />
        <StatTile label="Avg. Customer Satisfaction" value={data.averageSatisfactionRating != null ? data.averageSatisfactionRating.toFixed(1) : "—"} suffix="/5" />
      </div>
    </div>
  );
}
