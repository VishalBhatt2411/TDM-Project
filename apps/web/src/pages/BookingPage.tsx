import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getVehicle, getVehicleAvailability, getVehicleVariants } from "@/api/vehicles";
import { TimeSlotSelect, findAvailableSlot, firstAvailableTime } from "@/components/TimeSlotSelect";
import { useEarliestDate } from "@/hooks/use-slot-picker";
import { useShoppingLocation } from "@/context/location-context";
import { createBooking, createPublicBooking, isBookingConflictError } from "@/api/bookings";
import { useAuth } from "@/context/auth-context";
import { useDealershipConfig } from "@/hooks/use-dealership-config";
import { useRegional } from "@/hooks/use-regional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DriveType, PurchaseTimeline } from "@tdm/types";
import { errorMessage } from "@/lib/api-error";
import { PURCHASE_TIMELINE_OPTIONS } from "@/lib/booking-labels";

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  city: string;
  state: string;
  preferredVariantId: string;
  driveType: DriveType;
  homeAddress: string;
  preferredDate: string;
  preferredTimeSlot: string;
  isExistingCustomer: boolean;
  currentVehicleOwned: string;
  purchaseTimeline: PurchaseTimeline;
  pickupRequired: boolean;
  pickupAddress: string;
  additionalNotes: string;
}

/** Loose shape check only — the server normalizes the number and prefixes the calling code. */
const PHONE_PATTERN = /^\+?[\d\s().-]{6,24}$/;
const INTERNATIONAL_PHONE_PATTERN = /^\+[\d\s().-]{6,24}$/;

