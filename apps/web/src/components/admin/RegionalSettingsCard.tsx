import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";
import { getRegionalSettings, saveRegionalSettings } from "@/api/admin";
import type { ConfigScopeParams, RegionalSettingsLayerDto } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api-error";

interface RegionalForm {
  locale: string;
  timeZone: string;
  phoneCountryCode: string;
}

const CALLING_CODE = /^\+?[1-9]\d{0,2}$/;
const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
/** A sample amount for the formatting preview. */
const SAMPLE_AMOUNT = 1234567;

function toForm(layer: RegionalSettingsLayerDto): RegionalForm {
  return { locale: layer.locale ?? "", timeZone: layer.timeZone ?? "", phoneCountryCode: layer.phoneCountryCode ?? "" };
}

/** The layer to save: blanks dropped, so they inherit. */
function toLayer(form: RegionalForm): RegionalSettingsLayerDto {
  const locale = form.locale.trim();
  const phoneCountryCode = form.phoneCountryCode.trim().replace(/^\+/, "");
  return {
    ...(locale ? { locale } : {}),
    ...(form.timeZone ? { timeZone: form.timeZone } : {}),
    ...(phoneCountryCode ? { phoneCountryCode } : {}),
  };
}

/** The canonical form of a BCP 47 tag ("en-in" → "en-IN"), or undefined when it isn't one. */
function canonicalLocale(tag: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
}

function validate(form: RegionalForm): Partial<Record<keyof RegionalForm, string>> {
  const errors: Partial<Record<keyof RegionalForm, string>> = {};
  const locale = form.locale.trim();
  if (locale && !canonicalLocale(locale)) errors.locale = "Use a language tag with a region, such as en-GB or fr-CA.";
  const code = form.phoneCountryCode.trim();
  if (code && !CALLING_CODE.test(code)) errors.phoneCountryCode = "Use a 1–3 digit calling code, such as 44.";
  return errors;
}

function formatPreview(locale: string, timeZone: string, currencyCode: string): string | undefined {
  try {
    const when = new Date().toLocaleString(locale, { dateStyle: "full", timeStyle: "short", timeZone });
    const money = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(SAMPLE_AMOUNT);
    return `${when} · ${money}`;
  } catch {
    return undefined;
  }
}

/**
 * Locale, time zone and phone calling code for one scope (company-wide or a dealership).
 * Blank fields inherit — a dealership from the company, the company from the connected org.
 */
export function RegionalSettingsCard({ scope }: { scope: ConfigScopeParams }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-regional-settings", scope.dealershipId ?? null];
  const { data, isLoading, isError, error } = useQuery({ queryKey, queryFn: () => getRegionalSettings(scope) });
  const [form, setForm] = React.useState<RegionalForm | null>(null);
  const [savedAt, setSavedAt] = React.useState<number>();

  React.useEffect(() => {
    setForm(data ? toForm(data.own) : null);
  }, [data]);

  const save = useMutation({
    mutationFn: (layer: RegionalSettingsLayerDto) => saveRegionalSettings(scope, layer),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
      for (const key of ["admin-regional", "dealerships-lookup", "dealership-config"]) queryClient.invalidateQueries({ queryKey: [key] });
      setSavedAt(Date.now());
    },
  });

  if (isLoading) return <div className="h-72 animate-pulse rounded-lg bg-muted" />;
  if (isError) return <p className="text-destructive">{errorMessage(error) ?? "Couldn't load regional settings."}</p>;
  if (!data || !form) return null;

  const { inherited, providerDefaults, effective, schema } = data;
  const fallback = {
    locale: inherited?.locale ?? providerDefaults.locale,
    timeZone: inherited?.timeZone ?? providerDefaults.timeZone,
    phoneCountryCode: inherited?.phoneCountryCode,
  };
  const inheritNoun = inherited ? "Inherit" : "Default";
  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = JSON.stringify(toLayer(form)) !== JSON.stringify(toLayer(toForm(data.own)));
  const previewLocale = canonicalLocale(form.locale.trim()) ?? fallback.locale;
  const preview = formatPreview(previewLocale, form.timeZone || fallback.timeZone, effective.currencyCode);
  const effectiveCode = form.phoneCountryCode.trim().replace(/^\+/, "") || fallback.phoneCountryCode;

  const update = (patch: Partial<RegionalForm>) => {
    setSavedAt(undefined);
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regional settings</CardTitle>
        <CardDescription>
          How dates, times, money and phone numbers read for customers and in emails. Blank fields use the value shown as the placeholder
          {inherited ? " (company-wide)" : " (the connected org's own settings)"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!hasErrors) save.mutate(toLayer(form));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="regional-locale">Locale</Label>
              <Input
                id="regional-locale"
                maxLength={schema.maxLength.locale}
                placeholder={fallback.locale}
                value={form.locale}
                onChange={(e) => update({ locale: e.target.value })}
                aria-invalid={!!errors.locale}
              />
              <p className={errors.locale ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errors.locale ?? "Language and region, e.g. en-GB. The customer's chosen language still applies."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regional-timezone">Time zone</Label>
              <select id="regional-timezone" className={SELECT_CLASS} value={form.timeZone} onChange={(e) => update({ timeZone: e.target.value })}>
                <option value="">
                  {inheritNoun} ({fallback.timeZone})
                </option>
                {schema.timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Booking slots, reminders and every time shown use this showroom clock.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regional-phone">Phone calling code</Label>
              <div className="flex">
                <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">+</span>
                <Input
                  id="regional-phone"
                  className="rounded-l-none"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={fallback.phoneCountryCode ?? ""}
                  value={form.phoneCountryCode}
                  onChange={(e) => update({ phoneCountryCode: e.target.value })}
                  aria-invalid={!!errors.phoneCountryCode}
                />
              </div>
              <p className={errors.phoneCountryCode ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errors.phoneCountryCode ??
                  (effectiveCode
                    ? `Customers type a local number; +${effectiveCode} is added for them.`
                    : "Not set — customers must enter numbers in international format (+ and country code).")}
                {!errors.phoneCountryCode && providerDefaults.country && ` Org country: ${providerDefaults.country}.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regional-currency">Currency</Label>
              <Input id="regional-currency" value={effective.currencyCode} readOnly disabled />
              <p className="text-xs text-muted-foreground">The connected org's currency — vehicle prices are stored in it, so it isn't editable here.</p>
            </div>
          </div>

          {preview && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm" aria-label="Formatting preview">
              {preview}
            </p>
          )}

          {save.isError && <p className="text-sm text-destructive">{errorMessage(save.error)}</p>}
          {savedAt && !isDirty && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Saved. Customers see it within a minute.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!isDirty || hasErrors || save.isPending}>
              {save.isPending ? "Saving…" : "Save regional settings"}
            </Button>
            <Button type="button" variant="outline" disabled={!isDirty || save.isPending} onClick={() => setForm(toForm(data.own))}>
              Discard
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={save.isPending || !Object.keys(toLayer(form)).length}
              onClick={() => update({ locale: "", timeZone: "", phoneCountryCode: "" })}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear all
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
