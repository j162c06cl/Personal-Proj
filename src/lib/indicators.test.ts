import { describe, expect, it } from "vitest";
import { computeTechnicals, ema, macd, rsi, sma } from "./indicators";
import { PricePoint } from "./types";

const bars = (closes: number[], volume = 1000): PricePoint[] =>
  closes.map((c, i) => ({ t: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, o: c, h: c, l: c, c, v: volume }));

describe("sma", () => {
  it("averages the last n values and is null until there are n", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("ema", () => {
  it("seeds with the simple average, then weights recent values", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2); // SMA of 1,2,3
    expect(out[3]).toBe(3); // 4 * 0.5 + 2 * 0.5
    expect(out[4]).toBe(4);
  });
});

describe("rsi", () => {
  it("is 100 when prices only rise", () => {
    const out = rsi(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(out.at(-1)).toBe(100);
  });

  it("is near 0 when prices only fall", () => {
    const out = rsi(Array.from({ length: 20 }, (_, i) => 100 - i));
    expect(out.at(-1)).toBeCloseTo(0, 5);
  });

  it("hovers around 50 for equal gains and losses", () => {
    // Wilder smoothing leans slightly toward the most recent move, so it oscillates just around 50
    const zigzag = Array.from({ length: 30 }, (_, i) => (i % 2 ? 101 : 100));
    const last = rsi(zigzag).at(-1)!;
    expect(last).toBeGreaterThan(45);
    expect(last).toBeLessThan(55);
  });

  it("stays within 0-100 and is null before 14 changes", () => {
    const out = rsi([5, 7, 6, 9, 8, 12, 11, 10, 14, 13, 15, 12, 16, 18, 17, 19]);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    for (const v of out.slice(14)) expect(v!).toBeGreaterThanOrEqual(0), expect(v!).toBeLessThanOrEqual(100);
  });
});

describe("macd", () => {
  it("is positive in a steady uptrend", () => {
    const { line, signal } = macd(Array.from({ length: 60 }, (_, i) => 100 + i));
    expect(line.at(-1)!).toBeGreaterThan(0);
    expect(signal.at(-1)).not.toBeNull();
  });
});

describe("computeTechnicals", () => {
  it("returns null without enough history", () => {
    expect(computeTechnicals(bars([1, 2, 3]))).toBeNull();
  });

  it("detects an uptrend from the moving averages", () => {
    const t = computeTechnicals(bars(Array.from({ length: 260 }, (_, i) => 50 + i)))!;
    expect(t.trend).toBe("Uptrend");
    expect(t.sma50!).toBeGreaterThan(t.sma200!);
    expect(t.pctFromHigh52).toBeCloseTo(0, 5);
  });

  it("detects a downtrend", () => {
    expect(computeTechnicals(bars(Array.from({ length: 260 }, (_, i) => 400 - i)))!.trend).toBe("Downtrend");
  });

  it("measures volume against the previous 50 sessions", () => {
    const pts = bars(Array.from({ length: 60 }, () => 100), 1000);
    pts[pts.length - 1].v = 2500;
    expect(computeTechnicals(pts)!.volumeRatio).toBeCloseTo(2.5, 5);
  });

  it("spots a bullish MACD crossover after a steady decline", () => {
    // In a perfectly steady trend MACD and its signal are equal up to rounding noise;
    // the turn must still register as a cross (regression test)
    const closes = [...Array.from({ length: 80 }, (_, i) => 200 - i), ...Array.from({ length: 6 }, (_, i) => 125 + i * 6)];
    expect(computeTechnicals(bars(closes))!.macdCross).toEqual({ dir: "bullish", barsAgo: 5 });
  });

  it("spots a bearish MACD crossover after a steady rise", () => {
    const closes = [...Array.from({ length: 80 }, (_, i) => 100 + i), ...Array.from({ length: 4 }, (_, i) => 175 - i * 6)];
    expect(computeTechnicals(bars(closes))!.macdCross?.dir).toBe("bearish");
  });
});