export function BookingPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, profile } = useAuth();

  const { data: vehicle, isError: vehicleError } = useQuery({ queryKey: ["vehicle", vehicleId], queryFn: () => getVehicle(vehicleId!), enabled: !!vehicleId });
  const { data: dealership } = useDealershipConfig();
  const { data: variants } = useQuery({ queryKey: ["vehicle-variants", vehicleId], queryFn: () => getVehicleVariants(vehicleId!), enabled: !!vehicleId });
  const { branches, isReady: branchesReady } = useShoppingLocation();
  const regional = useRegional();
  // A vehicle is test-driven at the branch that stocks it — not a customer choice.
  const branch = vehicle ? branches.find((b) => b.id === vehicle.branchId) : undefined;

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmedId, setConfirmedId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      driveType: "Dealership",
      isExistingCustomer: false,
      pickupRequired: false,
      purchaseTimeline: "Just_Exploring",
      preferredDate: "",
      preferredTimeSlot: "",
    },
  });

  const driveType = watch("driveType");
  const isExistingCustomer = watch("isExistingCustomer");
  const pickupRequired = watch("pickupRequired");
  const preferredDate = watch("preferredDate");
  const preferredTimeSlot = watch("preferredTimeSlot");

  const { data: availability, isLoading: availabilityLoading } = useQuery({
    queryKey: ["vehicle-availability", vehicleId, preferredDate],
    queryFn: () => getVehicleAvailability(vehicleId!, preferredDate),
    enabled: !!vehicleId && !!preferredDate,
  });
  // Slots are on the showroom's wall clock, wherever the customer is browsing from.
  const timeZone = availability?.timeZone ?? branch?.timeZone;
  const today = timeZone ? regional.today(timeZone) : undefined;
  const phoneCountryCode = availability?.phoneCountryCode;

  // Start on today in the showroom's calendar; the dealership's notice then moves it to the first day with times left.
  React.useEffect(() => {
    if (today && !getValues("preferredDate")) setValue("preferredDate", today);
  }, [today, getValues, setValue]);
  const setPreferredDate = React.useCallback((date: string) => setValue("preferredDate", date), [setValue]);
  const earliestDate = useEarliestDate(preferredDate, availability, setPreferredDate, today);

  // Keep the picked time on a free slot of the dealership's schedule as the day changes.
  React.useEffect(() => {
    if (!findAvailableSlot(availability, getValues("preferredTimeSlot"))) setValue("preferredTimeSlot", firstAvailableTime(availability));
  }, [availability, getValues, setValue]);
  const hasBookedSlots = !!availability?.slots.some((slot) => !slot.available);

  // A logged-in customer's name/email/phone are already known server-side — this only
  // pre-fills them for a fallback guest submission if `profile` hasn't resolved yet by
  // the time they submit (see onSubmit); the fields themselves are hidden below.
  React.useEffect(() => {
    if (!profile) return;
    setValue("firstName", profile.firstName);
    setValue("lastName", profile.lastName);
    setValue("email", profile.email);
    setValue("mobileNumber", profile.phone);
  }, [profile, setValue]);

  // Most customers live near the showroom they book at — pre-fill, but never overwrite what they typed.
  React.useEffect(() => {
    if (!branch) return;
    if (!getValues("city")) setValue("city", branch.address.city);
    if (!getValues("state")) setValue("state", branch.address.state);
  }, [branch, getValues, setValue]);

  if (vehicleError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">This vehicle isn't available for booking</h1>
        <p className="mt-2 text-muted-foreground">It may have been sold or moved. Browse the vehicles available near you instead.</p>
        <Button className="mt-6" onClick={() => navigate("/vehicles")}>Explore Vehicles</Button>
      </div>
    );
  }

  if (!vehicle || !branchesReady) {
    return <p className="p-8 text-muted-foreground">Loading…</p>;
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const slot = findAvailableSlot(availability, values.preferredTimeSlot);
    if (!slot) {
      setServerError("Pick one of the free times on this date.");
      return;
    }

    const commonFields = {
      vehicleId: vehicle.id,
      preferredVariantId: values.preferredVariantId || undefined,
      branchId: vehicle.branchId,
      driveType: values.driveType,
      slot: { start: slot.start, end: slot.end },
      homeAddress:
        values.driveType === "Home"
          ? { line1: values.homeAddress, city: values.city, state: values.state, postalCode: "", country: branch?.address.country ?? "" }
          : undefined,
      city: values.city,
      state: values.state,
      isExistingCustomer: values.isExistingCustomer,
      currentVehicleOwned: values.isExistingCustomer ? values.currentVehicleOwned : undefined,
      purchaseTimeline: values.purchaseTimeline,
      pickupRequired: values.pickupRequired,
      pickupAddress: values.pickupRequired ? values.pickupAddress : undefined,
      additionalNotes: values.additionalNotes || undefined,
    };

    try {
      const result =
        isAuthenticated && profile
          ? await createBooking(commonFields)
          : await createPublicBooking({
              ...commonFields,
              firstName: values.firstName,
              lastName: values.lastName,
              email: values.email,
              mobileNumber: values.mobileNumber,
            });
      for (const key of ["my-bookings", "dashboard", "vehicle-availability"]) queryClient.invalidateQueries({ queryKey: [key] });
      setConfirmedId(result.id);
    } catch (err) {
      if (isBookingConflictError(err)) {
        setServerError(err.response.data.message);
      } else {
        setServerError(errorMessage(err, "Could not complete your booking. Please try again.") ?? null);
      }
    }
  };

  if (confirmedId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Test drive booked!</h1>
        <p className="mt-2 text-muted-foreground">
          Your {vehicle.year} {vehicle.make} {vehicle.model} test drive is requested. Booking reference:{" "}
          <code className="rounded bg-muted px-1">{confirmedId}</code>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAuthenticated
            ? "We've emailed you a confirmation — you can track this booking anytime from \"My Test Drives\"."
            : "We've emailed you a confirmation along with a secure link to access your account and manage this booking."}
        </p>
        <Button className="mt-6" onClick={() => navigate("/vehicles")}>
          Explore More Vehicles
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>
            Book a Test Drive — {vehicle.year} {vehicle.make} {vehicle.model}
          </CardTitle>
          <CardDescription>
            {isAuthenticated ? "Just a few booking details to get you scheduled." : "Fill in your details — no account needed to get started."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <section>
              {isAuthenticated ? (
                profile ? (
                  <p className="mb-3 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Booking as <span className="font-medium text-foreground">{profile.firstName} {profile.lastName}</span> ({profile.email})
                  </p>
                ) : (
                  <div className="mb-3 h-9 animate-pulse rounded-md bg-muted/50" />
                )
              ) : (
                <>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Your Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName">First name</Label>
                      <Input id="firstName" {...register("firstName", { required: true })} />
                      {errors.firstName && <p className="text-xs text-destructive">Required</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName">Last name</Label>
                      <Input id="lastName" {...register("lastName", { required: true })} />
                      {errors.lastName && <p className="text-xs text-destructive">Required</p>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" {...register("email", { required: true })} />
                      {errors.email && <p className="text-xs text-destructive">Required</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mobileNumber">Mobile Number</Label>
                      <div className="flex">
                        {phoneCountryCode && (
                          <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                            +{phoneCountryCode}
                          </span>
                        )}
                        <Input
                          id="mobileNumber"
                          type="tel"
                          autoComplete="tel"
                          className={phoneCountryCode ? "rounded-l-none" : undefined}
                          maxLength={24}
                          placeholder={phoneCountryCode ? undefined : "+ country code and number"}
                          {...register("mobileNumber", {
                            required: true,
                            pattern: phoneCountryCode ? PHONE_PATTERN : INTERNATIONAL_PHONE_PATTERN,
                          })}
                        />
                      </div>
                      {errors.mobileNumber && (
                        <p className="text-xs text-destructive">
                          {phoneCountryCode
                            ? "Enter a valid mobile number"
                            : "Enter your number in international format, starting with + and the country code"}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" {...register("city", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" {...register("state", { required: true })} />
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" {...register("isExistingCustomer")} />
                {dealership?.name ? `I'm an existing ${dealership.name} customer` : "I'm an existing customer"}
              </label>
              {isExistingCustomer && (
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="currentVehicleOwned">Current vehicle owned</Label>
                  <Input id="currentVehicleOwned" placeholder="Make, model and year" {...register("currentVehicleOwned")} />
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Booking Details</h3>
              {variants && variants.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="preferredVariantId">Preferred Variant</Label>
                  <select id="preferredVariantId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register("preferredVariantId")}>
                    <option value="">No preference</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">Test drive at</p>
                {branch ? (
                  <>
                    <p className="text-sm font-medium">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {branch.address.line1}, {branch.address.city} ·{" "}
                      <Link to="/branches" className="text-primary underline">View on map</Link>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-destructive">This vehicle's showroom isn't taking bookings right now.</p>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant={driveType === "Dealership" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setValue("driveType", "Dealership")}
                >
                  At the Showroom
                </Button>
                <Button
                  type="button"
                  variant={driveType === "Home" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setValue("driveType", "Home")}
                >
                  Home Test Drive
                </Button>
              </div>
              {driveType === "Home" && (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="homeAddress">Home Address</Label>
                  <Input id="homeAddress" {...register("homeAddress", { required: driveType === "Home" })} />
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="preferredDate">Preferred Date</Label>
                  <Input id="preferredDate" type="date" min={earliestDate} {...register("preferredDate", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preferredTimeSlot">Preferred Time Slot</Label>
                  <TimeSlotSelect
                    id="preferredTimeSlot"
                    availability={availability}
                    isLoading={availabilityLoading}
                    {...register("preferredTimeSlot", { required: true })}
                  />
                  {hasBookedSlots && (
                    <p className="text-xs text-muted-foreground">
                      Some slots on this date are already booked for this vehicle — pick another time or we'll offer alternatives if there's a conflict.
                    </p>
                  )}
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" {...register("pickupRequired")} />
                I'd like to be picked up for my showroom visit
              </label>
              {pickupRequired && (
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="pickupAddress">Pickup Address</Label>
                  <Input id="pickupAddress" {...register("pickupAddress", { required: pickupRequired })} />
                </div>
              )}

              <div className="mt-3 space-y-1.5">
                <Label htmlFor="purchaseTimeline">When are you planning to purchase?</Label>
                <select id="purchaseTimeline" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register("purchaseTimeline")}>
                  {PURCHASE_TIMELINE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3 space-y-1.5">
                <Label htmlFor="additionalNotes">Additional Notes (optional)</Label>
                <textarea
                  id="additionalNotes"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...register("additionalNotes")}
                />
              </div>
            </section>

            {serverError && <p className="text-sm text-destructive">{serverError}</p>}

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || !branch || !findAvailableSlot(availability, preferredTimeSlot) || (isAuthenticated && !profile)}>
              {isSubmitting ? "Booking…" : "Confirm Test Drive Booking"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
