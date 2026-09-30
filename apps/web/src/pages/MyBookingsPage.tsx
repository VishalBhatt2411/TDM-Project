import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isBookingConflictError, cancelBooking, listMyBookings, rescheduleBooking } from "@/api/bookings";
import { getDashboard, getRecommendations } from "@/api/customers";
import { TIME_SLOTS } from "@/pages/BookingPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleCard } from "@/components/VehicleCard";
import { QrCheckInCode } from "@/components/QrCheckInCode";
import { downloadBookingIcs } from "@/lib/ics";
import { useShoppingLocation } from "@/context/location-context";
import { useRegional } from "@/hooks/use-regional";
import { SLOT_DURATION_MINUTES, zonedDateTimeToUtc, type BookingDto } from "@tdm/types";

function addToCalendar(booking: BookingDto) {
  downloadBookingIcs({
    uid: booking.id,
    title: `Test Drive · ${booking.driveType === "Home" ? "Home Visit" : "Showroom"}`,
    description: "Test drive appointment booked via TDM Studio.",
    location: booking.homeAddress ? booking.homeAddress.line1 : "Dealership",
    start: booking.slot.start,
    end: booking.slot.end,
  });
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
  const { data: dashboard } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
  const { data: recommendations } = useQuery({ queryKey: ["recommendations"], queryFn: () => getRecommendations(3) });
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = React.useState<string | null>(null);
  const regional = useRegional();
  const { branches } = useShoppingLocation();
  // A drive happens at its branch: its times are shown, and a new one picked, on that wall clock.
  const zoneOf = (booking: BookingDto) => branches.find((b) => b.id === booking.branchId)?.timeZone ?? regional.timeZone;
  const [rescheduleDate, setRescheduleDate] = React.useState("");
  const [rescheduleTime, setRescheduleTime] = React.useState(TIME_SLOTS[0]);
  const [rescheduleError, setRescheduleError] = React.useState<string | null>(null);
  const [qrBookingId, setQrBookingId] = React.useState<string | null>(null);

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

  const startReschedule = (booking: BookingDto) => {
    setReschedulingId(booking.id);
    setRescheduleDate(regional.today(zoneOf(booking)));
    setRescheduleTime(TIME_SLOTS[0]);
    setRescheduleError(null);
  };

  const submitReschedule = (booking: BookingDto) => {
    setRescheduleError(null);
    const timeZone = zoneOf(booking);
    if (!timeZone || !rescheduleDate) return;
    const start = zonedDateTimeToUtc(rescheduleDate, rescheduleTime, timeZone);
    const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60_000);
    rescheduleMutation.mutate({ id: booking.id, start: start.toISOString(), end: end.toISOString() });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Test Drives</h1>
        <Link to="/vehicles">
          <Button size="sm">Book Another</Button>
        </Link>
      </div>

      {dashboard && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-foreground">{dashboard.upcomingBookingsCount}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-foreground">{dashboard.pastBookingsCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-foreground">{dashboard.wishlistCount}</p>
              <p className="text-xs text-muted-foreground">Wishlisted</p>
            </CardContent>
          </Card>
        </div>
      )}

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
                {regional.dateTime(booking.slot.start, zoneOf(booking))} ·{" "}
                {booking.driveType === "Home" ? "Home Test Drive" : "Showroom"}
              </CardTitle>
              <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>{booking.status}</Badge>
            </CardHeader>
            {booking.status === "Confirmed" && (
              <CardContent className="flex flex-wrap gap-2 border-b pb-4">
                <Link to={`/bookings/${booking.id}/compliance`}>
                  <Button size="sm" variant="outline">Pre-Drive Check-In</Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => setQrBookingId(qrBookingId === booking.id ? null : booking.id)}>
                  {qrBookingId === booking.id ? "Hide Check-In Code" : "Show Check-In Code"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => addToCalendar(booking)}>
                  Add to Calendar
                </Button>
              </CardContent>
            )}
            {qrBookingId === booking.id && (
              <CardContent className="border-b py-4">
                <QrCheckInCode bookingId={booking.id} timeZone={zoneOf(booking)} />
              </CardContent>
            )}
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
                      <Button size="sm" variant="outline" onClick={() => startReschedule(booking)}>
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
                      min={regional.today(zoneOf(booking))}
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
                  <Button size="sm" disabled={rescheduleMutation.isPending || !zoneOf(booking) || !rescheduleDate} onClick={() => submitReschedule(booking)}>
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

      {recommendations && recommendations.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Recommended for you</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recommendations.map((rec, i) => (
              <VehicleCard key={rec.vehicle.id} vehicle={rec.vehicle} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
