import { CalendarOff, Plus, Trash2 } from "lucide-react";
import type { ClosureDto } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A closure being edited; `allDay` hides the times. */
export interface ClosureForm {
  date: string;
  name: string;
  allDay: boolean;
  start: string;
  end: string;
}

const END_OF_DAY = "24:00";
const MIDNIGHT = "00:00";
const toMinutes = (time: string, isEnd = false) => {
  const [h, m] = time.split(":").map(Number);
  const minutes = h! * 60 + m!;
  return isEnd && minutes === 0 ? 24 * 60 : minutes;
};

export function closureFormOf(closure: ClosureDto): ClosureForm {
  const allDay = !closure.start;
  return {
    date: closure.date,
    name: closure.name ?? "",
    allDay,
    start: closure.start ?? "",
    end: closure.end === END_OF_DAY ? MIDNIGHT : (closure.end ?? ""),
  };
}

export function closureDtoOf(form: ClosureForm): ClosureDto {
  return {
    date: form.date,
    ...(form.name.trim() ? { name: form.name.trim() } : {}),
    ...(form.allDay ? {} : { start: form.start, end: form.end === MIDNIGHT ? END_OF_DAY : form.end }),
  };
}

/** Errors by row index. */
export function closureErrors(closures: ClosureForm[], maxName: number): Record<number, string> {
  const errors: Record<number, string> = {};
  const seenAllDay = new Set<string>();
  closures.forEach((c, i) => {
    if (!c.date) errors[i] = "Pick a date.";
    else if (c.name.trim().length > maxName) errors[i] = `Keep the name to ${maxName} characters.`;
    else if (!c.allDay && (!c.start || !c.end)) errors[i] = "Enter both times, or make it all day.";
    else if (!c.allDay && toMinutes(c.end, true) <= toMinutes(c.start)) errors[i] = "Must end after it starts (00:00 is midnight).";
    else if (c.allDay && seenAllDay.has(c.date)) errors[i] = "This date is already closed all day.";
    if (c.allDay && c.date) seenAllDay.add(c.date);
  });
  return errors;
}

function dateLabel(date: string, locale: string | undefined): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });
}

export function closureLabel(closure: ClosureDto, locale: string | undefined): string {
  const when = closure.start ? `${closure.start}–${closure.end === END_OF_DAY ? "midnight" : closure.end}` : "all day";
  return `${dateLabel(closure.date, locale)}, ${when}${closure.name ? ` — ${closure.name}` : ""}`;
}

interface ClosuresEditorProps {
  closures: ClosureForm[];
  onChange: (closures: ClosureForm[]) => void;
  errors: Record<number, string>;
  max: number;
  maxName: number;
  /** Closures this scope gets from elsewhere (the company, the connected org's holidays), shown read-only. */
  inheritedGroups: { label: string; items: ClosureDto[] }[];
  /** Today on the dealership's clock ("YYYY-MM-DD"): earlier closures are shown as past. */
  today: string;
  locale: string | undefined;
}

/** Holidays and one-off closures: days (or parts of days) no slot is offered, on top of the weekly hours. */
export function ClosuresEditor({ closures, onChange, errors, max, maxName, inheritedGroups, today, locale }: ClosuresEditorProps) {
  const update = (index: number, patch: Partial<ClosureForm>) => onChange(closures.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const upcoming = inheritedGroups.map((g) => ({ ...g, items: g.items.filter((c) => c.date >= today) })).filter((g) => g.items.length);
  const pastCount = closures.filter((c) => c.date && c.date < today).length;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Holidays and closures</h3>
        <p className="text-xs text-muted-foreground">No slots are offered on these dates or times. They add to any closures set elsewhere.</p>
      </div>

      {closures.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarOff className="h-4 w-4" /> No closures set for this scope.
        </p>
      )}
      <div className="space-y-2">
        {closures.map((c, i) => {
          const isPast = !!c.date && c.date < today;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Input aria-label={`Closure ${i + 1} date`} type="date" className="h-9 w-40" value={c.date} onChange={(e) => update(i, { date: e.target.value })} />
              <Input
                aria-label={`Closure ${i + 1} name`}
                placeholder="Name (optional)"
                className="h-9 min-w-0 flex-1 basis-40"
                maxLength={maxName}
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={c.allDay} onChange={(e) => update(i, { allDay: e.target.checked })} />
                All day
              </label>
              {!c.allDay && (
                <div className="flex items-center gap-2">
                  <Input aria-label={`Closure ${i + 1} starts`} type="time" className="h-9 w-32" value={c.start} onChange={(e) => update(i, { start: e.target.value })} />
                  <span className="text-muted-foreground">–</span>
                  <Input aria-label={`Closure ${i + 1} ends`} type="time" className="h-9 w-32" value={c.end} onChange={(e) => update(i, { end: e.target.value })} />
                </div>
              )}
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove closure ${i + 1}`} onClick={() => onChange(closures.filter((_, k) => k !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
              {errors[i] ? (
                <span className="w-full text-xs text-destructive">{errors[i]}</span>
              ) : (
                isPast && <span className="w-full text-xs text-muted-foreground">Already past — safe to remove.</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={closures.length >= max}
          onClick={() => onChange([...closures, { date: "", name: "", allDay: true, start: "", end: "" }])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add closure
        </Button>
        {pastCount > 1 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(closures.filter((c) => !c.date || c.date >= today))}>
            Remove {pastCount} past closures
          </Button>
        )}
        {closures.length >= max && <span className="text-xs text-muted-foreground">Up to {max} closures per scope.</span>}
      </div>

      {upcoming.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {group.items.map((c, i) => (
              <li key={i}>{closureLabel(c, locale)}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
