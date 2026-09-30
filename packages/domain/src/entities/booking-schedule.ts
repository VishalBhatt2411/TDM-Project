import { InvalidValueError } from "../errors";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A wall-clock window on the dealership's clock, "HH:MM"; `end` may be "24:00" (midnight at the end of the day). */
export interface TimeWindow {
  start: string;
  end: string;
}

/** Opening hours per weekday; null is closed all day. */
export type WeeklyHours = Record<Weekday, TimeWindow | null>;

/** A dated closure (a holiday, a stocktake) on the dealership's calendar — all day unless `start`/`end` are set. */
export interface Closure {
  /** "YYYY-MM-DD" on the dealership's clock. */
  date: string;
  name?: string;
  start?: string;
  end?: string;
}

/**
 * When, and on what terms, one scope (a dealership, or company-wide) takes test-drive bookings.
 * Each unset field is inherited — a dealership from the company, the company from the data
 * provider's default business hours or the product defaults (see resolveBookingSchedule). An
 * empty list means "none", not "inherit". `closures` are the exception: they add up across
 * scopes and the data provider's own holidays, since a company holiday closes every dealership.
 */
export interface BookingSchedule {
  slotMinutes?: number;
  weeklyHours?: WeeklyHours;
  /** Daily closures inside the opening hours (e.g. lunch) — no slot overlaps one. */
  breaks?: TimeWindow[];
  /** How far ahead a customer must book: a slot starting sooner than this isn't offered. */
  minNoticeMinutes?: number;
  /** How long before the start a customer may still cancel or reschedule; staff aren't bound by it. */
  cancellationCutoffMinutes?: number;
  /** Days after a completed drive without a sale that the customer is sent a follow-up. */
  followUpDays?: number[];
  closures?: Closure[];
}

export interface ResolvedBookingSchedule {
  slotMinutes: number;
  weeklyHours: WeeklyHours;
  breaks: TimeWindow[];
  minNoticeMinutes: number;
  cancellationCutoffMinutes: number;
  followUpDays: number[];
  /** Every scope's closures and the data provider's holidays, by date. */
  closures: Closure[];
}

/** One bookable slot as the dealership's wall-clock start, and its length. */
export interface ScheduledSlotTime {
  time: string;
  minutes: number;
}

/**
 * The slot length when no scope sets one. It's scheduling granularity, not a business
 * value of any tenant — each company or dealership sets its own in the admin console.
 */
export const DEFAULT_SLOT_MINUTES = 30;
export const SLOT_MINUTES_RANGE = { min: 10, max: 240, step: 5 } as const;
export const MAX_BREAKS = 5;
/** Up to 30 days' notice, in quarter hours. With none set, only slots already started are closed. */
export const NOTICE_MINUTES_RANGE = { min: 0, max: 30 * 24 * 60, step: 15 } as const;
/** Up to 7 days, in quarter hours; 0 lets a customer change a booking until it starts. */
export const CANCELLATION_CUTOFF_RANGE = { min: 0, max: 7 * 24 * 60, step: 15 } as const;
export const FOLLOW_UP_DAYS_RANGE = { min: 1, max: 365, maxCount: 10 } as const;
export const MAX_CLOSURES = 100;
export const MAX_CLOSURE_NAME = 80;

/**
 * Product defaults for a tenant that hasn't set a policy yet — each company or dealership
 * overrides them in the admin console. They're behaviour defaults, not any tenant's business data.
 */
export const DEFAULT_CANCELLATION_CUTOFF_MINUTES = 2 * 60;
export const DEFAULT_FOLLOW_UP_DAYS: readonly number[] = [3, 7, 14];

