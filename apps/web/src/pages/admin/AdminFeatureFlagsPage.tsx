import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listFeatureFlags, setFeatureFlag } from "@/api/admin";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function AdminFeatureFlagsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["feature-flags"], queryFn: () => listFeatureFlags() });

  const mutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => setFeatureFlag(key, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-flags"] }),
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Feature Flags</h1>
        <p className="text-sm text-muted-foreground">Turn platform features on or off without a deployment.</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">Couldn't load feature flags.</p>}
      {data && data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No flags configured.</p>
      )}

      <div className="space-y-3">
        {data?.map((flag) => (
          <Card key={flag.key}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{flag.label}</CardTitle>
                <CardDescription>{flag.description}</CardDescription>
              </div>
              <Switch
                checked={flag.enabled}
                disabled={mutation.isPending}
                aria-label={`Toggle ${flag.label}`}
                onCheckedChange={(enabled) => mutation.mutate({ key: flag.key, enabled })}
              />
            </CardHeader>
          </Card>
        ))}
      </div>
      {mutation.isError && <p className="mt-3 text-sm text-destructive">Couldn't save that change. Please try again.</p>}
    </div>
  );
}
