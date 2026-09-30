import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { getBookingSchedule, saveBookingSchedule } from "@/api/admin";
import type { BookingScheduleEditorDto, BookingScheduleLayerDto, ConfigScopeParams, TimeWindowDto, WeeklyHoursDto } from "@/api/admin";
import { useAdminRegional } from "@/hooks/use-regional";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api-error";

interface DayForm {
  open: boolean;
  start: string;
  end: string;
}

interface ScheduleForm {
  /** "" inherits. */
  slotMinutes: string;
  ownHours: boolean;
  hours: Record<string, DayForm>;
  ownBreaks: boolean;
  breaks: TimeWindowDto[];
}

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
/** A time input can't hold "24:00": midnight at the end of the day is entered as 00:00 and stored as 24:00. */
const END_OF_DAY = "24:00";
const MIDNIGHT = "00:00";

const minutesOf = (time: string, isEnd = false) => {
  const [h, m] = time.split(":").map(Number);
  const minutes = h! * 60 + m!;
  return isEnd && minutes === 0 ? 24 * 60 : minutes;
};
const toInput = (time: string) => (time === END_OF_DAY ? MIDNIGHT : time);
const fromEndInput = (time: string) => (time === MIDNIGHT ? END_OF_DAY : time);
const isAllDay = (window: TimeWindowDto | null) => !!window && window.start === MIDNIGHT && window.end === END_OF_DAY;

function hoursForm(weekdays: string[], hours: WeeklyHoursDto): Record<string, DayForm> {
  return Object.fromEntries(
    weekdays.map((day) => {
      const window = hours[day];
      return [day, window ? { open: true, start: window.start, end: toInput(window.end) } : { open: false, start: "", end: "" }];
    }),
  );
}

function toForm(view: BookingScheduleEditorDto): ScheduleForm {
  const { own, fallback, schema } = view;
  return {
    slotMinutes: own.slotMinutes ? String(own.slotMinutes) : "",
    ownHours: !!own.weeklyHours,
    // Switching a section on starts from what the scope uses today, so nothing changes until edited.
    hours: hoursForm(schema.weekdays, own.weeklyHours ?? fallback.weeklyHours),
    ownBreaks: !!own.breaks,
    breaks: (own.breaks ?? fallback.breaks).map((b) => ({ start: b.start, end: toInput(b.end) })),
  };
}

/** The layer to save: inherited sections dropped. */
function toLayer(form: ScheduleForm): BookingScheduleLayerDto {
  return {
    ...(form.slotMinutes ? { slotMinutes: Number(form.slotMinutes) } : {}),
    ...(form.ownHours
      ? {
          weeklyHours: Object.fromEntries(
            Object.entries(form.hours).map(([day, d]) => [day, d.open ? { start: d.start, end: fromEndInput(d.end) } : null]),
          ),
        }
      : {}),
    ...(form.ownBreaks ? { breaks: form.breaks.map((b) => ({ start: b.start, end: fromEndInput(b.end) })) } : {}),
  };
}

function windowError(window: { start: string; end: string }): string | undefined {
  if (!window.start || !window.end) return "Enter both times.";
  if (minutesOf(window.end, true) <= minutesOf(window.start)) return "Must end after it starts (00:00 closes at midnight).";
  return undefined;
}

function validate(form: ScheduleForm) {
  const days: Record<string, string> = {};
  if (form.ownHours) {
    for (const [day, d] of Object.entries(form.hours)) {
      const error = d.open ? windowError(d) : undefined;
      if (error) days[day] = error;
    }
  }
  const breaks: Record<number, string> = {};
  if (form.ownBreaks) {
    form.breaks.forEach((b, i) => {
      const error = windowError(b);
      if (error) breaks[i] = error;
    });
    const sorted = form.breaks.map((b, i) => ({ ...b, i })).filter((b) => !breaks[b.i]).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let k = 1; k < sorted.length; k++) {
      if (minutesOf(sorted[k]!.start) < minutesOf(sorted[k - 1]!.end, true)) breaks[sorted[k]!.i] = "Overlaps another break.";
    }
  }
  return { days, breaks, has: Object.keys(days).length + Object.keys(breaks).length > 0 };
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Weekday names in the admin's locale — WEEKDAYS starts on Monday, as 2024-01-01 did. */
function weekdayLabel(index: number, locale: string | undefined): string {
  return new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" });
}

