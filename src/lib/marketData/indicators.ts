// Indicators for the interactive chart, computed in the browser from the chart's own
// candles. The moving averages, RSI and MACD reuse the functions in lib/indicators.ts.

import { ema, macd, rsi, sma } from "@/lib/indicators";
import { Candle } from "./types";
import { tradingDate, wallClockAsUtc } from "./time";

/** One value per candle, null where there isn't enough history yet */
export type Series = (number | null)[];

export type IndicatorId =
  | "sma20" | "sma50" | "sma200" | "ema9" | "ema21"
  | "vwap" | "avgVolume" | "relVolume" | "rsi" | "macd";

export interface IndicatorValues {
  sma20?: Series;
  sma50?: Series;
  sma200?: Series;
  ema9?: Series;
  ema21?: Series;
  vwap?: Series;
  avgVolume?: Series;
  relVolume?: Series;
  rsi?: Series;
  macd?: { line: Series; signal: Series; histogram: Series };
}

/**
 * Volume-weighted average price for the session so far: each bar's typical price
 * (high + low + close) ÷ 3, weighted by its volume. Restarts at each trading day's first
 * bar. Bars with unknown or zero volume don't move it.
 */
export function sessionVwap(candles: Candle[], timeZone: string): Series {
  const out: Series = [];
  let day = "";
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const d = tradingDate(c.time, timeZone);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    if (c.volume) {
      pv += ((c.high + c.low + c.close) / 3) * c.volume;
      vol += c.volume;
    }
    out.push(vol > 0 ? pv / vol : null);
  }
  return out;
}

/** Average volume of the last n bars, including this one. Null until n bars have a known volume. */
export function averageVolume(candles: Candle[], n = 20): Series {
  return candles.map((_, i) => {
    if (i < n - 1) return null;
    let sum = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const v = candles[k].volume;
      if (v === null) return null;
      sum += v;
    }
    return sum / n;
  });
}

export const REL_VOLUME = { dailyLookback: 20, intradayLookback: 10, intradayMinimum: 5 };

/**
 * This bar's volume ÷ the usual volume for it.
 *
 * - Daily bars: the average of the previous 20 sessions.
 * - Intraday bars: the average of the same time of day over the previous 10 sessions
 *   (at least 5 needed). Intraday volume follows a daily pattern, heavy at the open and
 *   close, so comparing a 9:30 bar with the quieter bars just before it would always
 *   make the open look unusual.
 *
 * Only earlier bars form the baseline, so a bar is never compared with itself.
 */
export function relativeVolume(candles: Candle[], intraday: boolean, timeZone: string): Series {
  if (!intraday) {
    const n = REL_VOLUME.dailyLookback;
    return candles.map((c, i) => {
      if (c.volume === null || i < n) return null;
      let sum = 0;
      for (let k = i - n; k < i; k++) {
        const v = candles[k].volume;
        if (v === null) return null;
        sum += v;
      }
      return sum > 0 ? c.volume / (sum / n) : null;
    });
  }

  const bySlot = new Map<number, number[]>();
  return candles.map((c) => {
    const slot = wallClockAsUtc(c.time, timeZone) % 86_400; // seconds since the exchange's midnight
    const history = bySlot.get(slot) ?? [];
    const recent = history.slice(-REL_VOLUME.intradayLookback);
    const avg = recent.length >= REL_VOLUME.intradayMinimum ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    if (c.volume !== null) bySlot.set(slot, [...recent, c.volume]);
    return c.volume !== null && avg ? c.volume / avg : null;
  });
}

/** Computes only the indicators that are switched on */
export function computeIndicators(
  candles: Candle[],
  on: ReadonlySet<IndicatorId>,
  intraday: boolean,
  timeZone: string
): IndicatorValues {
  const closes = candles.map((c) => c.close);
  const out: IndicatorValues = {};
  if (on.has("sma20")) out.sma20 = sma(closes, 20);
  if (on.has("sma50")) out.sma50 = sma(closes, 50);
  if (on.has("sma200")) out.sma200 = sma(closes, 200);
  if (on.has("ema9")) out.ema9 = ema(closes, 9);
  if (on.has("ema21")) out.ema21 = ema(closes, 21);
  // VWAP restarts every session, so on daily bars it would only repeat each day's typical price
  if (on.has("vwap") && intraday) out.vwap = sessionVwap(candles, timeZone);
  if (on.has("avgVolume")) out.avgVolume = averageVolume(candles, 20);
  if (on.has("relVolume")) out.relVolume = relativeVolume(candles, intraday, timeZone);
  if (on.has("rsi")) out.rsi = rsi(closes, 14);
  if (on.has("macd")) {
    const m = macd(closes, 12, 26, 9);
    out.macd = {
      line: m.line,
      signal: m.signal,
      histogram: m.line.map((v, i) => (v !== null && m.signal[i] !== null ? v - m.signal[i]! : null)),
    };
  }
  return out;
}
