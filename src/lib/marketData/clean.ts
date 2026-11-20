import { Candle } from "./types";
import { wallClockAsUtc } from "./time";

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Makes a provider's candles safe to chart. The chart library rejects data that isn't in
 * strictly ascending time order, and draws nonsense from a bar whose high is below its low.
 *
 * - Bars with a missing, non-numeric or non-positive price, or no valid time, are dropped.
 * - High and low are widened to contain open and close (providers occasionally report an
 *   open a cent outside the bar's range).
 * - A negative or non-numeric volume becomes unknown (null), not zero.
 * - Bars are sorted by time; when a time repeats, the later bar (newer data) is kept.
 */
export function cleanCandles(candles: Candle[]): Candle[] {
  const valid = candles
    .filter((c) => ok(c.time) && [c.open, c.high, c.low, c.close].every((p) => ok(p) && p > 0))
    .map((c) => ({
      time: c.time,
      open: c.open,
      high: Math.max(c.open, c.high, c.low, c.close),
      low: Math.min(c.open, c.high, c.low, c.close),
      close: c.close,
      volume: ok(c.volume) && c.volume >= 0 ? c.volume : null,
    }));

  // Array.sort is stable, so among bars with the same time the provider's order is kept
  valid.sort((a, b) => a.time - b.time);

  const out: Candle[] = [];
  for (const c of valid) {
    if (out.length && out[out.length - 1].time === c.time) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}

export interface ChartData {
  candles: Candle[];
  /** Position of each candle on the chart's time axis, strictly ascending */
  times: number[];
  /** Which clock the time axis reads */
  clock: "exchange" | "UTC";
}

/**
 * Places candles on the chart's time axis. Intraday bars are shown on the exchange's clock.
 * When clocks go back, a market that trades overnight repeats an hour of local time, which
 * the chart can't draw; such a series is shown in UTC instead so no bar is lost.
 *
 * Cleans again even though the API already has: the chart must not break on data from an
 * older cache entry or a provider that skipped cleaning.
 */
export function toChartData(raw: Candle[], intraday: boolean, timeZone: string): ChartData {
  const candles = cleanCandles(raw);
  if (!intraday) return { candles, times: candles.map((c) => c.time), clock: "exchange" };
  const times = candles.map((c) => wallClockAsUtc(c.time, timeZone));
  const ascending = times.every((t, i) => i === 0 || t > times[i - 1]);
  return ascending
    ? { candles, times, clock: "exchange" }
    : { candles, times: candles.map((c) => c.time), clock: "UTC" };
}
