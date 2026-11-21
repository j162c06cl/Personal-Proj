// Picking the closing price for a past date (e.g. a purchase date), used by /api/historical.

/** One daily close, keyed by the exchange-local trading date (YYYY-MM-DD) */
export interface DailyClose {
  date: string;
  close: number;
}

/** How many days after the requested date to look for the next trading day (weekends, holidays) */
export const MAX_GAP_DAYS = 7;

/** A real calendar date written as YYYY-MM-DD */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The first close on or after `date`, no more than `maxGap` days later. Null when nothing
 * traded in that window (before the listing began, or a long suspension).
 */
export function closeOnOrAfter(closes: DailyClose[], date: string, maxGap = MAX_GAP_DAYS): DailyClose | null {
  const last = addDays(date, maxGap);
  let best: DailyClose | null = null;
  for (const c of closes) {
    if (c.date < date || c.date > last || !Number.isFinite(c.close) || c.close <= 0) continue;
    if (!best || c.date < best.date) best = c;
  }
  return best;
}
