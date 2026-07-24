import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createStaffUser, listStaffUsers, updateStaffUser } from "@/api/admin";
import type { CreateStaffUserRequest, StaffUserDto } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSION_OPTIONS } from "@/lib/permissions";

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ["staff-users"], queryFn: listStaffUsers });
  const [showCreateForm, setShowCreateForm] = React.useState(false);

  const createMutation = useMutation({
    mutationFn: createStaffUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      setShowCreateForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof updateStaffUser>[1]) => updateStaffUser(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-users"] }),
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
              onUpdate={(input) => updateMutation.mutate({ id: user.id, ...input })}
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
}: {
  onSubmit: (input: CreateStaffUserRequest) => void;
  isSubmitting: boolean;
  error?: { response?: { data?: { message?: string } } };
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"Admin" | "Manager" | "SalesRep">("Manager");
  const [permissions, setPermissions] = React.useState<string[]>([]);

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
            onSubmit({ email, name, role, permissions: role !== "Admin" ? permissions : undefined });
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

function StaffUserRow({ user, onUpdate }: { user: StaffUserDto; onUpdate: (input: { isActive?: boolean; permissions?: string[] }) => void }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
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
            {!user.isActive && <Badge variant="destructive">Deactivated</Badge>}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ isActive: !user.isActive })}
        >
          {user.isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </CardContent>
    </Card>
  );
}
