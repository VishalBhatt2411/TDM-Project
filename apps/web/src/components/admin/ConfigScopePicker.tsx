import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { listBranchesLookup, listDealershipsLookup } from "@/api/admin";
import type { ConfigScopeParams } from "@/api/admin";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Label } from "@/components/ui/label";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";
const COMPANY = "";
const ALL_BRANCHES = "";

interface ConfigScopePickerProps {
  value: ConfigScopeParams | null;
  onChange: (scope: ConfigScopeParams) => void;
  /** Offer a branch below the dealership (feature flags) — templates stop at the dealership. */
  withBranch?: boolean;
}

/**
 * Chooses where a config setting applies. "Company-wide" is only offered to a Company Admin,
 * since it reaches every dealership; everyone else starts on their first dealership. The API
 * re-checks the scope on every call — this only keeps the UI from offering what would be refused.
 */
export function ConfigScopePicker({ value, onChange, withBranch = false }: ConfigScopePickerProps) {
  const { staff } = useAdminAuth();
  const isCompanyAdmin = !!staff?.isCompanyAdmin;
  const dealershipsQuery = useQuery({ queryKey: ["dealerships-lookup"], queryFn: listDealershipsLookup });
  const branchesQuery = useQuery({ queryKey: ["branches-lookup"], queryFn: listBranchesLookup, enabled: withBranch });

  const dealerships = dealershipsQuery.data;
  React.useEffect(() => {
    if (value || !dealerships) return;
    if (isCompanyAdmin) onChange({});
    else if (dealerships[0]) onChange({ dealershipId: dealerships[0].id });
  }, [value, dealerships, isCompanyAdmin, onChange]);

  const branches = React.useMemo(
    () => (branchesQuery.data ?? []).filter((b) => b.dealershipId === value?.dealershipId),
    [branchesQuery.data, value?.dealershipId],
  );

  if (dealershipsQuery.isLoading) return <div className="h-16 animate-pulse rounded-lg bg-muted" />;
  if (dealershipsQuery.isError) return <p className="text-sm text-destructive">Couldn't load your dealerships.</p>;
  if (!isCompanyAdmin && dealerships?.length === 0) {
    return <p className="text-sm text-muted-foreground">You aren't assigned to any active dealership.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="config-scope-dealership">Applies to</Label>
        <select
          id="config-scope-dealership"
          className={SELECT_CLASS}
          value={value?.dealershipId ?? COMPANY}
          disabled={!value}
          onChange={(e) => onChange(e.target.value === COMPANY ? {} : { dealershipId: e.target.value })}
        >
          {isCompanyAdmin && <option value={COMPANY}>Company-wide (all dealerships)</option>}
          {dealerships?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      {withBranch && value?.dealershipId && (
        <div className="space-y-1.5">
          <Label htmlFor="config-scope-branch">Branch</Label>
          <select
            id="config-scope-branch"
            className={SELECT_CLASS}
            value={value.branchId ?? ALL_BRANCHES}
            disabled={branchesQuery.isLoading}
            onChange={(e) =>
              onChange({ dealershipId: value.dealershipId, branchId: e.target.value === ALL_BRANCHES ? undefined : e.target.value })
            }
          >
            <option value={ALL_BRANCHES}>All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
