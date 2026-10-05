import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignSalesRep,
  cancelBookingAsStaff,
  checkInBookingAsStaff,
  completeDriveAsStaff,
  handoffBooking,
  listAdminBookings,
  listDealershipsLookup,
  listMyAssignedBookings,
  listSalesRepsLookup,
  markNoShowAsStaff,
  rescheduleBookingAsStaff,
  setBookingStaffNotes,
  startDriveAsStaff,
  type SalesRepLookupDto,
} from "@/api/admin";
import { useAdminRegional, useDealershipTimeZones } from "@/hooks/use-regional";
import { useEarliestDate, useStaffSlotPicker } from "@/hooks/use-slot-picker";
import { TimeSlotSelect } from "@/components/TimeSlotSelect";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/ui/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrScanner } from "@/components/admin/QrScanner";
import { errorMessage } from "@/lib/api-error";
import { ComplianceReviewPanel } from "@/components/admin/ComplianceReviewPanel";
import { purchaseTimelineLabel } from "@/lib/booking-labels";
import { Car, Mail, MapPin, Phone } from "lucide-react";
import type { AdminBookingDto, BookingDto, BookingStatus } from "@tdm/types";

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
const PAGE_SIZE = 25;
const CANCELLABLE_STATUSES = new Set(["Requested", "Confirmed"]);

