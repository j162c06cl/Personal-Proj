// Trend of the chart's bars, read two independent ways so each can be explained:
//   • Moving averages: how price, the faster and the slower average are stacked
//     (the same rule the research page uses).
//   • Swing structure: whether the last two swing highs and lows are rising or falling.
// The overall trend is Uptrend or Downtrend only when both reads agree.

import { Trend, TrendBasis, sma, trendFromAverages } from "@/lib/indicators";
import type { Candle } from "./types";
import type { Pivot } from "./levels";

export interface AveragesRead {
  trend: Trend;
  basis: TrendBasis;
  price: number;
  fast: number;
  slow: number;
}

export interface StructureRead {
  trend: Trend;
  /** Previous and latest swing high */
  highs: [Pivot, Pivot];
  /** Previous and latest swing low */
  lows: [Pivot, Pivot];
}

export interface ChartTrend {
  /** null when there aren't enough bars for either read */
  trend: Trend | null;
  averages: AveragesRead | null;
  structure: StructureRead | null;
}

const lastOf = (s: (number | null)[]) => (s.length ? s[s.length - 1] : null);

export function averagesRead(candles: Candle[]): AveragesRead | null {
  if (!candles.length) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const r = trendFromAverages(price, lastOf(sma(closes, 20)), lastOf(sma(closes, 50)), lastOf(sma(closes, 200)));
  return r.basis && r.fast !== null && r.slow !== null ? { trend: r.trend, basis: r.basis, price, fast: r.fast, slow: r.slow } : null;
}

export function structureRead(pivots: Pivot[]): StructureRead | null {
  const highs = pivots.filter((p) => p.kind === "high").slice(-2);
  const lows = pivots.filter((p) => p.kind === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;
  const higherHigh = highs[1].price > highs[0].price;
  const higherLow = lows[1].price > lows[0].price;
  const lowerHigh = highs[1].price < highs[0].price;
  const lowerLow = lows[1].price < lows[0].price;
  const trend: Trend = higherHigh && higherLow ? "Uptrend" : lowerHigh && lowerLow ? "Downtrend" : "Mixed";
  return { trend, highs: [highs[0], highs[1]], lows: [lows[0], lows[1]] };
}

/** `pivots` are the confirmed swing points from analyseLevels, oldest first */
export function chartTrend(candles: Candle[], pivots: Pivot[]): ChartTrend {
  const averages = averagesRead(candles);
  const structure = structureRead(pivots);
  const trend =
    averages && structure ? (averages.trend === structure.trend ? averages.trend : "Mixed")
    : averages?.trend ?? structure?.trend ?? null;
  return { trend, averages, structure };
}
