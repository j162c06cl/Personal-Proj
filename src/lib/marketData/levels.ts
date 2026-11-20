// Support and resistance found from the chart's own bars, with rules simple enough to state
// on screen:
//   1. A swing high (or low) is a bar whose high (low) is the most extreme within
//      LEVEL_RULES.pivotBars bars on each side. It is only confirmed that many bars later,
//      so nothing here uses bars after the one being judged.
//   2. Swing points within half the average bar range of each other are one level, at their
//      average price. Each swing point in the group is a "touch": a time price turned there.
//   3. Levels with at least two touches count. The nearest few below the latest close are
//      support, the nearest few above are resistance.

import type { Candle } from "./types";

export const LEVEL_RULES = {
  /** A swing point must be the most extreme bar within this many bars on each side */
  pivotBars: 5,
  /** Only swing points in the most recent bars count */
  lookbackBars: 500,
  /** Swing points closer than this many average bar ranges form one level */
  toleranceRanges: 0.5,
  /** Turns needed before a price counts as a level */
  minTouches: 2,
  /** Levels shown on each side of the price */
  perSide: 3,
} as const;

export interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
}

export interface Level {
  price: number;
  /** Swing points that formed it: how many times price turned near here */
  touches: number;
  firstIndex: number;
  lastIndex: number;
}

export interface LevelAnalysis {
  /** Confirmed swing points in the lookback window, oldest first */
  pivots: Pivot[];
  /** Half the average bar range: how close a swing point must be to count as a touch */
  tolerance: number;
  /** First bar of the lookback window */
  from: number;
  /** Nearest first */
  support: Level[];
  /** Nearest first */
  resistance: Level[];
}

/**
 * Swing highs and lows from bar `from` on. A bar ties with an earlier equal bar rather than
 * repeating it, so a flat top of equal highs gives one swing high, not several.
 */
export function findPivots(candles: Candle[], k: number = LEVEL_RULES.pivotBars, from = 0): Pivot[] {
  const out: Pivot[] = [];
  for (let i = Math.max(from, k); i < candles.length - k; i++) {
    const { high, low } = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k && (isHigh || isLow); j++) {
      if (j === i) continue;
      const before = j < i;
      if (before ? candles[j].high >= high : candles[j].high > high) isHigh = false;
      if (before ? candles[j].low <= low : candles[j].low < low) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: high, kind: "high" });
    if (isLow) out.push({ index: i, price: low, kind: "low" });
  }
  return out;
}

/** Average true range of the bars from `from` on (the first bar has no previous close) */
export function averageRange(candles: Candle[], from = 0): number | null {
  let sum = 0;
  let count = 0;
  for (let i = from; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prev = i > 0 ? candles[i - 1].close : null;
    sum += prev === null ? high - low : Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
    count++;
  }
  return count ? sum / count : null;
}

const mean = (ps: Pivot[]) => ps.reduce((a, p) => a + p.price, 0) / ps.length;

export function analyseLevels(candles: Candle[]): LevelAnalysis {
  const n = candles.length;
  const from = Math.max(0, n - LEVEL_RULES.lookbackBars);
  const pivots = findPivots(candles, LEVEL_RULES.pivotBars, from);
  const tolerance = (averageRange(candles, from) ?? 0) * LEVEL_RULES.toleranceRanges;
  if (!n) return { pivots, tolerance, from, support: [], resistance: [] };

  // Walk up through the swing points by price; each joins the current group if it is close
  // enough to the group's average, otherwise it starts a new one
  const groups: Pivot[][] = [];
  for (const p of [...pivots].sort((a, b) => a.price - b.price)) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(p.price - mean(g)) <= tolerance) g.push(p);
    else groups.push([p]);
  }

  const levels: Level[] = groups
    .filter((g) => g.length >= LEVEL_RULES.minTouches)
    .map((g) => ({
      price: mean(g),
      touches: g.length,
      firstIndex: Math.min(...g.map((p) => p.index)),
      lastIndex: Math.max(...g.map((p) => p.index)),
    }));

  const close = candles[n - 1].close;
  return {
    pivots,
    tolerance,
    from,
    support: levels.filter((l) => l.price < close).sort((a, b) => b.price - a.price).slice(0, LEVEL_RULES.perSide),
    resistance: levels.filter((l) => l.price >= close).sort((a, b) => a.price - b.price).slice(0, LEVEL_RULES.perSide),
  };
}

/** Times price turned near `price` (for levels the reader draws), by the same rule */
export function touchesAt(analysis: LevelAnalysis, price: number): { touches: number; lastIndex: number | null } {
  const near = analysis.pivots.filter((p) => Math.abs(p.price - price) <= analysis.tolerance);
  return { touches: near.length, lastIndex: near.length ? Math.max(...near.map((p) => p.index)) : null };
}
