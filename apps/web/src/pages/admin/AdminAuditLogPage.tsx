import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { listDealershipsLookup, queryAuditLog } from "@/api/admin";
import { useAdminRegional } from "@/hooks/use-regional";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function AdminAuditLogPage() {
  const regional = useAdminRegional();
  const [entityType, setEntityType] = React.useState("");
  const [actorId, setActorId] = React.useState("");
  const [debounced, setDebounced] = React.useState({ entityType: "", actorId: "" });
  const { data: dealerships } = useQuery({ queryKey: ["dealerships-lookup"], queryFn: listDealershipsLookup });
  const dealershipNames = React.useMemo(() => new Map((dealerships ?? []).map((d) => [d.id, d.name])), [dealerships]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced({ entityType, actorId }), 300);
    return () => clearTimeout(timer);
  }, [entityType, actorId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-log", debounced.entityType, debounced.actorId],
    queryFn: () =>
      queryAuditLog({
        entityType: debounced.entityType || undefined,
        actorId: debounced.actorId || undefined,
        limit: 100,
      }),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">A record of who changed what, at the dealerships you can see.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="entityType">Entity type</Label>
          <Input id="entityType" placeholder="e.g. Booking" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actorId">Actor ID</Label>
          <Input id="actorId" placeholder="Staff or customer ID" value={actorId} onChange={(e) => setActorId(e.target.value)} />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">Couldn't load the audit log.</p>}
      {data && data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No matching audit entries.
        </p>
      )}

      <div className="space-y-2">
        {data?.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{entry.action}</Badge>
                  <span className="text-sm font-medium">
                    {entry.entityType} · {entry.entityId}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.dealershipId ? (dealershipNames.get(entry.dealershipId) ?? entry.dealershipId) : "Company-wide"} · Actor: {entry.actorId}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {regional.dateTime(entry.occurredAt)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
