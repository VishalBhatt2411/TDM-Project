import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isBookingConflictError, cancelBooking, listMyBookings, rescheduleBooking } from "@/api/bookings";
import { TIME_SLOTS } from "@/pages/BookingPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  Requested: "warning",
  Confirmed: "success",
  Waitlisted: "secondary",
  InProgress: "success",
  Completed: "success",
  Cancelled: "destructive",
  NoShow: "destructive",
};

const CANCELLABLE_STATUSES = new Set(["Requested", "Confirmed"]);

export function MyBookingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-bookings"], queryFn: listMyBookings });
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = React.useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = React.useState(todayIsoDate());
  const [rescheduleTime, setRescheduleTime] = React.useState(TIME_SLOTS[0]);
  const [rescheduleError, setRescheduleError] = React.useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelBooking(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      setCancellingId(null);
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, start, end }: { id: string; start: string; end: string }) =>
      rescheduleBooking(id, { slot: { start, end } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      setReschedulingId(null);
      setRescheduleError(null);
    },
    onError: (err) => {
      setRescheduleError(
        isBookingConflictError(err)
          ? err.response.data.message
          : "That slot couldn't be booked. Please try a different date or time.",
      );
    },
  });

  const startReschedule = (bookingId: string) => {
    setReschedulingId(bookingId);
    setRescheduleDate(todayIsoDate());
    setRescheduleTime(TIME_SLOTS[0]);
    setRescheduleError(null);
  };

  const submitReschedule = (bookingId: string) => {
    setRescheduleError(null);
    const [hh, mm] = rescheduleTime.split(":").map(Number);
    const start = new Date(`${rescheduleDate}T00:00:00`);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    rescheduleMutation.mutate({ id: bookingId, start: start.toISOString(), end: end.toISOString() });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Test Drives</h1>
        <Link to="/vehicles">
          <Button size="sm">Book Another</Button>
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {data && data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No bookings yet — go find a vehicle to test drive.
        </p>
      )}

      <div className="space-y-3">
        {data?.map((booking) => (
          <Card key={booking.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {new Date(booking.slot.start).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                {booking.driveType === "Home" ? "Home Test Drive" : "Showroom"}
              </CardTitle>
              <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>{booking.status}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Booking ref: {booking.id}</p>
              {CANCELLABLE_STATUSES.has(booking.status) && reschedulingId !== booking.id && (
                <div className="flex gap-2">
                  {cancellingId === booking.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate({ id: booking.id, reason: "Customer requested cancellation" })}
                      >
                        Confirm Cancel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCancellingId(null)}>
                        Keep Booking
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startReschedule(booking.id)}>
                        Reschedule
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCancellingId(booking.id)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
            {reschedulingId === booking.id && (
              <CardContent className="border-t pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`reschedule-date-${booking.id}`}>New Date</Label>
                    <Input
                      id={`reschedule-date-${booking.id}`}
                      type="date"
                      min={todayIsoDate()}
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`reschedule-time-${booking.id}`}>New Time</Label>
                    <select
                      id={`reschedule-time-${booking.id}`}
                      className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                    >
                      {TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" disabled={rescheduleMutation.isPending} onClick={() => submitReschedule(booking.id)}>
                    {rescheduleMutation.isPending ? "Saving…" : "Confirm New Slot"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setReschedulingId(null); setRescheduleError(null); }}>
                    Cancel
                  </Button>
                </div>
                {rescheduleError && <p className="mt-2 text-sm text-destructive">{rescheduleError}</p>}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
