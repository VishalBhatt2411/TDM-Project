import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getVehicle, getVehicleVariants } from "@/api/vehicles";
import { listBranches } from "@/api/branches";
import { createBooking, createPublicBooking, isBookingConflictError } from "@/api/bookings";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DriveType, PurchaseTimeline } from "@tdm/types";

export const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
];

const PURCHASE_TIMELINE_OPTIONS: { value: PurchaseTimeline; label: string }[] = [
  { value: "Immediate", label: "Immediately" },
  { value: "Within_1_Month", label: "Within 1 month" },
  { value: "Within_3_Months", label: "Within 3 months" },
  { value: "Within_6_Months", label: "Within 6 months" },
  { value: "Just_Exploring", label: "Just exploring" },
];

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  city: string;
  state: string;
  preferredVariantId: string;
  branchId: string;
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

function todayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function BookingPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();

  const { data: vehicle } = useQuery({ queryKey: ["vehicle", vehicleId], queryFn: () => getVehicle(vehicleId!), enabled: !!vehicleId });
  const { data: variants } = useQuery({ queryKey: ["vehicle-variants", vehicleId], queryFn: () => getVehicleVariants(vehicleId!), enabled: !!vehicleId });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranches });

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmedId, setConfirmedId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      driveType: "Dealership",
      isExistingCustomer: false,
      pickupRequired: false,
      purchaseTimeline: "Just_Exploring",
      preferredDate: todayIsoDate(),
      preferredTimeSlot: TIME_SLOTS[0],
    },
  });

  const driveType = watch("driveType");
  const isExistingCustomer = watch("isExistingCustomer");
  const pickupRequired = watch("pickupRequired");

  // A logged-in customer's name/email/phone are already known server-side — this only
  // pre-fills them for a fallback guest submission if `profile` hasn't resolved yet by
  // the time they submit (see onSubmit); the fields themselves are hidden below.
  React.useEffect(() => {
    if (!profile) return;
    setValue("firstName", profile.firstName);
    setValue("lastName", profile.lastName);
    setValue("email", profile.email);
    setValue("mobileNumber", profile.phone.replace(/^\+91/, ""));
  }, [profile, setValue]);

  if (!vehicle || !branches) {
    return <p className="p-8 text-muted-foreground">Loading…</p>;
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const [hh, mm] = values.preferredTimeSlot.split(":").map(Number);
    const start = new Date(`${values.preferredDate}T00:00:00`);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const commonFields = {
      vehicleId: vehicle.id,
      preferredVariantId: values.preferredVariantId || undefined,
      branchId: values.branchId,
      driveType: values.driveType,
      slot: { start: start.toISOString(), end: end.toISOString() },
      homeAddress:
        values.driveType === "Home"
          ? { line1: values.homeAddress, city: values.city, state: values.state, postalCode: "", country: "India" }
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
      setConfirmedId(result.id);
    } catch (err) {
      if (isBookingConflictError(err)) {
        setServerError(err.response.data.message);
      } else {
        setServerError((err as any)?.response?.data?.message ?? "Could not complete your booking. Please try again.");
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
                        <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                          +91
                        </span>
                        <Input
                          id="mobileNumber"
                          className="rounded-l-none"
                          maxLength={10}
                          placeholder="9876543210"
                          {...register("mobileNumber", { required: true, pattern: /^[6-9]\d{9}$/ })}
                        />
                      </div>
                      {errors.mobileNumber && <p className="text-xs text-destructive">Enter a valid 10-digit mobile number</p>}
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
                I'm an existing Toyota customer
              </label>
              {isExistingCustomer && (
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="currentVehicleOwned">Current vehicle owned</Label>
                  <Input id="currentVehicleOwned" placeholder="e.g. Toyota Innova 2019" {...register("currentVehicleOwned")} />
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
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="branchId">Preferred Dealership</Label>
                <select id="branchId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register("branchId", { required: true })}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
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
                  <Input id="preferredDate" type="date" min={todayIsoDate()} {...register("preferredDate", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preferredTimeSlot">Preferred Time Slot</Label>
                  <select id="preferredTimeSlot" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register("preferredTimeSlot", { required: true })}>
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
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

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || (isAuthenticated && !profile)}>
              {isSubmitting ? "Booking…" : "Confirm Test Drive Booking"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
