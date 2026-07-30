import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignSalesRep,
  cancelBookingAsStaff,
  checkInBookingAsStaff,
  completeDriveAsStaff,
  handoffBooking,
  listAdminBookings,
  listMyAssignedBookings,
  listSalesRepsLookup,
  markNoShowAsStaff,
  rescheduleBookingAsStaff,
  setBookingStaffNotes,
  startDriveAsStaff,
} from "@/api/admin";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BookingDto, BookingStatus } from "@tdm/types";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  Requested: "warning",
  Confirmed: "success",
  Waitlisted: "secondary",
  InProgress: "success",
  Completed: "success",
  Cancelled: "destructive",
  NoShow: "destructive",
};

const STATUSES: BookingStatus[] = ["Requested", "Confirmed", "Waitlisted", "InProgress", "Completed", "Cancelled", "NoShow"];
const CANCELLABLE_STATUSES = new Set(["Requested", "Confirmed"]);

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminBookingsPage() {
  const { staff, hasPermission } = useAdminAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | undefined>(undefined);

  const canManageAll = hasPermission("manage_bookings");
  const scopeKey = canManageAll ? "admin-bookings" : "my-assigned-bookings";

  const { data, isLoading } = useQuery({
    queryKey: [scopeKey, statusFilter],
    queryFn: () =>
      canManageAll
        ? listAdminBookings({ status: statusFilter, pageSize: 50 })
        : listMyAssignedBookings({ status: statusFilter, pageSize: 50 }),
  });
  const { data: reps } = useQuery({ queryKey: ["sales-reps-lookup"], queryFn: listSalesRepsLookup });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [scopeKey] });

  const assignMutation = useMutation({
    mutationFn: ({ bookingId, salesRepId }: { bookingId: string; salesRepId: string }) => assignSalesRep(bookingId, salesRepId),
    onSuccess: invalidate,
  });

  if (!canManageAll && !staff?.salesRepId) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">My Test Drives</h1>
        </div>
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Bookings are assigned to your real Salesforce login, which we haven't confirmed yet — sign out and log back
          in with Salesforce, then your assigned test drives will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{canManageAll ? "Test Drive Management" : "My Test Drives"}</h1>
        <p className="text-sm text-muted-foreground">
          {canManageAll
            ? "View all bookings, assign sales representatives, and manage the drive lifecycle — changes sync directly to Salesforce."
            : "Test drives assigned to you — check customers in, log the drive, and keep notes. Changes sync directly to Salesforce."}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${!statusFilter ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${statusFilter === s ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No bookings match this filter.</p>
      ) : (
        <div className="space-y-3">
          {data?.items.map((booking) => (
            <Card key={booking.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">
                  {new Date(booking.slot.start).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {booking.driveType === "Home" ? "Home" : "Showroom"}
                </CardTitle>
                <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>{booking.status}</Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">Ref: {booking.id}</p>
                {canManageAll && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Sales Rep:</label>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={booking.salesRepId ?? ""}
                      onChange={(e) => assignMutation.mutate({ bookingId: booking.id, salesRepId: e.target.value })}
                    >
                      <option value="" disabled>
                        Unassigned
                      </option>
                      {reps?.map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </CardContent>
              <BookingActionsPanel booking={booking} reps={reps ?? []} onChanged={invalidate} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingActionsPanel({
  booking,
  reps,
  onChanged,
}: {
  booking: BookingDto & { staffNotes?: string };
  reps: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const [notes, setNotes] = React.useState(booking.staffNotes ?? "");
  const [showReschedule, setShowReschedule] = React.useState(false);
  const [showCancel, setShowCancel] = React.useState(false);
  const [odometer, setOdometer] = React.useState("");
  const [rescheduleDate, setRescheduleDate] = React.useState(todayIsoDate());
  const [rescheduleTime, setRescheduleTime] = React.useState("10:00");
  const [cancelReason, setCancelReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const run = useMutation({
    mutationFn: (action: () => Promise<BookingDto>) => action(),
    onSuccess: () => {
      onChanged();
      setError(null);
      setShowReschedule(false);
      setShowCancel(false);
    },
    onError: () => setError("That action couldn't be completed. Please try again."),
  });

  const submitReschedule = () => {
    const [hh, mm] = rescheduleTime.split(":").map(Number);
    const start = new Date(`${rescheduleDate}T00:00:00`);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    run.mutate(() => rescheduleBookingAsStaff(booking.id, { start: start.toISOString(), end: end.toISOString() }));
  };

  return (
    <CardContent className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        {booking.status === "Confirmed" && !booking.checkInTimestamp && (
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => checkInBookingAsStaff(booking.id, "Manual"))}>
            Check In
          </Button>
        )}
        {booking.status === "Confirmed" && booking.checkInTimestamp && (
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-28 text-xs"
              placeholder="Odometer"
              type="number"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
            <Button
              size="sm"
              disabled={run.isPending || !odometer}
              onClick={() => run.mutate(() => startDriveAsStaff(booking.id, Number(odometer)))}
            >
              Start Drive
            </Button>
          </div>
        )}
        {booking.status === "InProgress" && (
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-28 text-xs"
              placeholder="Odometer"
              type="number"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
            <Button
              size="sm"
              disabled={run.isPending || !odometer}
              onClick={() => run.mutate(() => completeDriveAsStaff(booking.id, Number(odometer)))}
            >
              Complete Drive
            </Button>
          </div>
        )}
        {(booking.status === "Requested" || booking.status === "Confirmed") && (
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => markNoShowAsStaff(booking.id))}>
            Mark No-Show
          </Button>
        )}
        {CANCELLABLE_STATUSES.has(booking.status) && !showReschedule && !showCancel && (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowReschedule(true)}>
              Reschedule
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCancel(true)}>
              Cancel
            </Button>
          </>
        )}
        {reps.length > 0 && (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value=""
            disabled={run.isPending}
            onChange={(e) => {
              if (e.target.value) run.mutate(() => handoffBooking(booking.id, e.target.value));
            }}
          >
            <option value="">Hand off to…</option>
            {reps
              .filter((r) => r.id !== booking.salesRepId)
              .map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {showReschedule && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`admin-reschedule-date-${booking.id}`}>New Date</Label>
            <Input
              id={`admin-reschedule-date-${booking.id}`}
              type="date"
              min={todayIsoDate()}
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`admin-reschedule-time-${booking.id}`}>New Time</Label>
            <Input
              id={`admin-reschedule-time-${booking.id}`}
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={run.isPending} onClick={submitReschedule}>
            Confirm New Slot
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowReschedule(false)}>
            Cancel
          </Button>
        </div>
      )}

      {showCancel && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`admin-cancel-reason-${booking.id}`}>Reason</Label>
            <Input
              id={`admin-cancel-reason-${booking.id}`}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this booking being cancelled?"
            />
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={run.isPending || !cancelReason}
            onClick={() => run.mutate(() => cancelBookingAsStaff(booking.id, cancelReason))}
          >
            Confirm Cancel
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCancel(false)}>
            Keep Booking
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`staff-notes-${booking.id}`} className="text-xs text-muted-foreground">
          Internal Notes (staff-only)
        </Label>
        <div className="flex gap-2">
          <textarea
            id={`staff-notes-${booking.id}`}
            className="min-h-16 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={run.isPending}
            onClick={() => run.mutate(() => setBookingStaffNotes(booking.id, notes))}
          >
            Save
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </CardContent>
  );
}
