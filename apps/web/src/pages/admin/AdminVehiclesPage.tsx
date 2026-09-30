import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VehicleDto } from "@tdm/types";
import {
  advanceVehicleAllocation,
  createVehicle,
  deleteVehicle,
  listAdminVehicles,
  listBranchesLookup,
  listVehicleAllocations,
  requestVehicleAllocation,
  updateVehicle,
} from "@/api/admin";
import type { AdminVehicleInput } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Truck", "Van", "Wagon", "MPV", "Pickup", "Luxury"];
const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid", "Plugin_Hybrid", "CNG"];
const TRANSMISSIONS = ["Manual", "Automatic", "CVT", "DCT"];
const STATUSES = ["Available", "Reserved", "In_Drive", "Maintenance", "Sold"];
const AVAILABILITY_STATUSES = ["In_Stock", "Limited_Stock", "On_Request", "Coming_Soon"];

function emptyForm(defaultBranchId: string): AdminVehicleInput {
  return {
    make: "",
    model: "",
    trim: "",
    year: new Date().getFullYear(),
    vin: "",
    bodyType: "Sedan",
    fuelType: "Petrol",
    transmission: "Manual",
    price: 0,
    priceMax: undefined,
    odometer: 0,
    status: "Available",
    branchId: defaultBranchId,
    isFeatured: false,
    isBestSeller: false,
    isNewLaunch: false,
    availabilityStatus: "In_Stock",
    seatingCapacity: undefined,
    mileageKmpl: undefined,
    primaryImageUrl: "",
    description: "",
  };
}

function vehicleToInput(vehicle: VehicleDto): AdminVehicleInput {
  return {
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim ?? "",
    year: vehicle.year,
    vin: vehicle.vin,
    bodyType: vehicle.bodyType,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    price: vehicle.price.amount,
    priceMax: vehicle.priceMax?.amount,
    odometer: vehicle.odometer,
    status: vehicle.status,
    branchId: vehicle.branchId,
    isFeatured: vehicle.isFeatured,
    isBestSeller: vehicle.isBestSeller,
    isNewLaunch: vehicle.isNewLaunch,
    availabilityStatus: vehicle.availabilityStatus,
    seatingCapacity: vehicle.seatingCapacity,
    mileageKmpl: vehicle.mileageKmpl,
    primaryImageUrl: vehicle.primaryImageUrl ?? "",
    description: vehicle.description ?? "",
  };
}