function windowLabel(window: TimeWindowDto | null): string {
  if (!window) return "Closed";
  return isAllDay(window) ? "Open 24 hours" : `${window.start}–${window.end === END_OF_DAY ? "midnight" : window.end}`;
}

/**
 * When test drives can be booked for one scope (company-wide or a dealership): slot length,
 * opening hours per weekday and daily breaks. Each section inherits until switched on — a
 * dealership from the company, the company from the connected org's default business hours.
 */
export function BookingScheduleCard({ scope }: { scope: ConfigScopeParams }) {
  const queryClient = useQueryClient();
  const regional = useAdminRegional();
  const queryKey = ["admin-booking-schedule", scope.dealershipId ?? null];
  const { data, isLoading, isError, error } = useQuery({ queryKey, queryFn: () => getBookingSchedule(scope) });
  const [form, setForm] = React.useState<ScheduleForm | null>(null);
  const [savedAt, setSavedAt] = React.useState<number>();

  React.useEffect(() => {
    setForm(data ? toForm(data) : null);
  }, [data]);

  const save = useMutation({
    mutationFn: (layer: BookingScheduleLayerDto) => saveBookingSchedule(scope, layer),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
      for (const key of ["vehicle-availability", "admin-booking-slots"]) queryClient.invalidateQueries({ queryKey: [key] });
      setSavedAt(Date.now());
    },
  });

  if (isLoading) return <div className="h-96 animate-pulse rounded-lg bg-muted" />;
  if (isError) return <p className="text-destructive">{errorMessage(error) ?? "Couldn't load the booking schedule."}</p>;
  if (!data || !form) return null;

  const { inherited, fallback, schema } = data;
  const source = inherited ? "company-wide" : "the connected org's default business hours";
  const errors = validate(form);
  const isDirty = JSON.stringify(toLayer(form)) !== JSON.stringify(toLayer(toForm(data)));
  const slotOptions: number[] = [];
  for (let m = schema.slotMinutes.min; m <= schema.slotMinutes.max; m += schema.slotMinutes.step) slotOptions.push(m);
  const shownHours = form.ownHours ? (toLayer(form).weeklyHours ?? fallback.weeklyHours) : fallback.weeklyHours;
  const allDayCount = schema.weekdays.filter((day) => isAllDay(shownHours[day] ?? null)).length;

  const update = (patch: Partial<ScheduleForm>) => {
    setSavedAt(undefined);
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };
  const updateDay = (day: string, patch: Partial<DayForm>) =>
    update({ hours: { ...form.hours, [day]: { ...form.hours[day]!, ...patch } } });
  /** A day being opened copies another open day's hours — the scope's own, else what it inherits — or starts blank. */
  const openDay = (day: string) => {
    const template =
      Object.values(form.hours).find((h) => h.open && h.start && h.end) ??
      Object.values(fallback.weeklyHours).map((w) => (w ? { start: w.start, end: toInput(w.end) } : null)).find(Boolean);
    updateDay(day, { open: true, start: template?.start ?? "", end: template?.end ?? "" });
  };
  const updateBreak = (index: number, patch: Partial<TimeWindowDto>) =>
    update({ breaks: form.breaks.map((b, i) => (i === index ? { ...b, ...patch } : b)) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Booking schedule</CardTitle>
        <CardDescription>
          The test-drive slots customers can pick, on the showroom's clock. Sections left off use {source}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!errors.has) save.mutate(toLayer(form));
          }}
        >
          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="schedule-slot-minutes">Slot length</Label>
            <select id="schedule-slot-minutes" className={SELECT_CLASS} value={form.slotMinutes} onChange={(e) => update({ slotMinutes: e.target.value })}>
              <option value="">
                {inherited ? "Inherit" : "Default"} ({durationLabel(fallback.slotMinutes)})
              </option>
              {slotOptions.map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Each booking takes one slot; slots run back to back from opening time.</p>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Opening hours</h3>
                <p className="text-xs text-muted-foreground">{form.ownHours ? "Set for this scope." : `Using ${source}.`}</p>
              </div>
              <Switch aria-label="Set opening hours for this scope" checked={form.ownHours} onCheckedChange={(ownHours) => update({ ownHours })} />
            </div>
            <div className="divide-y rounded-md border">
              {schema.weekdays.map((day, index) => {
                const d = form.hours[day]!;
                const dayName = weekdayLabel(index, regional.locale);
                return (
                  <div key={day} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                    <span className="w-28 text-sm">{dayName}</span>
                    {form.ownHours ? (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={d.open}
                            onChange={(e) => (e.target.checked ? openDay(day) : updateDay(day, { open: false }))}
                          />
                          Open
                        </label>
                        {d.open && (
                          <div className="flex items-center gap-2">
                            <Input aria-label={`${dayName} opens`} type="time" className="h-9 w-32" value={d.start} onChange={(e) => updateDay(day, { start: e.target.value })} />
                            <span className="text-muted-foreground">–</span>
                            <Input aria-label={`${dayName} closes`} type="time" className="h-9 w-32" value={d.end} onChange={(e) => updateDay(day, { end: e.target.value })} />
                          </div>
                        )}
                        {errors.days[day] && <span className="w-full text-xs text-destructive">{errors.days[day]}</span>}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{windowLabel(fallback.weeklyHours[day] ?? null)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {allDayCount > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {allDayCount === schema.weekdays.length ? "Open 24 hours every day" : `Open 24 hours on ${allDayCount} day${allDayCount > 1 ? "s" : ""}`} — customers
                will be offered slots through the night. Set opening hours to limit them.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Daily breaks</h3>
                <p className="text-xs text-muted-foreground">
                  {form.ownBreaks ? "No slot overlaps a break, e.g. lunch." : `Using ${inherited ? "company-wide breaks" : "no breaks"}.`}
                </p>
              </div>
              <Switch aria-label="Set breaks for this scope" checked={form.ownBreaks} onCheckedChange={(ownBreaks) => update({ ownBreaks })} />
            </div>
            {form.ownBreaks ? (
              <div className="space-y-2">
                {form.breaks.length === 0 && <p className="text-sm text-muted-foreground">No breaks — slots run straight through opening hours.</p>}
                {form.breaks.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input aria-label={`Break ${i + 1} starts`} type="time" className="h-9 w-32" value={b.start} onChange={(e) => updateBreak(i, { start: e.target.value })} />
                    <span className="text-muted-foreground">–</span>
                    <Input aria-label={`Break ${i + 1} ends`} type="time" className="h-9 w-32" value={b.end} onChange={(e) => updateBreak(i, { end: e.target.value })} />
                    <Button type="button" size="sm" variant="ghost" aria-label={`Remove break ${i + 1}`} onClick={() => update({ breaks: form.breaks.filter((_, k) => k !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {errors.breaks[i] && <span className="w-full text-xs text-destructive">{errors.breaks[i]}</span>}
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={form.breaks.length >= schema.maxBreaks}
                  onClick={() => update({ breaks: [...form.breaks, { start: "", end: "" }] })}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add break
                </Button>
              </div>
            ) : (
              fallback.breaks.length > 0 && (
                <p className="text-sm text-muted-foreground">{fallback.breaks.map((b) => windowLabel(b)).join(", ")}</p>
              )
            )}
          </section>

          {save.isError && <p className="text-sm text-destructive">{errorMessage(save.error)}</p>}
          {savedAt && !isDirty && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Saved. Customers see the new slots within a minute.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!isDirty || errors.has || save.isPending}>
              {save.isPending ? "Saving…" : "Save booking schedule"}
            </Button>
            <Button type="button" variant="outline" disabled={!isDirty || save.isPending} onClick={() => setForm(toForm(data))}>
              Discard
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={save.isPending || !Object.keys(toLayer(form)).length}
              onClick={() => update({ slotMinutes: "", ownHours: false, ownBreaks: false })}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear all
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
