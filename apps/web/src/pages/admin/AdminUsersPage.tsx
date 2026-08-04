import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createStaffUser, listBranchesLookup, listStaffUsers, updateStaffUser } from "@/api/admin";
import type { BranchLookupDto, CreateStaffUserRequest, StaffUserDto, UpdateStaffUserRequest } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSION_OPTIONS } from "@/lib/permissions";

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ["staff-users"], queryFn: listStaffUsers });
  const { data: branches } = useQuery({ queryKey: ["branches-lookup"], queryFn: listBranchesLookup });
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createStaffUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      setShowCreateForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof updateStaffUser>[1]) => updateStaffUser(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      // Only close the row that was actually being edited — e.g. clicking Deactivate on
      // a different row must not silently discard an in-progress edit on this one.
      setEditingUserId((current) => (current === variables.id ? null : current));
    },
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & Permissions</h1>
          <p className="text-sm text-muted-foreground">Manage who can access the Admin Console and what they can do.</p>
        </div>
        <Button onClick={() => setShowCreateForm((v) => !v)}>{showCreateForm ? "Cancel" : "Add Staff User"}</Button>
      </div>

      {showCreateForm && (
        <CreateStaffUserForm
          onSubmit={(input) => createMutation.mutate(input)}
          isSubmitting={createMutation.isPending}
          error={createMutation.error as any}
          branches={branches ?? []}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {users?.map((user) => (
            <StaffUserRow
              key={user.id}
              user={user}
              branches={branches ?? []}
              onUpdate={(input) => updateMutation.mutate({ id: user.id, ...input })}
              isEditing={editingUserId === user.id}
              onStartEdit={() => {
                updateMutation.reset();
                setEditingUserId(user.id);
              }}
              onCancelEdit={() => {
                updateMutation.reset();
                setEditingUserId(null);
              }}
              isUpdating={updateMutation.isPending && editingUserId === user.id}
              updateError={editingUserId === user.id ? (updateMutation.error as any) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateStaffUserForm({
  onSubmit,
  isSubmitting,
  error,
  branches,
}: {
  onSubmit: (input: CreateStaffUserRequest) => void;
  isSubmitting: boolean;
  error?: { response?: { data?: { message?: string } } };
  branches: BranchLookupDto[];
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"Admin" | "Manager" | "SalesRep">("Manager");
  const [permissions, setPermissions] = React.useState<string[]>([]);
  const [branchId, setBranchId] = React.useState("");
  const [maxDailyBookings, setMaxDailyBookings] = React.useState("8");
  const [phone, setPhone] = React.useState("");

  const togglePermission = (key: string) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">New Staff User</CardTitle>
        <CardDescription>They'll receive an email and sign in with their existing Salesforce account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              email,
              name,
              role,
              permissions: role !== "Admin" ? permissions : undefined,
              branchId: role === "SalesRep" && branchId ? branchId : undefined,
              maxDailyBookings: role === "SalesRep" && maxDailyBookings ? Number(maxDailyBookings) : undefined,
              phone: role === "SalesRep" && phone ? phone : undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newEmail">Email</Label>
              <Input id="newEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as "Admin" | "Manager" | "SalesRep")}
            >
              <option value="Manager">Manager</option>
              <option value="SalesRep">Sales Rep</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          {role === "SalesRep" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch">Branch</Label>
                <select
                  id="branch"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxDaily">Max Daily Bookings</Label>
                <Input
                  id="maxDaily"
                  type="number"
                  min={1}
                  value={maxDailyBookings}
                  onChange={(e) => setMaxDailyBookings(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          )}
          {role !== "Admin" && (
            <div>
              <Label>Permissions</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PERMISSION_OPTIONS.map((perm) => (
                  <button
                    type="button"
                    key={perm.key}
                    onClick={() => togglePermission(perm.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      permissions.includes(perm.key) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground"
                    }`}
                  >
                    {perm.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error?.response?.data?.message && <p className="text-sm text-destructive">{error.response.data.message}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create Staff User"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StaffUserRow({
  user,
  branches,
  onUpdate,
  isEditing,
  onStartEdit,
  onCancelEdit,
  isUpdating,
  updateError,
}: {
  user: StaffUserDto;
  branches: BranchLookupDto[];
  onUpdate: (input: UpdateStaffUserRequest) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  isUpdating: boolean;
  updateError?: { response?: { data?: { message?: string } } };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant={user.role === "Admin" ? "default" : "secondary"}>{user.role}</Badge>
              {user.role !== "Admin" &&
                user.permissions.map((p) => (
                  <Badge key={p} variant="outline">
                    {PERMISSION_OPTIONS.find((o) => o.key === p)?.label ?? p}
                  </Badge>
                ))}
              {user.role === "SalesRep" && (
                <Badge variant={user.hasLoggedInWithSalesforce ? "outline" : "destructive"}>
                  {user.hasLoggedInWithSalesforce ? "Logged in with Salesforce" : "Hasn't logged in yet"}
                </Badge>
              )}
              {!user.isActive && <Badge variant="destructive">Deactivated</Badge>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {!isEditing && (
              <Button size="sm" variant="outline" onClick={onStartEdit}>
                Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={isEditing}
              onClick={() => onUpdate({ isActive: !user.isActive })}
            >
              {user.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </div>
        {isEditing && (
          <EditStaffUserForm
            user={user}
            branches={branches}
            onSubmit={onUpdate}
            onCancel={onCancelEdit}
            isSubmitting={isUpdating}
            error={updateError}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EditStaffUserForm({
  user,
  branches,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  user: StaffUserDto;
  branches: BranchLookupDto[];
  onSubmit: (input: UpdateStaffUserRequest) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: { response?: { data?: { message?: string } } };
}) {
  const [name, setName] = React.useState(user.name);
  const [email, setEmail] = React.useState(user.email);
  const [role, setRole] = React.useState<"Admin" | "Manager" | "SalesRep">(user.role);
  const [permissions, setPermissions] = React.useState<string[]>(user.permissions);
  const [branchId, setBranchId] = React.useState(user.branchId ?? "");
  const [maxDailyBookings, setMaxDailyBookings] = React.useState(String(user.maxDailyBookings ?? 8));
  const [phone, setPhone] = React.useState(user.phone ?? "");

  const togglePermission = (key: string) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          email,
          role,
          permissions: role !== "Admin" ? permissions : undefined,
          branchId: role === "SalesRep" ? branchId : undefined,
          maxDailyBookings: role === "SalesRep" && maxDailyBookings ? Number(maxDailyBookings) : undefined,
          phone: role === "SalesRep" ? phone : undefined,
        });
      }}
      className="mt-4 space-y-4 border-t pt-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`edit-name-${user.id}`}>Name</Label>
          <Input id={`edit-name-${user.id}`} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-email-${user.id}`}>Email</Label>
          <Input id={`edit-email-${user.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`edit-role-${user.id}`}>Role</Label>
        <select
          id={`edit-role-${user.id}`}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as "Admin" | "Manager" | "SalesRep")}
        >
          <option value="Manager">Manager</option>
          <option value="SalesRep">Sales Rep</option>
          <option value="Admin">Admin</option>
        </select>
      </div>
      {role === "SalesRep" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-branch-${user.id}`}>Branch</Label>
            <select
              id={`edit-branch-${user.id}`}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-max-daily-${user.id}`}>Max Daily Bookings</Label>
            <Input
              id={`edit-max-daily-${user.id}`}
              type="number"
              min={1}
              value={maxDailyBookings}
              onChange={(e) => setMaxDailyBookings(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-phone-${user.id}`}>Phone</Label>
            <Input id={`edit-phone-${user.id}`} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
      )}
      {role !== "Admin" && (
        <div>
          <Label>Permissions</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERMISSION_OPTIONS.map((perm) => (
              <button
                type="button"
                key={perm.key}
                onClick={() => togglePermission(perm.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  permissions.includes(perm.key) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground"
                }`}
              >
                {perm.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {error?.response?.data?.message && <p className="text-sm text-destructive">{error.response.data.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
