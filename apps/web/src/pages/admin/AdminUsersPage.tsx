import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStaffAssignment,
  listBranchesLookup,
  listDealershipsLookup,
  listStaffAssignments,
  searchStaffDirectory,
  updateStaffAssignment,
} from "@/api/admin";
import type {
  BranchLookupDto,
  DealershipLookupDto,
  StaffAssignmentDto,
  StaffDirectoryUserDto,
  StaffRole,
  UpdateStaffAssignmentRequest,
} from "@/api/admin";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STAFF_ROLE_OPTIONS, staffRoleLabel } from "@/lib/permissions";
import { errorMessage } from "@/lib/api-error";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const DEFAULT_MAX_DAILY_BOOKINGS = 8;

/** The editable part of an assignment — shared by the grant and edit forms. */
interface AssignmentFieldsValue {
  role: StaffRole;
  dealershipId: string;
  branchId: string;
  maxDailyBookings: string;
  phone: string;
}

/**
 * Staff access is a Salesforce user holding a role at a dealership. There are no local accounts
 * or invites: a user granted access here signs in with their existing Salesforce login. The API
 * limits this page to the dealerships where the signed-in user manages staff.
 */
export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: assignments, isLoading, error: listError } = useQuery({
    queryKey: ["staff-assignments"],
    queryFn: listStaffAssignments,
  });
  const { data: dealerships } = useQuery({ queryKey: ["dealerships-lookup"], queryFn: listDealershipsLookup });
  const { data: branches } = useQuery({ queryKey: ["branches-lookup"], queryFn: listBranchesLookup });
  const [showGrantForm, setShowGrantForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff-assignments"] });

  const createMutation = useMutation({
    mutationFn: createStaffAssignment,
    onSuccess: (saved) => {
      invalidate();
      setShowGrantForm(false);
      setNotice(`${saved.userName ?? "The user"} can now sign in as ${staffRoleLabel(saved.role)}.`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffAssignmentRequest }) => updateStaffAssignment(id, input),
    onSuccess: (saved, variables) => {
      invalidate();
      // Only close the row that was actually being edited — e.g. clicking Deactivate on
      // a different row must not silently discard an in-progress edit on this one.
      setEditingId((current) => (current === variables.id ? null : current));
      setNotice(`Access updated for ${saved.userName ?? "the user"}.`);
    },
  });

  const lookups = { dealerships: dealerships ?? [], branches: branches ?? [] };

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Grant Salesforce users a role at a dealership. They sign in with their existing Salesforce login.
          </p>
        </div>
        <Button
          onClick={() => {
            createMutation.reset();
            setNotice(null);
            setShowGrantForm((v) => !v);
          }}
        >
          {showGrantForm ? "Cancel" : "Grant Access"}
        </Button>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {showGrantForm && (
        <GrantAccessForm
          {...lookups}
          onSubmit={(input) => createMutation.mutate(input)}
          isSubmitting={createMutation.isPending}
          error={errorMessage(createMutation.error)}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : listError ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-destructive">{errorMessage(listError)}</p>
      ) : !assignments?.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No staff have access yet. Use “Grant Access” to add someone.
        </p>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              {...lookups}
              onUpdate={(input) => {
                setNotice(null);
                updateMutation.mutate({ id: assignment.id, input });
              }}
              isEditing={editingId === assignment.id}
              onStartEdit={() => {
                updateMutation.reset();
                setEditingId(assignment.id);
              }}
              onCancelEdit={() => {
                updateMutation.reset();
                setEditingId(null);
              }}
              isUpdating={updateMutation.isPending && updateMutation.variables?.id === assignment.id}
              updateError={
                updateMutation.variables?.id === assignment.id ? errorMessage(updateMutation.error) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrantAccessForm({
  dealerships,
  branches,
  onSubmit,
  isSubmitting,
  error,
}: {
  dealerships: DealershipLookupDto[];
  branches: BranchLookupDto[];
  onSubmit: (input: Parameters<typeof createStaffAssignment>[0]) => void;
  isSubmitting: boolean;
  error?: string;
}) {
  const [user, setUser] = React.useState<StaffDirectoryUserDto | null>(null);
  const [fields, setFields] = React.useState<AssignmentFieldsValue>({
    role: "Sales_Rep",
    dealershipId: dealerships.length === 1 ? dealerships[0].id : "",
    branchId: "",
    maxDailyBookings: String(DEFAULT_MAX_DAILY_BOOKINGS),
    phone: "",
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Grant Access</CardTitle>
        <CardDescription>Pick an active user from your Salesforce org, then choose what they can do.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!user) return;
            onSubmit({ userId: user.id, ...toCreateFields(fields) });
          }}
          className="space-y-4"
        >
          <DirectoryPicker selected={user} onSelect={setUser} />
          <AssignmentFields value={fields} onChange={setFields} dealerships={dealerships} branches={branches} idPrefix="grant" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isSubmitting || !user}>
            {isSubmitting ? "Granting…" : "Grant Access"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Searches the Salesforce user directory as the admin types. */
function DirectoryPicker({
  selected,
  onSelect,
}: {
  selected: StaffDirectoryUserDto | null;
  onSelect: (user: StaffDirectoryUserDto | null) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: users, isFetching, error } = useQuery({
    queryKey: ["staff-directory", debouncedQuery],
    queryFn: () => searchStaffDirectory(debouncedQuery),
    enabled: !selected,
  });

  if (selected) {
    return (
      <div className="space-y-1.5">
        <Label>Salesforce User</Label>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="truncate text-xs text-muted-foreground">{selected.email}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onSelect(null)}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="directory-search">Salesforce User</Label>
      <Input
        id="directory-search"
        placeholder="Search by name or email"
        value={query}
        maxLength={80}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <div className="max-h-56 overflow-y-auto rounded-md border" role="listbox" aria-label="Salesforce users">
        {error ? (
          <p className="p-3 text-sm text-destructive">{errorMessage(error)}</p>
        ) : isFetching && !users ? (
          <p className="p-3 text-sm text-muted-foreground">Searching…</p>
        ) : !users?.length ? (
          <p className="p-3 text-sm text-muted-foreground">No active Salesforce users match.</p>
        ) : (
          users.map((u) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={u.id}
              onClick={() => onSelect(u)}
              className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted"
            >
              <span className="block text-sm font-medium">{u.name}</span>
              <span className="block text-xs text-muted-foreground">{u.email}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function AssignmentFields({
  value,
  onChange,
  dealerships,
  branches,
  idPrefix,
}: {
  value: AssignmentFieldsValue;
  onChange: (value: AssignmentFieldsValue) => void;
  dealerships: DealershipLookupDto[];
  branches: BranchLookupDto[];
  idPrefix: string;
}) {
  const { staff } = useAdminAuth();
  const set = (patch: Partial<AssignmentFieldsValue>) => onChange({ ...value, ...patch });
  // Only a Company Admin can grant the Company Admin role — the API refuses it otherwise.
  const roles = STAFF_ROLE_OPTIONS.filter((r) => r.key !== "Company_Admin" || staff?.isCompanyAdmin);
  const needsDealership = value.role !== "Company_Admin";
  const isSalesRep = value.role === "Sales_Rep";
  const dealershipBranches = branches.filter((b) => b.dealershipId === value.dealershipId);
  const roleDescription = STAFF_ROLE_OPTIONS.find((r) => r.key === value.role)?.description;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-role`}>Role</Label>
          <select
            id={`${idPrefix}-role`}
            className={SELECT_CLASS}
            value={value.role}
            onChange={(e) => set({ role: e.target.value as StaffRole })}
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          {roleDescription && <p className="text-xs text-muted-foreground">{roleDescription}</p>}
        </div>
        {needsDealership && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-dealership`}>Dealership</Label>
            <select
              id={`${idPrefix}-dealership`}
              className={SELECT_CLASS}
              value={value.dealershipId}
              // A branch belongs to one dealership, so switching dealership clears it.
              onChange={(e) => set({ dealershipId: e.target.value, branchId: "" })}
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
      </div>
      {isSalesRep && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-branch`}>Branch</Label>
            <select
              id={`${idPrefix}-branch`}
              className={SELECT_CLASS}
              value={value.branchId}
              onChange={(e) => set({ branchId: e.target.value })}
              disabled={!value.dealershipId}
              required
            >
              <option value="" disabled>
                {value.dealershipId ? "Select a branch" : "Pick a dealership first"}
              </option>
              {dealershipBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-max-daily`}>Max Daily Bookings</Label>
            <Input
              id={`${idPrefix}-max-daily`}
              type="number"
              min={1}
              max={100}
              step={1}
              value={value.maxDailyBookings}
              onChange={(e) => set({ maxDailyBookings: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              maxLength={40}
              value={value.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Fields irrelevant to the chosen role are left out, matching the API's role rules. */
function toCreateFields(fields: AssignmentFieldsValue) {
  const isSalesRep = fields.role === "Sales_Rep";
  return {
    role: fields.role,
    dealershipId: fields.role !== "Company_Admin" ? fields.dealershipId || undefined : undefined,
    branchId: isSalesRep ? fields.branchId || undefined : undefined,
    maxDailyBookings: isSalesRep && fields.maxDailyBookings ? Number(fields.maxDailyBookings) : undefined,
    phone: isSalesRep ? fields.phone.trim() || undefined : undefined,
  };
}

/** Like toCreateFields, but sends `null` so a field the new role doesn't use is cleared. */
function toUpdateFields(fields: AssignmentFieldsValue): UpdateStaffAssignmentRequest {
  const created = toCreateFields(fields);
  return {
    role: created.role,
    dealershipId: created.dealershipId ?? null,
    branchId: created.branchId ?? null,
    maxDailyBookings: created.maxDailyBookings ?? null,
    phone: created.phone ?? null,
  };
}

function AssignmentRow({
  assignment,
  dealerships,
  branches,
  onUpdate,
  isEditing,
  onStartEdit,
  onCancelEdit,
  isUpdating,
  updateError,
}: {
  assignment: StaffAssignmentDto;
  dealerships: DealershipLookupDto[];
  branches: BranchLookupDto[];
  onUpdate: (input: UpdateStaffAssignmentRequest) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  isUpdating: boolean;
  updateError?: string;
}) {
  const { staff } = useAdminAuth();
  const isOwn = staff?.assignments.some((a) => a.id === assignment.id) ?? false;
  const dealershipName = dealerships.find((d) => d.id === assignment.dealershipId)?.name;
  const branchName = branches.find((b) => b.id === assignment.branchId)?.name;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {assignment.userName ?? assignment.userId}
              {isOwn && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
            </p>
            {assignment.userEmail && <p className="truncate text-sm text-muted-foreground">{assignment.userEmail}</p>}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant={assignment.role === "Company_Admin" ? "default" : "secondary"}>
                {staffRoleLabel(assignment.role)}
              </Badge>
              {dealershipName && <Badge variant="outline">{dealershipName}</Badge>}
              {branchName && <Badge variant="outline">{branchName}</Badge>}
              {!assignment.isActive && <Badge variant="destructive">Deactivated</Badge>}
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
              disabled={isEditing || isUpdating}
              onClick={() => {
                if (
                  assignment.isActive &&
                  isOwn &&
                  !window.confirm("This removes your own access through this role. Continue?")
                ) {
                  return;
                }
                onUpdate({ isActive: !assignment.isActive });
              }}
            >
              {assignment.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </div>
        {!isEditing && updateError && <p className="mt-2 text-sm text-destructive">{updateError}</p>}
        {isEditing && (
          <EditAssignmentForm
            assignment={assignment}
            dealerships={dealerships}
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

function EditAssignmentForm({
  assignment,
  dealerships,
  branches,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  assignment: StaffAssignmentDto;
  dealerships: DealershipLookupDto[];
  branches: BranchLookupDto[];
  onSubmit: (input: UpdateStaffAssignmentRequest) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: string;
}) {
  const [fields, setFields] = React.useState<AssignmentFieldsValue>({
    role: assignment.role,
    dealershipId: assignment.dealershipId ?? "",
    branchId: assignment.branchId ?? "",
    maxDailyBookings: String(assignment.maxDailyBookings ?? DEFAULT_MAX_DAILY_BOOKINGS),
    phone: assignment.phone ?? "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(toUpdateFields(fields));
      }}
      className="mt-4 space-y-4 border-t pt-4"
    >
      <AssignmentFields
        value={fields}
        onChange={setFields}
        dealerships={dealerships}
        branches={branches}
        idPrefix={`edit-${assignment.id}`}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
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
