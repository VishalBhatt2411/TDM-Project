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

/**
 * When one scope (a dealership, or company-wide) takes test-drive bookings. Each unset field is
 * inherited — a dealership from the company, the company from the data provider's default
 * business hours (see resolveBookingSchedule). An empty `breaks` list means "no breaks", not "inherit".
 */
export interface BookingSchedule {
  slotMinutes?: number;
  weeklyHours?: WeeklyHours;
  /** Daily closures inside the opening hours (e.g. lunch) — no slot overlaps one. */
  breaks?: TimeWindow[];
}

export interface ResolvedBookingSchedule {
  slotMinutes: number;
  weeklyHours: WeeklyHours;
  breaks: TimeWindow[];
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

const SCHEDULE_KEYS = ["slotMinutes", "weeklyHours", "breaks"] as const;
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
  rejectUnknownKeys(raw, SCHEDULE_KEYS, "Booking schedule");
  const schedule: BookingSchedule = {};
  if (raw.slotMinutes !== undefined && raw.slotMinutes !== null) schedule.slotMinutes = parseSlotMinutes(raw.slotMinutes);
  if (raw.weeklyHours !== undefined && raw.weeklyHours !== null) schedule.weeklyHours = parseWeeklyHours(raw.weeklyHours);
  if (raw.breaks !== undefined && raw.breaks !== null) schedule.breaks = parseBreaks(raw.breaks);
  return schedule;
}

/** Narrowest scope first: each field comes from the first layer that sets it, else the provider's business hours. */
export function resolveBookingSchedule(layers: readonly BookingSchedule[], providerHours: WeeklyHours): ResolvedBookingSchedule {
  const pick = <K extends keyof BookingSchedule>(key: K) => layers.find((layer) => layer[key] !== undefined)?.[key];
  return {
    slotMinutes: pick("slotMinutes") ?? DEFAULT_SLOT_MINUTES,
    weeklyHours: pick("weeklyHours") ?? providerHours,
    breaks: pick("breaks") ?? [],
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
 * a slot that would overlap a break starts again when the break ends.
 */
export function slotTimesFor(schedule: ResolvedBookingSchedule, isoDate: string): ScheduledSlotTime[] {
  const hours = schedule.weeklyHours[weekdayOf(isoDate)];
  if (!hours) return [];
  const open = windowMinutes(hours);
  const breaks = schedule.breaks.map(windowMinutes);
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