function VehicleForm({
  initial,
  branches,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  submitLabel,
}: {
  initial: AdminVehicleInput;
  branches: { id: string; name: string }[];
  onSubmit: (input: AdminVehicleInput) => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  error?: { response?: { data?: { message?: string } } };
  submitLabel: string;
}) {
  const [form, setForm] = React.useState(initial);
  const set = (patch: Partial<AdminVehicleInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Make</Label>
          <Input value={form.make} onChange={(e) => set({ make: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Input value={form.model} onChange={(e) => set({ model: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Trim</Label>
          <Input value={form.trim} onChange={(e) => set({ trim: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Year</Label>
          <Input type="number" value={form.year} onChange={(e) => set({ year: Number(e.target.value) })} required />
        </div>
        <div className="space-y-1.5">
          <Label>VIN</Label>
          <Input value={form.vin} onChange={(e) => set({ vin: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.branchId}
            onChange={(e) => set({ branchId: e.target.value })}
            required
          >
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Body Type</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.bodyType} onChange={(e) => set({ bodyType: e.target.value })}>
            {BODY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Fuel Type</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.fuelType} onChange={(e) => set({ fuelType: e.target.value })}>
            {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Transmission</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.transmission} onChange={(e) => set({ transmission: e.target.value })}>
            {TRANSMISSIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label>Price (₹)</Label>
          <Input type="number" value={form.price} onChange={(e) => set({ price: Number(e.target.value) })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Price Max (₹)</Label>
          <Input type="number" value={form.priceMax ?? ""} onChange={(e) => set({ priceMax: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div className="space-y-1.5">
          <Label>Odometer (km)</Label>
          <Input type="number" value={form.odometer ?? 0} onChange={(e) => set({ odometer: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Seating Capacity</Label>
          <Input type="number" value={form.seatingCapacity ?? ""} onChange={(e) => set({ seatingCapacity: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Availability</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.availabilityStatus} onChange={(e) => set({ availabilityStatus: e.target.value })}>
            {AVAILABILITY_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Mileage (km/l)</Label>
          <Input type="number" value={form.mileageKmpl ?? ""} onChange={(e) => set({ mileageKmpl: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Primary Image URL</Label>
        <Input value={form.primaryImageUrl} onChange={(e) => set({ primaryImageUrl: e.target.value })} placeholder="https://…" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        {(["isFeatured", "isBestSeller", "isNewLaunch"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={!!form[key]} onChange={(e) => set({ [key]: e.target.checked })} />
            {key === "isFeatured" ? "Featured" : key === "isBestSeller" ? "Best Seller" : "New Launch"}
          </label>
        ))}
      </div>
      {error?.response?.data?.message && <p className="text-sm text-destructive">{error.response.data.message}</p>}
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

export function AdminVehiclesPage() {
  const queryClient = useQueryClient();
  const { data: vehicles, isLoading } = useQuery({ queryKey: ["admin-vehicles"], queryFn: listAdminVehicles });
  const { data: branches } = useQuery({ queryKey: ["branches-lookup"], queryFn: listBranchesLookup });
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });
    queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  };

  const createMutation = useMutation({
    mutationFn: createVehicle,
    onSuccess: () => {
      invalidate();
      setShowCreateForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminVehicleInput }) => updateVehicle(id, input),
    onSuccess: (_data, variables) => {
      invalidate();
      setEditingId((current) => (current === variables.id ? null : current));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVehicle,
    onSuccess: invalidate,
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicle Inventory</h1>
          <p className="text-sm text-muted-foreground">Add, edit, and retire vehicle listings.</p>
        </div>
        <Button onClick={() => setShowCreateForm((v) => !v)} disabled={!branches?.length}>
          {showCreateForm ? "Cancel" : "Add Vehicle"}
        </Button>
      </div>

      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">New Vehicle</CardTitle>
            <CardDescription>Appears immediately in the customer-facing catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <VehicleForm
              initial={emptyForm(branches?.[0]?.id ?? "")}
              branches={branches ?? []}
              onSubmit={(input) => createMutation.mutate(input)}
              isSubmitting={createMutation.isPending}
              error={createMutation.error as any}
              submitLabel="Create Vehicle"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : vehicles && vehicles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No vehicles yet.</p>
      ) : (
        <div className="space-y-3">
          {vehicles?.map((vehicle) => (
            <Card key={vehicle.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                      <Badge variant="secondary">{vehicle.status}</Badge>
                      {vehicle.isFeatured && <Badge variant="accent">Featured</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {vehicle.bodyType} · {vehicle.fuelType} · ₹{vehicle.price.amount.toLocaleString("en-IN")} · VIN {vehicle.vin}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {editingId !== vehicle.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateMutation.reset();
                          setEditingId(vehicle.id);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${vehicle.year} ${vehicle.make} ${vehicle.model} from the catalog?`)) {
                          deleteMutation.mutate(vehicle.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {editingId === vehicle.id && (
                  <div className="mt-4 border-t pt-4">
                    <VehicleForm
                      initial={vehicleToInput(vehicle)}
                      branches={branches ?? []}
                      onSubmit={(input) => updateMutation.mutate({ id: vehicle.id, input })}
                      onCancel={() => setEditingId(null)}
                      isSubmitting={updateMutation.isPending}
                      error={editingId === vehicle.id ? (updateMutation.error as any) : undefined}
                      submitLabel="Save"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VehicleTransfersSection vehicles={vehicles ?? []} branches={branches ?? []} />
    </div>
  );
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  Requested: "warning",
  In_Transit: "secondary",
  Completed: "success",
  Cancelled: "destructive",
};

function VehicleTransfersSection({
  vehicles,
  branches,
}: {
  vehicles: VehicleDto[];
  branches: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const { data: allocations, isLoading } = useQuery({ queryKey: ["vehicle-allocations"], queryFn: () => listVehicleAllocations() });
  const [vehicleId, setVehicleId] = React.useState("");
  const [toBranchId, setToBranchId] = React.useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vehicle-allocations"] });

  const requestMutation = useMutation({
    mutationFn: requestVehicleAllocation,
    onSuccess: () => {
      invalidate();
      setVehicleId("");
      setToBranchId("");
    },
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "transit" | "complete" | "cancel" }) => advanceVehicleAllocation(id, action),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });
    },
  });

  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? id ?? "—";
  const vehicleLabel = (id: string) => {
    const v = vehicles.find((v) => v.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : id;
  };

  return (
    <div className="mt-10">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Branch Transfers</h2>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Request a Transfer</CardTitle>
          <CardDescription>Move a vehicle unit from its current branch to another.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const vehicle = vehicles.find((v) => v.id === vehicleId);
              requestMutation.mutate({ vehicleId, fromBranchId: vehicle?.branchId, toBranchId });
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[220px] space-y-1.5">
              <Label>Vehicle</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                required
              >
                <option value="">Select vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} — {branchName(v.branchId)}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] space-y-1.5">
              <Label>To Branch</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                required
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={requestMutation.isPending}>
              {requestMutation.isPending ? "Requesting…" : "Request Transfer"}
            </Button>
          </form>
          {requestMutation.isError && <p className="mt-2 text-sm text-destructive">Couldn't request that transfer. Please try again.</p>}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : allocations && allocations.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No transfers yet.</p>
      ) : (
        <div className="space-y-2">
          {allocations?.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{vehicleLabel(a.vehicleId)}</span>
                    <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>{a.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {branchName(a.fromBranchId)} → {branchName(a.toBranchId)}
                  </p>
                </div>
                {(a.status === "Requested" || a.status === "In_Transit") && (
                  <div className="flex gap-2">
                    {a.status === "Requested" && (
                      <Button size="sm" variant="outline" disabled={advanceMutation.isPending} onClick={() => advanceMutation.mutate({ id: a.id, action: "transit" })}>
                        Mark In Transit
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={advanceMutation.isPending} onClick={() => advanceMutation.mutate({ id: a.id, action: "complete" })}>
                      Mark Completed
                    </Button>
                    <Button size="sm" variant="outline" disabled={advanceMutation.isPending} onClick={() => advanceMutation.mutate({ id: a.id, action: "cancel" })}>
                      Cancel
                    </Button>
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
