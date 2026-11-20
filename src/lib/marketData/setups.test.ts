import { describe, expect, it } from "vitest";
import { Candle } from "./types";
import {
  SETUP_ORDER, SETUP_RULES, SetupType, buildContext, checkBreakout, checkBullFlag, checkGoldenCross,
  checkPullback, checkSetup, checkSupportBounce, reversalBar, scanSetups,
} from "./setups";

const fmt = (p: number) => `$${p.toFixed(2)}`;

/** A bar with explicit prices; time is the bar number in days */
const k = (i: number, open: number, high: number, low: number, close: number, volume: number | null = 1000): Candle =>
  ({ time: i * 86_400, open, high, low, close, volume });

/** Bars around `mid` swinging between mid-5 and mid+5 every 6 bars: turns at the same prices */
function range(count: number, mid = 105, start = 0): Candle[] {
  const out: Candle[] = [];
  for (let n = 0; n < count; n++) {
    const phase = n % 12;
    const m = mid - 5 + (phase <= 6 ? phase : 12 - phase) * (10 / 6);
    out.push(k(start + n, m, m + 0.5, m - 0.5, m));
  }
  return out;
}

const names = (cs: { label: string; met: boolean }[]) => Object.fromEntries(cs.map((c) => [c.label, c.met]));

