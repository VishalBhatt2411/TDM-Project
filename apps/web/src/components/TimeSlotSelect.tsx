import * as React from "react";
import type { VehicleAvailabilityResponse } from "@tdm/types";
import { useRegional } from "@/hooks/use-regional";
import type { RegionalFormatter } from "@/lib/regional";
import { cn } from "@/lib/utils";

export type AvailabilitySlot = VehicleAvailabilityResponse["slots"][number];

interface TimeSlotSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  /** The day's schedule from the availability endpoint; undefined while it loads. */
  availability: VehicleAvailabilityResponse | undefined;
  isLoading?: boolean;
  /** Formats the labels — the customer site's by default; the admin console passes its own. */
  formatter?: RegionalFormatter;
}

/** The first slot of the day that's still free — what a slot picker should start on. */
export function firstAvailableTime(availability: VehicleAvailabilityResponse | undefined): string {
  return availability?.slots.find((slot) => slot.available)?.time ?? "";
}

/** The slot for a picked wall-clock time, only while it's still free. */
export function findAvailableSlot(availability: VehicleAvailabilityResponse | undefined, time: string): AvailabilitySlot | undefined {
  return availability?.slots.find((slot) => slot.time === time && slot.available);
}

/**
 * A day's bookable slots, as the dealership's schedule defines them — the value is the slot's
 * wall-clock start ("09:30"), labelled in the customer's locale on the showroom's clock.
 */
export const TimeSlotSelect = React.forwardRef<HTMLSelectElement, TimeSlotSelectProps>(function TimeSlotSelect(
  { availability, isLoading, formatter, className, disabled, ...props },
  ref,
) {
  const customerRegional = useRegional();
  const regional = formatter ?? customerRegional;
  const slots = availability?.slots ?? [];
  const hasFree = slots.some((slot) => slot.available);
  const placeholder =
    isLoading || !availability
      ? "Loading times…"
      : !availability.isOpen
        ? "Closed on this day"
        : slots.length === 0
          ? "No times left on this day"
          : hasFree
            ? null
            : "Fully booked";

  return (
    <select
      ref={ref}
      className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60", className)}
      disabled={disabled || !hasFree}
      {...props}
    >
      {placeholder ? (
        <option value="">{placeholder}</option>
      ) : (
        slots.map((slot) => (
          <option key={slot.time} value={slot.time} disabled={!slot.available}>
            {regional.time(slot.start, availability!.timeZone)}
            {slot.available ? "" : " (already booked)"}
          </option>
        ))
      )}
    </select>
  );
});
