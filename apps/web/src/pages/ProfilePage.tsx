import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { updateProfile } from "@/api/customers";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LANGUAGES: { value: "en" | "hi" | "es" | "fr"; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  preferredLanguage: z.enum(["en", "hi", "es", "fr"]),
  marketingOptIn: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    values: profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          preferredLanguage: profile.preferredLanguage,
          marketingOptIn: profile.marketingOptIn,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: async (updated) => {
      await refreshProfile();
      setSuccessMessage("Your profile has been updated.");
      reset({
        firstName: updated.firstName,
        lastName: updated.lastName,
        preferredLanguage: updated.preferredLanguage,
        marketingOptIn: updated.marketingOptIn,
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    setSuccessMessage(null);
    mutation.mutate(values);
  };

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">My Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>
            Email and phone are your verified sign-in identity and can't be changed here — contact support if either needs updating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...register("firstName")} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...register("lastName")} />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={profile.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={profile.phone} disabled />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preferredLanguage">Preferred language</Label>
              <select
                id="preferredLanguage"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...register("preferredLanguage")}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 rounded border-input" {...register("marketingOptIn")} />
              Send me offers and updates by email
            </label>

            {mutation.isError && (
              <p className="text-sm text-destructive">Couldn't save your changes. Please try again.</p>
            )}
            {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}

            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
