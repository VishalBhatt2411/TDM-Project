import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DurationUnit = "minutes" | "hours" | "days";
export const DURATION_UNITS: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 24 * 60 };

/** A duration being edited: "" inherits; otherwise a count of `unit`. */
export interface DurationValue {
  value: string;
  unit: DurationUnit;
}

export interface StepRange {
  min: number;
  max: number;
  step: number;
}

export const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** "1 d 2 h 30 min"; "" for zero. */
export function durationLabel(minutes: number): string {
  const d = Math.floor(minutes / DURATION_UNITS.days);
  const h = Math.floor((minutes % DURATION_UNITS.days) / 60);
  const m = minutes % 60;
  return [d ? `${d} d` : "", h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** The largest unit a duration is a whole number of — 1440 minutes reads as 1 day. */
function unitOf(minutes: number): DurationUnit {
  if (minutes > 0 && minutes % DURATION_UNITS.days === 0) return "days";
  if (minutes > 0 && minutes % DURATION_UNITS.hours === 0) return "hours";
  return "minutes";
}

/** The form value for a scope's own duration (undefined inherits), in the unit that reads best. */
export function durationValueOf(own: number | undefined, fallback: number): DurationValue {
  const unit = unitOf(own ?? fallback);
  return { value: own === undefined ? "" : String(own / DURATION_UNITS[unit]), unit };
}

export const durationMinutes = (duration: DurationValue) => Number(duration.value) * DURATION_UNITS[duration.unit];

export function durationError(duration: DurationValue, range: StepRange): string | undefined {
  if (!duration.value.trim()) return undefined;
  const minutes = durationMinutes(duration);
  if (!Number.isFinite(minutes) || minutes < range.min || minutes > range.max) {
    return `Enter from ${durationLabel(range.min) || "0"} to ${durationLabel(range.max)}.`;
  }
  if (!Number.isInteger(minutes) || minutes % range.step !== 0) return `Must be in steps of ${durationLabel(range.step)}.`;
  return undefined;
}

interface DurationFieldProps {
  id: string;
  label: string;
  value: DurationValue;
  onChange: (value: DurationValue) => void;
  /** What a blank field resolves to. */
  fallbackMinutes: number;
  error?: string;
  /** Explains the field; shown when there's no error. */
  hint: React.ReactNode;
}

/** A duration input — a number and its unit; blank inherits `fallbackMinutes`. */
export function DurationField({ id, label, value, onChange, fallbackMinutes, error, hint }: DurationFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          className="w-28"
          placeholder={durationLabel(fallbackMinutes) || "None"}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
        <select
          aria-label={`${label} unit`}
          className={SELECT_CLASS}
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as DurationUnit })}
        >
          {(Object.keys(DURATION_UNITS) as DurationUnit[]).map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      <p id={`${id}-hint`} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {error ?? hint}
      </p>
    </div>
  );
}