export function AdminBookingsPage() {
  const { hasPermission } = useAdminAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const selectStatus = (status: BookingStatus | undefined) => {
    setStatusFilter(status);
    setPage(1);
  };

  const canManageAll = hasPermission("manage_bookings");
  const scopeKey = canManageAll ? "admin-bookings" : "my-assigned-bookings";

  const { data, isLoading, error, refetch, isRefetching, isFetching } = useQuery({
    queryKey: [scopeKey, statusFilter, page],
    queryFn: () =>
      canManageAll
        ? listAdminBookings({ status: statusFilter, page, pageSize: PAGE_SIZE })
        : listMyAssignedBookings({ status: statusFilter, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  // A status change elsewhere can shrink the list under the current page; step back instead of showing an empty page.
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const { data: reps } = useQuery({ queryKey: ["sales-reps-lookup"], queryFn: listSalesRepsLookup });
  const regional = useAdminRegional();
  const zones = useDealershipTimeZones();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [scopeKey] });

  const assignMutation = useMutation({
    mutationFn: ({ bookingId, salesRepId }: { bookingId: string; salesRepId: string }) => assignSalesRep(bookingId, salesRepId),
    onSuccess: invalidate,
  });
  const assignError = assignMutation.isError ? errorMessage(assignMutation.error, "Couldn't assign that sales representative. Please try again.") : null;

  return (
    <div className="p-4 sm:p-8">
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
          onClick={() => selectStatus(undefined)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${!statusFilter ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => selectStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${statusFilter === s ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {assignError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {assignError}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : error && !data ? (
        <QueryError error={error} subject="bookings" onRetry={() => refetch()} isRetrying={isRefetching} />
      ) : data?.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No bookings match this filter.</p>
      ) : (
        <div className="space-y-3">
          {data?.items.map((booking) => (
            <Card key={booking.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{booking.customer ? booking.customer.name || "Unnamed contact" : "Customer record unavailable"}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {regional.dateTime(booking.slot.start, zones.get(booking.dealershipId))} ·{" "}
                    {booking.driveType === "Home" ? "Home drive" : "Showroom drive"}
                    {booking.branchName && <> · {booking.branchName}</>}
                  </p>
                </div>
                <Badge className="shrink-0" variant={STATUS_VARIANT[booking.status] ?? "secondary"}>
                  {booking.status}
                </Badge>
              </CardHeader>
              <BookingDetails booking={booking} />
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="break-all text-xs text-muted-foreground">Ref: {booking.id}</p>
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
                      {reps
                        ?.filter((rep) => rep.dealershipId === booking.dealershipId)
                        .map((rep) => (
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
          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Bookings pages">
              <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {data?.total} bookings
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

function BookingDetails({ booking }: { booking: AdminBookingDto }) {
  const { customer, vehicle, homeAddress } = booking;
  return (
    <CardContent className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
      <div className="flex min-w-0 gap-3">
        {vehicle?.imageUrl ? (
          <img src={vehicle.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" loading="lazy" />
        ) : (
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="font-medium">{vehicle?.label ?? "Vehicle record unavailable"}</p>
          {vehicle && (
            <p className="break-all text-xs text-muted-foreground">
              {[vehicle.color, vehicle.vin && `VIN ${vehicle.vin}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-1">
        {customer?.phone || customer?.email ? (
          <>
            {customer.phone && (
              <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {customer.phone}
              </a>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="flex min-w-0 items-center gap-2 hover:underline">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{customer.email}</span>
              </a>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No contact details on file.</p>
        )}
        {homeAddress && (
          <p className="flex gap-2 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            {[homeAddress.line1, homeAddress.city, homeAddress.state, homeAddress.postalCode].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Buying</dt>
        <dd>{purchaseTimelineLabel(booking.purchaseTimeline)}</dd>
        <dt className="text-muted-foreground">Customer</dt>
        <dd>{booking.isExistingCustomer ? "Existing" : "New"}</dd>
        {booking.currentVehicleOwned && (
          <>
            <dt className="text-muted-foreground">Drives</dt>
            <dd className="break-words">{booking.currentVehicleOwned}</dd>
          </>
        )}
        {booking.pickupRequired && (
          <>
            <dt className="text-muted-foreground">Pickup</dt>
            <dd>Required</dd>
          </>
        )}
        {booking.additionalNotes && (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd className="break-words">{booking.additionalNotes}</dd>
          </>
        )}
      </dl>
    </CardContent>
  );
}

function BookingActionsPanel({
  booking,
  reps,
  onChanged,
}: {
  booking: BookingDto & { staffNotes?: string };
  reps: SalesRepLookupDto[];
  onChanged: () => void;
}) {
  const [notes, setNotes] = React.useState(booking.staffNotes ?? "");
  const [showReschedule, setShowReschedule] = React.useState(false);
  const [showCancel, setShowCancel] = React.useState(false);
  const [showQrScanner, setShowQrScanner] = React.useState(false);
  const [showCompliance, setShowCompliance] = React.useState(false);
  const [odometer, setOdometer] = React.useState("");
  const regional = useAdminRegional();
  // The booking happens at its dealership: dates and times are picked on that wall clock.
  const timeZone = useDealershipTimeZones().get(booking.dealershipId) ?? regional.timeZone;
  const { data: dealerships } = useQuery({ queryKey: ["dealerships-lookup"], queryFn: listDealershipsLookup });
  const qrCheckIn = dealerships?.find((d) => d.id === booking.dealershipId)?.qrCheckIn ?? false;
  const [rescheduleDate, setRescheduleDate] = React.useState(() => regional.today(timeZone));
  const reschedulePicker = useStaffSlotPicker(booking.id, rescheduleDate, showReschedule);
  const rescheduleMin = useEarliestDate(rescheduleDate, reschedulePicker.availability, setRescheduleDate, regional.today(timeZone));
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
    onError: (err) => setError(errorMessage(err, "That action couldn't be completed. Please try again.") ?? null),
  });

  const submitReschedule = () => {
    const { slot } = reschedulePicker;
    if (!slot) {
      setError("Pick one of the free times on this date.");
      return;
    }
    run.mutate(() => rescheduleBookingAsStaff(booking.id, { start: slot.start, end: slot.end }));
  };

  return (
    <CardContent className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        {booking.status === "Confirmed" && !booking.checkInTimestamp && (
          <>
            <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => checkInBookingAsStaff(booking.id, "Manual"))}>
              Check In (Manual)
            </Button>
            {qrCheckIn && (
              <Button size="sm" variant="outline" onClick={() => setShowQrScanner((v) => !v)}>
                {showQrScanner ? "Hide QR Scanner" : "Check In with QR"}
              </Button>
            )}
          </>
        )}
        {booking.status === "Confirmed" && (
          <Button size="sm" variant="outline" onClick={() => setShowCompliance((v) => !v)}>
            {showCompliance ? "Hide Compliance" : "Review Compliance"}
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
              .filter((r) => r.id !== booking.salesRepId && r.dealershipId === booking.dealershipId)
              .map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {qrCheckIn && showQrScanner && (
        <div className="rounded-md bg-muted/40 p-3">
          <QrScanner
            onDetect={(code) => {
              setShowQrScanner(false);
              run.mutate(() => checkInBookingAsStaff(booking.id, "QR", code));
            }}
          />
        </div>
      )}

      {showCompliance && <ComplianceReviewPanel bookingId={booking.id} />}

      {showReschedule && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`admin-reschedule-date-${booking.id}`}>New Date</Label>
            <Input
              id={`admin-reschedule-date-${booking.id}`}
              type="date"
              min={rescheduleMin}
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`admin-reschedule-time-${booking.id}`}>
              New Time{reschedulePicker.availability ? ` (${reschedulePicker.availability.timeZone})` : ""}
            </Label>
            <TimeSlotSelect
              id={`admin-reschedule-time-${booking.id}`}
              className="w-auto min-w-40"
              formatter={regional}
              availability={reschedulePicker.availability}
              isLoading={reschedulePicker.isLoading}
              value={reschedulePicker.time}
              onChange={(e) => reschedulePicker.setTime(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={run.isPending || !reschedulePicker.slot} onClick={submitReschedule}>
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
