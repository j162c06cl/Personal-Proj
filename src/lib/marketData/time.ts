// Converting between Unix time and an exchange's local clock.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function localParts(unixSec: number, timeZone: string) {
  const p: Record<string, string> = {};
  for (const x of formatter(timeZone).formatToParts(new Date(unixSec * 1000))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** The exchange-local calendar date of a moment, as YYYY-MM-DD */
export function tradingDate(unixSec: number, timeZone: string): string {
  const { y, mo, d } = localParts(unixSec, timeZone);
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Midnight UTC of the exchange-local trading date, in Unix seconds */
export function tradingDateStart(unixSec: number, timeZone: string): number {
  const { y, mo, d } = localParts(unixSec, timeZone);
  return Date.UTC(y, mo - 1, d) / 1000;
}

/**
 * The exchange's wall-clock time, re-expressed as if it were UTC. The chart library
 * labels everything in UTC, so feeding it these values makes a 9:30 New York bar read
 * 9:30 for every viewer. Uses each bar's own offset, so daylight saving is handled.
 */
export function wallClockAsUtc(unixSec: number, timeZone: string): number {
  const { y, mo, d, h, mi, s } = localParts(unixSec, timeZone);
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
}

/** Regular-session close, in seconds after local midnight (half days aren't known) */
const SESSION_CLOSE: Record<string, number> = { "America/New_York": 16 * 3600, "Asia/Singapore": 17 * 3600 };

/**
 * Whether the newest bar is still trading, so its close and volume can still change.
 * Daily bars carry midnight UTC of their trading date; intraday bars their opening time.
 */
export function barStillForming(barTime: number, barSeconds: number, intraday: boolean, timeZone: string, nowSec: number): boolean {
  const close = SESSION_CLOSE[timeZone] ?? 16 * 3600;
  const today = tradingDate(nowSec, timeZone);
  const sessionOpen = wallClockAsUtc(nowSec, timeZone) % 86_400 < close;
  if (intraday) return nowSec < barTime + barSeconds && !(tradingDate(barTime, timeZone) === today && !sessionOpen);
  return new Date(barTime * 1000).toISOString().slice(0, 10) === today && sessionOpen;
}
