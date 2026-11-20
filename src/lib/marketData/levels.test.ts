import { describe, expect, it } from "vitest";
import { Candle } from "./types";
import { LEVEL_RULES, analyseLevels, averageRange, findPivots, touchesAt } from "./levels";
import { chartTrend, structureRead } from "./trend";
import { trendFromAverages } from "@/lib/indicators";
import { barIndexAt, sanitizeAllAnnotations, sanitizeAnnotations } from "./annotations";

/** A bar centred on `mid`, one dollar tall, closing at `close` (default: mid) */
const bar = (i: number, mid: number, close = mid): Candle => ({
  time: i * 86_400, open: mid, high: mid + 0.5, low: mid - 0.5, close, volume: 1000,
});

/** Bars following straight lines between the given turning prices, `step` bars per leg */
function zigzag(turns: number[], step = 6): Candle[] {
  const mids: number[] = [];
  for (let t = 0; t < turns.length - 1; t++) {
    for (let s = 0; s < step; s++) mids.push(turns[t] + ((turns[t + 1] - turns[t]) * s) / step);
  }
  mids.push(turns[turns.length - 1]);
  return mids.map((m, i) => bar(i, m));
}

describe("findPivots", () => {
  it("finds swing highs and lows at the turns", () => {
    const c = zigzag([100, 110, 100, 110, 100]);
    const p = findPivots(c, 5);
    expect(p.map((x) => [x.kind, x.index, x.price])).toEqual([
      ["high", 6, 110.5],
      ["low", 12, 99.5],
      ["high", 18, 110.5],
    ]);
  });

  it("counts a flat top of equal highs once", () => {
    const mids = [1, 2, 3, 4, 5, 9, 9, 9, 5, 4, 3, 2, 1];
    const p = findPivots(mids.map((m, i) => bar(i, m)), 3).filter((x) => x.kind === "high");
    expect(p).toEqual([{ index: 5, price: 9.5, kind: "high" }]);
  });

  it("never uses later bars: a swing point is confirmed only k bars after it", () => {
    const c = zigzag([100, 110, 100, 110, 100, 108]);
    const full = findPivots(c, 5);
    for (let m = 1; m <= c.length; m++) {
      const early = findPivots(c.slice(0, m), 5);
      // Everything seen with fewer bars is still there with all of them, unchanged
      expect(full.slice(0, early.length)).toEqual(early);
      expect(early.every((p) => p.index <= m - 1 - 5)).toBe(true);
    }
  });
});

describe("analyseLevels", () => {
  it("groups repeated turns into support and resistance with touch counts", () => {
    // Turns at ~110 three times and ~100 three times, ending mid-range at 105
    const c = zigzag([105, 110, 100, 110.2, 100.3, 109.9, 99.8, 105]);
    const a = analyseLevels(c);
    expect(a.resistance).toHaveLength(1);
    expect(a.support).toHaveLength(1);
    expect(a.resistance[0].touches).toBe(3);
    expect(a.support[0].touches).toBe(3);
    expect(a.resistance[0].price).toBeCloseTo((110.5 + 110.7 + 110.4) / 3, 6);
    expect(a.support[0].price).toBeCloseTo((99.5 + 99.8 + 99.3) / 3, 6);
  });

  it("ignores a price that turned only once", () => {
    const c = zigzag([100, 110, 100, 120, 100, 110, 104]);
    const a = analyseLevels(c);
    expect(a.resistance.map((l) => l.price)).toEqual([110.5]); // 120.5 turned once
  });

  it("keeps at most the nearest few levels on each side", () => {
    // Five distinct floors, each tested twice, all below the final price
    const floors = [80, 85, 90, 95, 100];
    const turns = [130];
    for (const f of floors) turns.push(f, 120, f, 120);
    turns.push(110); // ends between the floors and the 120 ceiling
    const a = analyseLevels(zigzag(turns));
    expect(a.support.map((l) => Math.round(l.price))).toEqual([100, 95, 90]);
    expect(a.support).toHaveLength(LEVEL_RULES.perSide);
  });

  it("only looks at the most recent bars", () => {
    const old = zigzag([50, 60, 50, 60, 50]).map((k, i) => ({ ...k, time: i * 86_400 }));
    const recent = Array.from({ length: LEVEL_RULES.lookbackBars }, (_, i) => bar(old.length + i, 200 + (i % 2) * 0.01));
    const a = analyseLevels([...old, ...recent]);
    expect(a.from).toBe(old.length);
    expect(a.pivots.every((p) => p.index >= old.length)).toBe(true);
    expect(a.support).toEqual([]);
  });

  it("copes with too few bars", () => {
    expect(analyseLevels([])).toMatchObject({ pivots: [], support: [], resistance: [] });
    expect(analyseLevels([bar(0, 10), bar(1, 11)]).pivots).toEqual([]);
  });

  it("uses half the average bar range as the touch distance", () => {
    const c = zigzag([100, 110, 100]);
    expect(analyseLevels(c).tolerance).toBeCloseTo(averageRange(c)! / 2, 9);
  });

  it("counts touches at any price for levels the reader draws", () => {
    const c = zigzag([105, 110, 100, 110.2, 100.3, 105]);
    const a = analyseLevels(c);
    expect(touchesAt(a, 110.6).touches).toBe(2);
    expect(touchesAt(a, 105).touches).toBe(0);
    expect(touchesAt(a, 105).lastIndex).toBeNull();
  });
});