/** Every field a schedule layer can set. */
export const BOOKING_SCHEDULE_FIELDS = [
  "slotMinutes",
  "weeklyHours",
  "breaks",
  "minNoticeMinutes",
  "cancellationCutoffMinutes",
  "followUpDays",
  "closures",
] as const satisfies readonly (keyof BookingSchedule)[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WALL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_DAY = 24 * 60;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(raw: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(raw).find((key) => !allowed.includes(key));
  if (unknown) throw new InvalidValueError(`${path} has an unknown field "${unknown}".`);
}

/** Minutes since midnight of "HH:MM" ("24:00" only where `allowMidnightEnd`), or throws. */
function minutesOf(value: unknown, path: string, allowMidnightEnd = false): number {
  if (allowMidnightEnd && value === "24:00") return MINUTES_PER_DAY;
  const match = typeof value === "string" ? WALL_TIME.exec(value) : null;
  if (!match) throw new InvalidValueError(`${path} must be a time as HH:MM, e.g. 09:30.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** A duration for people to read in messages: 1500 → "1 day 1 hour". */
export function durationText(minutes: number): string {
  const units: [number, string][] = [
    [MINUTES_PER_DAY, "day"],
    [60, "hour"],
    [1, "minute"],
  ];
  const parts: string[] = [];
  let rest = minutes;
  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (count) parts.push(`${count} ${name}${count > 1 ? "s" : ""}`);
    rest %= size;
  }
  return parts.join(" ") || "0 minutes";
}

export function formatWallTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseWindow(raw: unknown, path: string): TimeWindow {
  if (!isPlainObject(raw)) throw new InvalidValueError(`${path} must be an object with start and end.`);
  rejectUnknownKeys(raw, ["start", "end"], path);
  const start = minutesOf(raw.start, `${path}.start`);
  const end = minutesOf(raw.end, `${path}.end`, true);
  if (end <= start) throw new InvalidValueError(`${path} must end after it starts.`);
  return { start: formatWallTime(start), end: formatWallTime(end) };
}

const windowMinutes = (window: TimeWindow) => ({ start: minutesOf(window.start, "start"), end: minutesOf(window.end, "end", true) });

function parseSlotMinutes(raw: unknown): number {
  const { min, max, step } = SLOT_MINUTES_RANGE;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max || raw % step !== 0) {
    throw new InvalidValueError(`slotMinutes must be a whole number of minutes from ${min} to ${max}, in steps of ${step}.`);
  }
  return raw;
}

function parseStepMinutes(raw: unknown, field: string, { min, max, step }: { min: number; max: number; step: number }): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max || raw % step !== 0) {
    throw new InvalidValueError(`${field} must be a whole number of minutes from ${min} to ${max}, in steps of ${step}.`);
  }
  return raw;
}

function parseFollowUpDays(raw: unknown): number[] {
  const { min, max, maxCount } = FOLLOW_UP_DAYS_RANGE;
  if (!Array.isArray(raw)) throw new InvalidValueError("followUpDays must be a list.");
  if (raw.length > maxCount) throw new InvalidValueError(`At most ${maxCount} follow-ups are allowed.`);
  for (const day of raw) {
    if (typeof day !== "number" || !Number.isInteger(day) || day < min || day > max) {
      throw new InvalidValueError(`Each follow-up must be a whole number of days from ${min} to ${max}.`);
    }
  }
  const days = [...new Set(raw as number[])].sort((a, b) => a - b);
  if (days.length !== raw.length) throw new InvalidValueError("Follow-up days must not repeat.");
  return days;
}

/** "YYYY-MM-DD" that is a real calendar date. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function parseClosure(raw: unknown, path: string): Closure {
  if (!isPlainObject(raw)) throw new InvalidValueError(`${path} must be an object with a date.`);
  rejectUnknownKeys(raw, ["date", "name", "start", "end"], path);
  if (!isIsoDate(raw.date)) throw new InvalidValueError(`${path}.date must be a date as YYYY-MM-DD.`);
  const closure: Closure = { date: raw.date };
  if (raw.name !== undefined && raw.name !== null && raw.name !== "") {
    if (typeof raw.name !== "string" || raw.name.trim().length > MAX_CLOSURE_NAME) {
      throw new InvalidValueError(`${path}.name must be text of at most ${MAX_CLOSURE_NAME} characters.`);
    }
    if (raw.name.trim()) closure.name = raw.name.trim();
  }
  const hasStart = raw.start !== undefined && raw.start !== null;
  const hasEnd = raw.end !== undefined && raw.end !== null;
  if (hasStart !== hasEnd) throw new InvalidValueError(`${path} needs both start and end, or neither for all day.`);
  if (hasStart) Object.assign(closure, parseWindow({ start: raw.start, end: raw.end }, path));
  return closure;
}

function parseClosures(raw: unknown): Closure[] {
  if (!Array.isArray(raw)) throw new InvalidValueError("closures must be a list.");
  if (raw.length > MAX_CLOSURES) throw new InvalidValueError(`At most ${MAX_CLOSURES} closures are allowed.`);
  return raw.map((item, i) => parseClosure(item, `closures[${i}]`)).sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
}

function parseWeeklyHours(raw: unknown): WeeklyHours {
  if (!isPlainObject(raw)) throw new InvalidValueError("weeklyHours must be an object keyed by weekday.");
  rejectUnknownKeys(raw, WEEKDAYS, "weeklyHours");
  const hours = {} as WeeklyHours;
  for (const day of WEEKDAYS) {
    if (!(day in raw)) throw new InvalidValueError(`weeklyHours.${day} is missing — use null for a closed day.`);
    const value = raw[day];
    hours[day] = value === null ? null : parseWindow(value, `weeklyHours.${day}`);
  }
  return hours;
}

function parseBreaks(raw: unknown): TimeWindow[] {
  if (!Array.isArray(raw)) throw new InvalidValueError("breaks must be a list.");
  if (raw.length > MAX_BREAKS) throw new InvalidValueError(`At most ${MAX_BREAKS} breaks are allowed.`);
  const breaks = raw.map((item, i) => parseWindow(item, `breaks[${i}]`));
  const sorted = [...breaks].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start < sorted[i - 1]!.end) throw new InvalidValueError("Breaks must not overlap.");
  }
  return sorted;
}

/**
 * Validates an untrusted schedule (an admin's request, or JSON stored in the data provider)
 * into canonical form: unknown fields are rejected, absent ones left to inherit.
 */
export function parseBookingSchedule(raw: unknown): BookingSchedule {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) throw new InvalidValueError("Booking schedule must be an object.");
  rejectUnknownKeys(raw, BOOKING_SCHEDULE_FIELDS, "Booking schedule");
  const schedule: BookingSchedule = {};
  if (raw.slotMinutes !== undefined && raw.slotMinutes !== null) schedule.slotMinutes = parseSlotMinutes(raw.slotMinutes);
  if (raw.weeklyHours !== undefined && raw.weeklyHours !== null) schedule.weeklyHours = parseWeeklyHours(raw.weeklyHours);
  if (raw.breaks !== undefined && raw.breaks !== null) schedule.breaks = parseBreaks(raw.breaks);
  if (raw.minNoticeMinutes !== undefined && raw.minNoticeMinutes !== null) {
    schedule.minNoticeMinutes = parseStepMinutes(raw.minNoticeMinutes, "minNoticeMinutes", NOTICE_MINUTES_RANGE);
  }
  if (raw.cancellationCutoffMinutes !== undefined && raw.cancellationCutoffMinutes !== null) {
    schedule.cancellationCutoffMinutes = parseStepMinutes(raw.cancellationCutoffMinutes, "cancellationCutoffMinutes", CANCELLATION_CUTOFF_RANGE);
  }
  if (raw.followUpDays !== undefined && raw.followUpDays !== null) schedule.followUpDays = parseFollowUpDays(raw.followUpDays);
  if (raw.closures !== undefined && raw.closures !== null) schedule.closures = parseClosures(raw.closures);
  return schedule;
}

/**
 * Narrowest scope first: each field comes from the first layer that sets it, else the
 * provider's business hours or the product default. Closures add up across every layer and
 * the provider's holidays.
 */
export function resolveBookingSchedule(
  layers: readonly BookingSchedule[],
  providerHours: WeeklyHours,
  providerClosures: readonly Closure[] = [],
): ResolvedBookingSchedule {
  const pick = <K extends keyof BookingSchedule>(key: K) => layers.find((layer) => layer[key] !== undefined)?.[key];
  return {
    slotMinutes: pick("slotMinutes") ?? DEFAULT_SLOT_MINUTES,
    weeklyHours: pick("weeklyHours") ?? providerHours,
    breaks: pick("breaks") ?? [],
    minNoticeMinutes: pick("minNoticeMinutes") ?? NOTICE_MINUTES_RANGE.min,
    cancellationCutoffMinutes: pick("cancellationCutoffMinutes") ?? DEFAULT_CANCELLATION_CUTOFF_MINUTES,
    followUpDays: pick("followUpDays") ?? [...DEFAULT_FOLLOW_UP_DAYS],
    closures: [...layers.flatMap((layer) => layer.closures ?? []), ...providerClosures].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Weekday of a calendar date "YYYY-MM-DD" — the date is already on the dealership's clock. */
export function weekdayOf(isoDate: string): Weekday {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new InvalidValueError(`"${isoDate}" is not a date.`);
  // getUTCDay is 0 for Sunday; WEEKDAYS starts on Monday.
  return WEEKDAYS[(date.getUTCDay() + 6) % 7]!;
}

/**
 * The bookable slots of one day: back to back from opening, each ending by closing time;
 * a slot that would overlap a break (or a part-day closure) starts again when it ends. An
 * all-day closure leaves no slots.
 */
export function slotTimesFor(schedule: ResolvedBookingSchedule, isoDate: string): ScheduledSlotTime[] {
  const hours = schedule.weeklyHours[weekdayOf(isoDate)];
  if (!hours) return [];
  const closures = schedule.closures.filter((closure) => closure.date === isoDate);
  if (closures.some((closure) => !closure.start || !closure.end)) return [];
  const open = windowMinutes(hours);
  // A part-day closure is that day's extra break.
  const breaks = [...schedule.breaks, ...(closures as TimeWindow[])].map(windowMinutes);
  const slots: ScheduledSlotTime[] = [];
  let start = open.start;
  while (start + schedule.slotMinutes <= open.end) {
    const end = start + schedule.slotMinutes;
    const clash = breaks.find((b) => start < b.end && b.start < end);
    if (clash) {
      start = clash.end;
      continue;
    }
    slots.push({ time: formatWallTime(start), minutes: schedule.slotMinutes });
    start = end;
  }
  return slots;
}
