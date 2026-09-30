import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearFeatureFlag, listFeatureFlags, setFeatureFlag } from "@/api/admin";
import type { ConfigScopeParams, FeatureFlagDto } from "@/api/admin";
import { ConfigScopePicker } from "@/components/admin/ConfigScopePicker";
import { errorMessage } from "@/lib/api-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type ScopeLevel = Exclude<FeatureFlagDto["source"], "default">;

const levelOf = (scope: ConfigScopeParams): ScopeLevel =>
  scope.branchId ? "branch" : scope.dealershipId ? "dealership" : "company";

const SOURCE_LABEL: Record<FeatureFlagDto["source"], string> = {
  branch: "Inherited from branch",
  dealership: "Inherited from dealership",
  company: "Inherited from company-wide setting",
  default: "Not set — off by default",
};

export function AdminFeatureFlagsPage() {
  const queryClient = useQueryClient();
  const [scope, setScope] = React.useState<ConfigScopeParams | null>(null);
  const queryKey = ["feature-flags", scope?.dealershipId ?? null, scope?.branchId ?? null];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => listFeatureFlags(scope!),
    enabled: scope !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
  const setMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => setFeatureFlag(key, enabled, scope!),
    onSuccess: invalidate,
  });
  const clearMutation = useMutation({
    mutationFn: (key: string) => clearFeatureFlag(key, scope!),
    onSuccess: invalidate,
  });
  const isSaving = setMutation.isPending || clearMutation.isPending;
  const saveError = errorMessage(setMutation.error ?? clearMutation.error);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Feature Flags</h1>
        <p className="text-sm text-muted-foreground">
          Turn platform features on or off without a deployment. A branch setting overrides its dealership's, which overrides the company-wide one.
        </p>
      </div>

      <div className="mb-6">
        <ConfigScopePicker value={scope} onChange={setScope} withBranch />
      </div>

      {scope && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">{errorMessage(error) ?? "Couldn't load feature flags."}</p>}
      {data && data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No flags configured.</p>
      )}

      <div className="space-y-3">
        {scope &&
          data?.map((flag) => {
            const isSetHere = flag.source === levelOf(scope);
            return (
              <Card key={flag.key}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base">{flag.label}</CardTitle>
                    <CardDescription>{flag.description}</CardDescription>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {isSetHere ? (
                        <Badge variant="accent">Set here</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{SOURCE_LABEL[flag.source]}</span>
                      )}
                      {isSetHere && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={isSaving}
                          onClick={() => clearMutation.mutate(flag.key)}
                        >
                          Reset to inherited
                        </Button>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={flag.enabled}
                    disabled={isSaving}
                    aria-label={`Toggle ${flag.label}`}
                    onCheckedChange={(enabled) => setMutation.mutate({ key: flag.key, enabled })}
                  />
                </CardHeader>
              </Card>
            );
          })}
      </div>
      {saveError && <p className="mt-3 text-sm text-destructive">{saveError}</p>}
    </div>
  );
}
