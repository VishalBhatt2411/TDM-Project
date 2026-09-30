import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBranch, listAdminBranches, listDealershipsLookup, setBranchActive, updateBranch } from "@/api/admin";
import type { AdminBranchDto, BranchInput, DealershipLookupDto } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { errorMessage } from "@/lib/api-error";

const EMPTY_FORM: BranchInput = {
  name: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  phone: "",
  email: "",
  operatingHours: "",
  managerName: "",
};

function BranchForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  submitLabel,
  dealerships,
}: {
  initial: BranchInput;
  onSubmit: (input: BranchInput, dealershipId: string) => void;
  /** Only when creating — a branch's dealership is fixed for its lifetime. */
  dealerships?: DealershipLookupDto[];
  onCancel?: () => void;
  isSubmitting: boolean;
  error?: unknown;
  submitLabel: string;
}) {
  const [form, setForm] = React.useState(initial);
  const [latitude, setLatitude] = React.useState(initial.geo ? String(initial.geo.latitude) : "");
  const [longitude, setLongitude] = React.useState(initial.geo ? String(initial.geo.longitude) : "");
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [dealershipId, setDealershipId] = React.useState("");
  // Preselect once the lookup has loaded, when there's nothing to choose between.
  React.useEffect(() => {
    if (dealerships?.length === 1) setDealershipId((current) => current || dealerships[0].id);
  }, [dealerships]);
  const set = (patch: Partial<BranchInput>) => setForm((f) => ({ ...f, ...patch }));

  const resolveGeo = (): BranchInput["geo"] | "invalid" => {
    const lat = latitude.trim();
    const lng = longitude.trim();
    if (!lat && !lng) return null;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!lat || !lng || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return "invalid";
    if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return "invalid";
    return { latitude: latNum, longitude: lngNum };
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const geo = resolveGeo();
        if (geo === "invalid") {
          setGeoError("Enter both latitude (-90 to 90) and longitude (-180 to 180), or leave both empty.");
          return;
        }
        setGeoError(null);
        onSubmit({ ...form, geo }, dealershipId);
      }}
      className="space-y-4"
    >
      {dealerships && (
        <div className="space-y-1.5">
          <Label htmlFor="branch-dealership">Dealership</Label>
          <select
            id="branch-dealership"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={dealershipId}
            onChange={(e) => setDealershipId(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a dealership
            </option>
            {dealerships.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Branch Name</Label>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Manager Name</Label>
          <Input value={form.managerName} onChange={(e) => set({ managerName: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Address Line 1</Label>
        <Input value={form.addressLine1} onChange={(e) => set({ addressLine1: e.target.value })} required />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.city} onChange={(e) => set({ city: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Input value={form.state} onChange={(e) => set({ state: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Postal Code</Label>
          <Input value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Input value={form.country} onChange={(e) => set({ country: e.target.value })} required />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Operating Hours</Label>
          <Input value={form.operatingHours} onChange={(e) => set({ operatingHours: e.target.value })} placeholder="9 AM - 7 PM" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Latitude</Label>
          <Input type="number" step="any" inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="22.7196" />
        </div>
        <div className="space-y-1.5">
          <Label>Longitude</Label>
          <Input type="number" step="any" inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="75.8577" />
        </div>
      </div>
      {geoError && <p className="text-sm text-destructive">{geoError}</p>}
      {error != null && <p role="alert" className="text-sm text-destructive">{errorMessage(error)}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function branchToInput(branch: AdminBranchDto): BranchInput {
  return {
    name: branch.name,
    addressLine1: branch.address.line1,
    city: branch.address.city,
    state: branch.address.state,
    postalCode: branch.address.postalCode,
    country: branch.address.country,
    geo: branch.geo,
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    operatingHours: branch.operatingHours ?? "",
    managerName: branch.managerName ?? "",
  };
}

export function AdminBranchesPage() {
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery({ queryKey: ["admin-branches"], queryFn: listAdminBranches });
  const { data: dealerships } = useQuery({ queryKey: ["dealerships-lookup"], queryFn: listDealershipsLookup });
  const dealershipName = (id: string) => dealerships?.find((d) => d.id === id)?.name;
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      setShowCreateForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: BranchInput }) => updateBranch(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      setEditingId((current) => (current === variables.id ? null : current));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setBranchActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-branches"] }),
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Branches</h1>
          <p className="text-sm text-muted-foreground">Manage dealership branch locations.</p>
        </div>
        <Button onClick={() => setShowCreateForm((v) => !v)}>{showCreateForm ? "Cancel" : "Add Branch"}</Button>
      </div>

      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">New Branch</CardTitle>
            <CardDescription>Appears immediately in the customer-facing branch locator.</CardDescription>
          </CardHeader>
          <CardContent>
            <BranchForm
              initial={EMPTY_FORM}
              dealerships={dealerships ?? []}
              onSubmit={(input, dealershipId) => createMutation.mutate({ ...input, dealershipId })}
              isSubmitting={createMutation.isPending}
              error={createMutation.error}
              submitLabel="Create Branch"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : branches && branches.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No branches yet.</p>
      ) : (
        <div className="space-y-3">
          {branches?.map((branch) => (
            <Card key={branch.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{branch.name}</p>
                      {!branch.isActive && <Badge variant="destructive">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {branch.address.line1}, {branch.address.city}, {branch.address.state} {branch.address.postalCode}
                    </p>
                    {dealershipName(branch.dealershipId) && (
                      <p className="text-xs text-muted-foreground">Dealership: {dealershipName(branch.dealershipId)}</p>
                    )}
                    {branch.managerName && <p className="text-xs text-muted-foreground">Manager: {branch.managerName}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {editingId !== branch.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateMutation.reset();
                          setEditingId(branch.id);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={editingId === branch.id}
                      onClick={() => toggleActiveMutation.mutate({ id: branch.id, active: !branch.isActive })}
                    >
                      {branch.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
                {editingId === branch.id && (
                  <div className="mt-4 border-t pt-4">
                    <BranchForm
                      initial={branchToInput(branch)}
                      onSubmit={(input) => updateMutation.mutate({ id: branch.id, input })}
                      onCancel={() => setEditingId(null)}
                      isSubmitting={updateMutation.isPending}
                      error={editingId === branch.id ? updateMutation.error : undefined}
                      submitLabel="Save"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
