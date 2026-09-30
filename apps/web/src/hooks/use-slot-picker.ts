import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { VehicleAvailabilityResponse } from "@tdm/types";
import { getVehicleAvailability } from "@/api/vehicles";
import { getBookingSlotsAsStaff } from "@/api/admin";
import { findAvailableSlot, firstAvailableTime } from "@/components/TimeSlotSelect";

/**
 * A day's slots (the dealership's schedule, less what's booked) and the picked one — kept on a
 * free slot: it moves to the day's first free slot whenever the day changes or the picked one is taken.
 */
function useSlotPickerQuery(queryKey: readonly unknown[], load: () => Promise<VehicleAvailabilityResponse>, enabled: boolean) {
  const { data: availability, isLoading } = useQuery({ queryKey, queryFn: load, enabled });
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    setTime((current) => (findAvailableSlot(availability, current) ? current : firstAvailableTime(availability)));
  }, [availability]);

  return { availability, isLoading: isLoading && enabled, time, setTime, slot: findAvailableSlot(availability, time) };
}

/**
 * Keeps a picked date on or after the first one with slots still bookable (the server's
 * `earliestDate`, which applies the dealership's notice) and returns it as the date picker's
 * `min` — `fallbackMin` until the first answer arrives. `setDate` must be stable.
 */
export function useEarliestDate(
  date: string,
  availability: VehicleAvailabilityResponse | undefined,
  setDate: (date: string) => void,
  fallbackMin?: string,
): string | undefined {
  const earliestDate = availability?.earliestDate;
  React.useEffect(() => {
    if (earliestDate && date && date < earliestDate) setDate(earliestDate);
  }, [date, earliestDate, setDate]);
  return earliestDate ?? fallbackMin;
}

/** A vehicle's slots on `date`, from the customer site. */
export function useSlotPicker(vehicleId: string | undefined, date: string) {
  return useSlotPickerQuery(["vehicle-availability", vehicleId, date], () => getVehicleAvailability(vehicleId!, date), !!vehicleId && !!date);
}

/** A booking's reschedule options on `date`, from the admin console (checked against the staff member's access to it). */
export function useStaffSlotPicker(bookingId: string, date: string, enabled: boolean) {
  return useSlotPickerQuery(["admin-booking-slots", bookingId, date], () => getBookingSlotsAsStaff(bookingId, date), enabled && !!date);
}
