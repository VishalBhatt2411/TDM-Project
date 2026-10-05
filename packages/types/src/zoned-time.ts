/**
 * Wall-clock ↔ instant conversion in an IANA time zone, via Intl (no tz database dependency).
 * A dealership's slots and day boundaries are wall-clock times where the dealership is,
 * never where the server or the browser happens to run. Shared by the API and the web app.
 * Callers pass validated input; a malformed date or time throws a RangeError.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(instant: number, timeZone: string): WallClock {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Milliseconds the zone is ahead of UTC at `instant`. */
function offsetAt(instant: number, timeZone: string): number {
  const w = wallClockAt(instant, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
}

function parseIsoDate(date: string): [number, number, number] {
  const match = ISO_DATE.exec(date);
  const [year, month, day] = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [NaN, NaN, NaN];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (!match || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`"${date}" is not a date (YYYY-MM-DD).`);
  }
  return [year, month, day];
}

/**
 * The instant a wall-clock `date` + `time` ("HH:mm") happens in `timeZone`. A time skipped by a
 * DST jump resolves to the equivalent instant after the jump; a repeated one to its first occurrence.
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  return new Date(resolveWallTime(date, time, timeZone).instant);
}

/** Whether the wall-clock `date` + `time` actually occurs in `timeZone` — false for a time a DST jump skips. */
export function zonedDateTimeExists(date: string, time: string, timeZone: string): boolean {
  return !resolveWallTime(date, time, timeZone).skipped;
}

function resolveWallTime(date: string, time: string, timeZone: string): { instant: number; skipped: boolean } {
  const [year, month, day] = parseIsoDate(date);
  const timeMatch = WALL_TIME.exec(time);
  if (!timeMatch) throw new RangeError(`"${time}" is not a time (HH:mm).`);
  const wall = Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  // The zone's offset a day either side of the wall time brackets any DST change around it. An offset
  // that is still the zone's offset at the instant it implies is a real reading of the wall time: one
  // such reading is the normal case, two (a repeated hour) resolve to the earlier, none (a skipped hour)
  // to the equivalent time after the jump — the pre-jump offset applied to it.
  const offsetBefore = offsetAt(wall - DAY_MS, timeZone);
  const offsetAfter = offsetAt(wall + DAY_MS, timeZone);
  const readings = [offsetBefore, offsetAfter].map((offset) => wall - offset).filter((instant) => offsetAt(instant, timeZone) === wall - instant);
  return readings.length > 0
    ? { instant: Math.min(...readings), skipped: false }
    : { instant: wall - offsetBefore, skipped: true };
}

/** The calendar date ("YYYY-MM-DD") it is in `timeZone` at `instant`. */
export function zonedIsoDate(instant: Date, timeZone: string): string {
  const w = wallClockAt(instant.getTime(), timeZone);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** `date` shifted by whole calendar days. */
export function addIsoDays(date: string, days: number): string {
  const [year, month, day] = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The instants a calendar day spans in `timeZone`, inclusive — 23 or 25 hours on a DST change. */
export function zonedDayWindow(date: string, timeZone: string): { start: Date; end: Date } {
  const start = zonedDateTimeToUtc(date, "00:00", timeZone);
  const nextStart = zonedDateTimeToUtc(addIsoDays(date, 1), "00:00", timeZone);
  return { start, end: new Date(nextStart.getTime() - 1) };
}
