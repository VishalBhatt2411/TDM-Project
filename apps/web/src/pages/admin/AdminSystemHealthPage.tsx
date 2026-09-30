import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { getSystemHealth } from "@/api/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_ICON = {
  ok: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  degraded: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  down: <XCircle className="h-5 w-5 text-destructive" />,
};

const STATUS_BADGE: Record<string, "success" | "warning" | "destructive"> = {
  ok: "success",
  degraded: "warning",
  down: "destructive",
};

export function AdminSystemHealthPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["system-health"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
        <p className="text-sm text-muted-foreground">
          Live connectivity to the platform's dependencies. Refreshes automatically every 30 seconds.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">Couldn't load system health.</p>}

      {data && (
        <>
          <Card className="mb-4">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2.5">
                {STATUS_ICON[data.status]}
                <div>
                  <p className="font-medium">Overall status: {data.status === "ok" ? "All systems operational" : data.status === "degraded" ? "Degraded" : "Outage detected"}</p>
                  <p className="text-xs text-muted-foreground">Last checked {new Date(dataUpdatedAt).toLocaleTimeString("en-IN")}</p>
                </div>
              </div>
              <Badge variant={STATUS_BADGE[data.status]}>{data.status.toUpperCase()}</Badge>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {data.components.map((component) => (
              <Card key={component.name}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2.5">
                    {STATUS_ICON[component.status]}
                    <CardTitle className="text-base">{component.name}</CardTitle>
                  </div>
                  <Badge variant={STATUS_BADGE[component.status]}>{component.status.toUpperCase()}</Badge>
                </CardHeader>
                <CardContent>
                  {component.latencyMs != null && <p className="text-sm text-muted-foreground">Latency: {component.latencyMs}ms</p>}
                  {component.message && <CardDescription className="mt-1 text-destructive">{component.message}</CardDescription>}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
