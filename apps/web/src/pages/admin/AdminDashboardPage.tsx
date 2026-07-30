import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAdminDashboardSummary } from "@/api/admin";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getAdminDashboardSummary,
    enabled: canViewDashboard,
  });

  if (!canViewDashboard) {
    return <Navigate to="/admin/bookings" replace />;
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

  const trendData = data.bookingTrend.map((d) => ({ date: d.date?.slice(5) ?? d.date, "Test Drives": d.count }));
  const branchData = data.branchPerformance.map((b) => ({ name: b.branchName, Bookings: b.bookings }));

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Operations Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Today's Test Drives" value={data.todaysTestDrives} />
        <StatTile label="Upcoming Bookings" value={data.upcomingBookings} />
        <StatTile label="Vehicle Utilization" value={data.vehicleUtilizationPct} suffix="%" />
        <StatTile label="Cancellation Rate (30d)" value={data.cancellationRatePct} suffix="%" />
        <StatTile label="Conversion Rate (30d)" value={data.conversionRatePct} suffix="%" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Trend (14 days)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {trendData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No bookings in this period yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="Test Drives" fill="#EB0A1E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Performance (30 days)</CardTitle>
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
                  <Bar dataKey="Bookings" fill="#EB0A1E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Requested Vehicles (90 days)</CardTitle>
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
            <CardTitle className="text-base">Sales Rep Performance (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.repPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rep activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.repPerformance.map((r) => (
                  <li key={r.repId} className="flex items-center justify-between text-sm">
                    <span>{r.repName}</span>
                    <span className="font-semibold">{r.bookings} bookings</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatTile label="Avg. NPS Score" value={data.averageNpsScore != null ? data.averageNpsScore.toFixed(1) : "—"} suffix="/10" />
        <StatTile label="Avg. Customer Satisfaction" value={data.averageSatisfactionRating != null ? data.averageSatisfactionRating.toFixed(1) : "—"} suffix="/5" />
      </div>
    </div>
  );
}