describe("reversal bars", () => {
  it("recognises a hammer, a bullish engulfing bar and a close above the previous high", () => {
    const prev = k(0, 10, 10.2, 9.5, 9.6);
    expect(reversalBar([prev, k(1, 9.7, 9.8, 8.8, 9.75)], 1)).toMatch(/hammer/);
    expect(reversalBar([prev, k(1, 9.5, 10.3, 9.45, 10.1)], 1)).toMatch(/engulfing/);
    expect(reversalBar([k(0, 9.6, 10, 9.5, 9.9), k(1, 9.9, 10.4, 9.9, 10.3)], 1)).toMatch(/previous bar's high/);
    expect(reversalBar([prev, k(1, 9.6, 9.7, 9.4, 9.45)], 1)).toBeNull();
  });
});

describe("breakout", () => {
  const base = range(60); // resistance ~110.5, support ~99.5, ends mid-range
  const last = base[base.length - 1];
  const breakBar = (volume: number) => k(60, last.close, 113.5, last.close, 113, volume);

  it("detects a first close above resistance on heavy volume", () => {
    const candles = [...base, breakBar(3000)];
    const c = checkBreakout(buildContext(candles, fmt), 60);
    expect(c.detected).toBe(true);
    expect(c.levels[0].price).toBeCloseTo(110.5, 1);
    expect(c.invalidation.price).toBeCloseTo(110.5, 1);
    expect(c.met).toBeGreaterThanOrEqual(4);
    expect(c.total).toBe(6);
  });

  it("needs heavier volume", () => {
    const c = checkBreakout(buildContext([...base, breakBar(1100)], fmt), 60);
    expect(c.detected).toBe(false);
    expect(names(c.conditions)["Heavier volume"]).toBe(false);
    expect(c.conditions.find((x) => x.label === "Heavier volume")!.detail).toMatch(/1\.1× its 20-bar average/);
  });

  it("says when volume is missing instead of guessing", () => {
    const c = checkBreakout(buildContext([...base, breakBar(3000)].map((b, i) => (i === 50 ? { ...b, volume: null } : b)), fmt), 60);
    expect(c.conditions.find((x) => x.label === "Heavier volume")!.detail).toMatch(/No volume data/);
  });

  it("only counts the first close above", () => {
    const candles = [...base, breakBar(3000), k(61, 113, 114.5, 112.8, 114, 3000)];
    expect(checkBreakout(buildContext(candles, fmt), 61).detected).toBe(false);
  });
});

describe("bull flag", () => {
  // Quiet base, a sharp pole, a shallow 4-bar flag, then a close above the flag
  const quiet = Array.from({ length: 30 }, (_, i) => k(i, 100, 100.5, 99.5, 100 + (i % 2 ? 0.1 : -0.1)));
  const pole = [101, 103, 105, 107, 109].map((c, j) => k(30 + j, c - 2, c + 0.4, c - 2.2, c, 2000));
  const flag = [108.6, 108.2, 107.8, 108.0].map((c, j) => k(35 + j, c + 0.2, c + 0.5, c - 0.5, c, 700));

  it("sees a forming flag before the breakout", () => {
    const candles = [...quiet, ...pole, ...flag];
    const c = checkBullFlag(buildContext(candles, fmt), candles.length - 1);
    expect(c.detected).toBe(true);
    expect(names(c.conditions)["Closes above the flag"]).toBe(false);
    expect(c.range[0]).toBeLessThanOrEqual(30);
  });

  it("confirms on a close above the flag", () => {
    const candles = [...quiet, ...pole, ...flag, k(39, 108.2, 111, 108, 110.5, 2500)];
    const c = checkBullFlag(buildContext(candles, fmt), candles.length - 1);
    expect(c.detected).toBe(true);
    expect(names(c.conditions)["Closes above the flag"]).toBe(true);
    expect(c.met).toBe(c.total);
  });

  it("rejects a pullback that gives back most of the pole", () => {
    const deep = [107, 104, 102, 101.5].map((c, j) => k(35 + j, c + 0.2, c + 0.5, c - 0.5, c, 700));
    const c = checkBullFlag(buildContext([...quiet, ...pole, ...deep], fmt), 38);
    expect(c.detected).toBe(false);
    expect(names(c.conditions)["Shallow pullback"]).toBe(false);
  });

  it("needs a strong pole", () => {
    const c = checkBullFlag(buildContext(quiet, fmt), quiet.length - 1);
    expect(names(c.conditions)["Strong rise first (the pole)"]).toBe(false);
  });
});

describe("support bounce", () => {
  it("detects a hammer at a tested support level", () => {
    // range() ends at phase 11 heading down; continue down to the ~99.5 floor with a hammer
    const base = range(55); // last bar mid ≈ 101.67 falling
    const candles = [...base, k(55, 100.3, 100.4, 99.4, 100.35, 1500)];
    const c = checkSupportBounce(buildContext(candles, fmt), 55);
    expect(c.conditions.filter((x) => x.core && !x.met).map((x) => `${x.label}: ${x.detail}`)).toEqual([]);
    expect(c.levels[0].price).toBeCloseTo(99.5, 1);
    expect(c.conditions.find((x) => x.label === "Bullish reversal bar")!.detail).toMatch(/hammer/);
    expect(c.detected).toBe(true);
  });

  it("isn't a bounce when price closes below support", () => {
    const candles = [...range(55), k(55, 100, 100.1, 97, 97.5, 1500)];
    expect(checkSupportBounce(buildContext(candles, fmt), 55).detected).toBe(false);
  });
});

describe("golden cross", () => {
  // 260 bars falling then rising: SMA 50 crosses above SMA 200 once on the way up
  const closes = Array.from({ length: 420 }, (_, i) => (i < 220 ? 200 - i * 0.4 : 112 + (i - 220) * 0.8));
  const candles = closes.map((c, i) => k(i, c, c + 0.5, c - 0.5, c));

  it("detects the cross on exactly one bar", () => {
    const ctx = buildContext(candles, fmt);
    const hits = candles.map((_, i) => (i > 0 ? checkGoldenCross(ctx, i).detected : false)).flatMap((d, i) => (d ? [i] : []));
    expect(hits).toHaveLength(1);
    const i = hits[0];
    expect(ctx.sma50[i - 1]!).toBeLessThanOrEqual(ctx.sma200[i - 1]!);
    expect(ctx.sma50[i]!).toBeGreaterThan(ctx.sma200[i]!);
  });

  it("reports it as recent or historical", () => {
    const summary = scanSetups(candles, fmt).find((s) => s.type === "goldenCross")!;
    expect(summary.last).not.toBeNull();
    expect(summary.occurrences).toBe(1);
    expect(summary.recent).toBe(candles.length - 1 - summary.last!.index <= SETUP_RULES.recentBars.goldenCross);
  });

  it("needs 200 bars", () => {
    const c = checkGoldenCross(buildContext(candles.slice(0, 150), fmt), 149);
    expect(c.conditions[0].detail).toMatch(/200\+ bars/);
  });
});

describe("pullback", () => {
  it("detects a dip to EMA 20 in an uptrend that turns up", () => {
    const up = Array.from({ length: 260 }, (_, i) => { const c = 50 + i * 0.5; return k(i, c - 0.3, c + 0.6, c - 0.6, c); });
    const top = up[up.length - 1].close; // 179.5
    const ctx0 = buildContext(up, fmt);
    const e20 = ctx0.ema20[up.length - 1]!;
    const dip = [top - 1.5, top - 3, e20 + 0.2].map((c, j) => k(260 + j, c + 1, c + 1.2, c - 0.3, c, 600));
    const turn = k(263, e20 + 0.2, e20 + 2.2, e20, e20 + 2, 1200);
    const candles = [...up, ...dip, turn];
    const c = checkPullback(buildContext(candles, fmt), candles.length - 1);
    expect(names(c.conditions)).toMatchObject({
      "Established uptrend": true, "Pulled back from a recent high": true, "Reached EMA 20 or EMA 50": true,
      "Held above EMA 50": true, "Turning up": true, "Lighter volume on the dip": true,
    });
    expect(c.detected).toBe(true);
    expect(c.invalidation.price).toBeCloseTo(e20 - 0.1, 5);
  });
});

describe("no look-ahead", () => {
  it("judges each bar the same whether or not later bars exist", () => {
    // A long, varied series: trend up, chop, flag-like bursts and dips
    const candles: Candle[] = [];
    let p = 100;
    for (let i = 0; i < 330; i++) {
      const drift = i < 120 ? 0.15 : i < 200 ? -0.1 : 0.2;
      const wave = Math.sin(i / 4) * 1.2 + Math.sin(i / 17) * 2;
      const c = p + drift + wave * 0.3;
      candles.push(k(i, p, Math.max(p, c) + 0.4, Math.min(p, c) - 0.4, c, 1000 + ((i * 37) % 900)));
      p = c;
    }
    const full = buildContext(candles, fmt);
    for (const i of [60, 150, 205, 260, 300, 329]) {
      const partial = buildContext(candles.slice(0, i + 1), fmt);
      for (const type of SETUP_ORDER) {
        expect(checkSetup(type as SetupType, partial, i)).toEqual(checkSetup(type as SetupType, full, i));
      }
    }
  });
});

describe("scanSetups", () => {
  it("summarises every setup, judging the latest bar even when nothing is detected", () => {
    const s = scanSetups(range(80), fmt);
    expect(s.map((x) => x.type)).toEqual(SETUP_ORDER);
    for (const x of s) {
      expect(x.latest.index).toBe(79);
      expect(x.latest.met).toBeLessThanOrEqual(x.latest.total);
    }
    expect(scanSetups([], fmt)).toEqual([]);
  });

  it("counts a run of consecutive detections once", () => {
    const quiet = Array.from({ length: 30 }, (_, i) => k(i, 100, 100.5, 99.5, 100 + (i % 2 ? 0.1 : -0.1)));
    const pole = [101, 103, 105, 107, 109].map((c, j) => k(30 + j, c - 2, c + 0.4, c - 2.2, c, 2000));
    const flag = [108.6, 108.2, 107.8, 108.0, 108.1].map((c, j) => k(35 + j, c + 0.2, c + 0.5, c - 0.5, c, 700));
    const flagSummary = scanSetups([...quiet, ...pole, ...flag], fmt).find((x) => x.type === "bullFlag")!;
    expect(flagSummary.occurrences).toBe(1);
    expect(flagSummary.lastStart).toBe(36); // two bars after the top
    expect(flagSummary.recent).toBe(true);
  });
});
