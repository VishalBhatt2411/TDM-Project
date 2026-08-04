import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignSalesRep, listAdminBookings, listSalesRepsLookup } from "@/api/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BookingStatus } from "@tdm/types";

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

export function AdminBookingsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-bookings", statusFilter],
    queryFn: () => listAdminBookings({ status: statusFilter, pageSize: 50 }),
  });
  const { data: reps } = useQuery({ queryKey: ["sales-reps-lookup"], queryFn: listSalesRepsLookup });

  const assignMutation = useMutation({
    mutationFn: ({ bookingId, salesRepId }: { bookingId: string; salesRepId: string }) => assignSalesRep(bookingId, salesRepId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }),
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Test Drive Management</h1>
        <p className="text-sm text-muted-foreground">
          View all bookings and assign sales representatives — changes sync directly to Salesforce.
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