describe("trend", () => {
  it("trendFromAverages uses 50/200 when available, else 20/50", () => {
    expect(trendFromAverages(110, 105, 100, 90)).toMatchObject({ trend: "Uptrend", basis: "50/200", fast: 100, slow: 90 });
    expect(trendFromAverages(80, 85, 90, null)).toMatchObject({ trend: "Downtrend", basis: "20/50", fast: 85, slow: 90 });
    expect(trendFromAverages(95, 105, 100, 90).trend).toBe("Mixed");
    expect(trendFromAverages(95, 105, null, null)).toMatchObject({ trend: "Mixed", basis: null });
  });

  it("reads swing structure from the last two highs and lows", () => {
    const up = zigzag([100, 110, 104, 116, 108, 112]);
    expect(structureRead(findPivots(up, 5))?.trend).toBe("Uptrend");
    const down = zigzag([120, 110, 116, 104, 112, 108]);
    expect(structureRead(findPivots(down, 5))?.trend).toBe("Downtrend");
    const widening = zigzag([100, 110, 96, 116, 92, 100]);
    expect(structureRead(findPivots(widening, 5))?.trend).toBe("Mixed");
    expect(structureRead([])).toBeNull();
  });

  it("calls a trend only when both reads agree", () => {
    // Steady climb with shallow dips: averages stacked upward and higher highs/lows
    const turns = [100];
    for (let k = 0; k < 40; k++) turns.push(100 + k * 3 + 6, 100 + k * 3 + 2);
    const c = zigzag(turns);
    const t = chartTrend(c, analyseLevels(c).pivots);
    expect(t.averages?.trend).toBe("Uptrend");
    expect(t.structure?.trend).toBe("Uptrend");
    expect(t.trend).toBe("Uptrend");

    // Same climb, but the last swing low undercuts the one before: structure is Mixed
    const broken = zigzag([...turns, turns[turns.length - 2] + 2, turns[turns.length - 1] - 5, turns[turns.length - 1]]);
    const b = chartTrend(broken, analyseLevels(broken).pivots);
    expect(b.structure?.trend).toBe("Mixed");
    expect(b.trend).toBe("Mixed");
  });

  it("falls back to whichever read is available", () => {
    const c = zigzag([100, 110, 104, 116, 108, 112]); // 31 bars: no 50-bar average yet
    const t = chartTrend(c, analyseLevels(c).pivots);
    expect(t.averages).toBeNull();
    expect(t.trend).toBe(t.structure?.trend);
    expect(chartTrend([], []).trend).toBeNull();
  });
});

describe("annotations", () => {
  it("drops malformed drawings and orders trendline points", () => {
    const a = sanitizeAnnotations({
      levels: [{ id: "a", price: 101.5, label: "Breakout" }, { id: "b", price: -1, label: "" }, { id: "c", price: "x" }, null],
      trendlines: [
        { id: "t1", timeframe: "1d", a: { time: 200, price: 12 }, b: { time: 100, price: 10 } },
        { id: "t2", timeframe: "2d", a: { time: 1, price: 1 }, b: { time: 2, price: 2 } },
        { id: "t3", timeframe: "1h", a: { time: 5, price: 1 }, b: { time: 5, price: 2 } },
      ],
      notes: [{ id: "n1", timeframe: "5m", time: 300, text: "Earnings gap" }, { id: "n2", timeframe: "5m", time: 300, text: "   " }],
    });
    expect(a.levels).toEqual([{ id: "a", price: 101.5, label: "Breakout" }]);
    expect(a.trendlines).toEqual([{ id: "t1", timeframe: "1d", a: { time: 100, price: 10 }, b: { time: 200, price: 12 } }]);
    expect(a.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(sanitizeAnnotations("nonsense")).toEqual({ levels: [], trendlines: [], notes: [] });
  });

  it("keeps only valid tickers with something drawn", () => {
    const all = sanitizeAllAnnotations({
      AAPL: { levels: [{ id: "a", price: 1, label: "" }] },
      MSFT: { levels: [] },
      "not a ticker!": { levels: [{ id: "a", price: 1, label: "" }] },
    });
    expect(Object.keys(all)).toEqual(["AAPL"]);
  });

  it("finds the bar for a stored time, or nothing outside the loaded bars", () => {
    const times = [100, 200, 300, 400];
    expect(barIndexAt(times, 300, 0)).toBe(2);
    expect(barIndexAt(times, 290, 50)).toBe(2);
    expect(barIndexAt(times, 240, 50)).toBe(1);
    expect(barIndexAt(times, 20, 50)).toBeNull();
    expect(barIndexAt(times, 470, 50)).toBeNull();
    expect(barIndexAt([], 100, 50)).toBeNull();
  });
});
