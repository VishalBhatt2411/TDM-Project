import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cancelBooking, listMyBookings } from "@/api/bookings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelBooking(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      setCancellingId(null);
    },
  });

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
              {CANCELLABLE_STATUSES.has(booking.status) && (
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
                    <Button size="sm" variant="outline" onClick={() => setCancellingId(booking.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
