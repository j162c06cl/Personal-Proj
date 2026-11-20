import { describe, expect, it } from "vitest";
import { Candle } from "./types";
import {
  DEFAULT_SETUP_CONFIG, SETUP_ORDER, SetupCheck, SetupType, buildContext, changedRules, checkBreakout, checkBullFlag,
  checkGoldenCross, checkPullback, checkSetup, checkSupportBounce, reversalBar, sanitizeSetupConfig, scanSetups,
} from "./setups";
import { barStillForming } from "./time";

const fmt = (p: number) => `$${p.toFixed(2)}`;

/** A bar with explicit prices; time is the bar number in days */
const k = (i: number, open: number, high: number, low: number, close: number, volume: number | null = 1000): Candle =>
  ({ time: i * 86_400, open, high, low, close, volume });

/** Bars swinging between 100 and 110 every 6 bars: turns at the same prices (support ~99.5, resistance ~110.5) */
function range(count: number, start = 0): Candle[] {
  const out: Candle[] = [];
  for (let n = 0; n < count; n++) {
    const phase = n % 12;
    const m = 100 + (phase <= 6 ? phase : 12 - phase) * (10 / 6);
    out.push(k(start + n, m, m + 0.5, m - 0.5, m));
  }
  return out;
}

const rules = (c: SetupCheck) => Object.fromEntries(c.conditions.map((x) => [x.label, x.met]));
const detail = (c: SetupCheck, label: string) => c.conditions.find((x) => x.label.startsWith(label))!.detail;
const failedCore = (c: SetupCheck) => c.conditions.filter((x) => x.core && !x.met).map((x) => `${x.label}: ${x.detail}`);
const withRules = (patch: Record<string, Record<string, unknown>>) =>
  sanitizeSetupConfig(Object.fromEntries(Object.entries(DEFAULT_SETUP_CONFIG).map(([g, v]) => [g, { ...v, ...(patch[g] ?? {}) }])));

describe("reversal bars", () => {
  it("recognises a hammer, a bullish engulfing bar and a close above the previous high", () => {
    const prev = k(0, 10, 10.2, 9.5, 9.6);
    expect(reversalBar([prev, k(1, 9.7, 9.8, 8.8, 9.75)], 1)?.kind).toBe("hammer");
    expect(reversalBar([prev, k(1, 9.5, 10.3, 9.45, 10.1)], 1)?.kind).toBe("engulfing");
    expect(reversalBar([k(0, 9.6, 10, 9.5, 9.9), k(1, 9.9, 10.4, 9.9, 10.3)], 1)?.kind).toBe("closeAbove");
    expect(reversalBar([prev, k(1, 9.6, 9.7, 9.4, 9.45)], 1)).toBeNull();
  });
});

describe("breakout", () => {
  const base = range(60);
  const last = base[base.length - 1];
  const breakBar = (volume: number, i = 60) => k(i, last.close, 113.5, last.close, 113, volume);

  it("detects a first close above resistance on heavy volume, with every rule explained", () => {
    const c = checkBreakout(buildContext([...base, breakBar(3000)], fmt), 60);
    expect(failedCore(c)).toEqual([]);
    expect(c.levels[0].price).toBeCloseTo(110.5, 1);
    expect(c.invalidation.price).toBeCloseTo(110.5, 1);
    expect([c.coreMet, c.coreTotal, c.confirmationsTotal]).toEqual([4, 4, 4]);
    expect(rules(c)["First break in 10 bars"]).toBe(true);
    expect(rules(c)["Strong close"]).toBe(true);
  });

  it("lists the earlier bars that formed the level, and the breakout bar", () => {
    const c = checkBreakout(buildContext([...base, breakBar(3000)], fmt), 60);
    const touches = c.evidence.filter((e) => e.role.includes("resistance level"));
    expect(touches.length).toBeGreaterThanOrEqual(2);
    expect(touches.every((e) => base[e.index].high === 110.5)).toBe(true);
    expect(c.evidence[c.evidence.length - 1]).toEqual({ index: 60, role: "Breakout bar" });
    expect(c.evidence.map((e) => e.index)).toEqual([...c.evidence.map((e) => e.index)].sort((a, b) => a - b));
  });

  it("needs heavier volume, and says how much", () => {
    const c = checkBreakout(buildContext([...base, breakBar(1100)], fmt), 60);
    expect(c.detected).toBe(false);
    expect(detail(c, "Heavier volume")).toMatch(/1\.1× its 20-bar average \(needs 1\.5×\)/);
  });

  it("uses the configured volume threshold", () => {
    const c = checkBreakout(buildContext([...base, breakBar(3000)], fmt, { config: withRules({ breakout: { volumeSurge: 3.5 } }) }), 60);
    expect(rules(c)["Heavier volume"]).toBe(false);
    expect(detail(c, "Heavier volume")).toMatch(/needs 3\.5×/);
  });

  it("flags a retry after a failed break and a weak close", () => {
    const candles = [...base, breakBar(3000), k(61, 113, 113.2, 107.5, 108), k(62, 108, 116, 108, 110.9, 3000)];
    const c = checkBreakout(buildContext(candles, fmt), 62);
    expect(failedCore(c)).toEqual([]);
    expect(rules(c)["First break in 10 bars"]).toBe(false);
    expect(detail(c, "First break")).toMatch(/2 bars earlier/);
    expect(rules(c)["Strong close"]).toBe(false);
    expect(detail(c, "Strong close")).toMatch(/36% of the way up/);
  });

  it("says when volume is missing instead of guessing", () => {
    const c = checkBreakout(buildContext([...base, breakBar(3000)].map((b, i) => (i === 50 ? { ...b, volume: null } : b)), fmt), 60);
    expect(detail(c, "Heavier volume")).toMatch(/No volume data/);
  });
});

describe("intraday volume", () => {
  // 8 New York sessions of hourly bars; the 9:30 bar always trades 8× the rest
  const day0 = Date.UTC(2026, 10, 9, 14, 30) / 1000; // Mon Nov 9, 9:30 New York
  const candles: Candle[] = [];
  for (let d = 0; d < 8; d++) for (let h = 0; h < 7; h++) {
    candles.push({ time: day0 + d * 86_400 + h * 3600, open: 100, high: 100.5, low: 99.5, close: 100, volume: h === 0 ? 8000 : 1000 });
  }
  const open = candles.length - 7;

  it("compares with the same time of day, so the busy open isn't 'heavy'", () => {
    const intraday = buildContext(candles, fmt, { intraday: true, timeZone: "America/New_York" });
    const daily = buildContext(candles, fmt);
    expect(intraday.volRatio[open]).toBeCloseTo(1, 5);
    expect(daily.volRatio[open]!).toBeGreaterThan(3);
    expect(detail(checkBreakout(intraday, open), "Heavier volume")).toMatch(/time of day/);
  });
});

describe("pullback", () => {
  const up = Array.from({ length: 260 }, (_, i) => { const c = 50 + i * 0.5; return k(i, c - 0.3, c + 0.6, c - 0.6, c); });
  const top = up[up.length - 1].close;
  const e20 = buildContext(up, fmt).ema20[up.length - 1]!;
  const pullTo = (low: number) => {
    const dip = [top - 1.5, top - 3, low + 0.3].map((c, j) => k(260 + j, c + 1, c + 1.2, j === 2 ? low : c - 0.3, c, 600));
    return [...up, ...dip, k(263, low + 0.3, low + 2.5, low + 0.2, low + 2.2, 1200)];
  };

  it("detects a dip to EMA 20 in an uptrend that turns up", () => {
    const candles = pullTo(e20 - 0.1);
    const c = checkPullback(buildContext(candles, fmt), candles.length - 1);
    expect(failedCore(c)).toEqual([]);
    expect(detail(c, "Reached")).toMatch(/EMA 20/);
    expect(c.invalidation.price).toBeCloseTo(e20 - 0.1, 5);
    expect(c.evidence.map((e) => e.role)).toEqual(["Recent high", "Pullback low", "Turning bar"]);
  });

  it("doesn't count a low far below the average as reaching it", () => {
    const candles = pullTo(e20 - 4);
    const c = checkPullback(buildContext(candles, fmt), candles.length - 1);
    expect(rules(c)["Reached EMA 20 or EMA 50"]).toBe(false);
    expect(detail(c, "Reached")).toMatch(/isn't within/);
  });

  it("always measures the dip from a high that came before it", () => {
    const candles: Candle[] = [];
    let p = 100;
    for (let i = 0; i < 330; i++) {
      const c = p + 0.12 + Math.sin(i / 4) * 0.5;
      candles.push(k(i, p, Math.max(p, c) + 0.4, Math.min(p, c) - 0.4, c));
      p = c;
    }
    const ctx = buildContext(candles, fmt);
    for (let i = 20; i < candles.length; i++) {
      const ev = checkPullback(ctx, i).evidence;
      const high = ev.find((e) => e.role.includes("Recent high"))!.index;
      const low = ev.find((e) => e.role.includes("Pullback low"))!.index;
      expect(low).toBeGreaterThan(high);
    }
  });
});

describe("bull flag", () => {
  const quiet = Array.from({ length: 30 }, (_, i) => k(i, 100, 100.5, 99.5, 100 + (i % 2 ? 0.1 : -0.1)));
  const pole = [101, 103, 105, 107, 109].map((c, j) => k(30 + j, c - 2, c + 0.4, c - 2.2, c, 2000));
  const flag = [108.6, 108.2, 107.8, 108.0].map((c, j) => k(35 + j, c + 0.2, c + 0.5, c - 0.5, c, 700));

  it("is 'forming' during the pause", () => {
    const candles = [...quiet, ...pole, ...flag];
    const c = checkBullFlag(buildContext(candles, fmt), candles.length - 1);
    expect(c.detected).toBe(true);
    expect(c.stage).toBe("forming");
    expect(rules(c)["Closes above the flag"]).toBe(false);
    expect(rules(c)["Quieter volume in the flag"]).toBe(true);
  });

  it("is 'confirmed' on a close above the flag, with every rule met", () => {
    const candles = [...quiet, ...pole, ...flag, k(39, 108.2, 111, 108, 110.5, 2500)];
    const c = checkBullFlag(buildContext(candles, fmt), candles.length - 1);
    expect(c.stage).toBe("confirmed");
    expect([c.coreMet, c.coreTotal, c.confirmationsMet, c.confirmationsTotal]).toEqual([3, 3, 3, 3]);
    const roles = c.evidence.map((e) => e.role);
    expect(roles[0]).toBe("Pole start");
    expect(roles).toContain("Flag top");
    expect(roles[roles.length - 1]).toBe("Breakout bar");
  });

  it("only counts breakout volume on a bar that breaks out", () => {
    const heavyDown = [...quiet, ...pole, ...flag.slice(0, 3), k(38, 108, 108.3, 107.4, 107.6, 5000)];
    const c = checkBullFlag(buildContext(heavyDown, fmt), heavyDown.length - 1);
    expect(rules(c)["Volume on the breakout"]).toBe(false);
    expect(detail(c, "Volume on the breakout")).toMatch(/Only counts on a bar that closes above/);
  });

  it("rejects a pullback that gives back most of the pole", () => {
    const deep = [107, 104, 102, 101.5].map((c, j) => k(35 + j, c + 0.2, c + 0.5, c - 0.5, c, 700));
    const c = checkBullFlag(buildContext([...quiet, ...pole, ...deep], fmt), 38);
    expect(rules(c)["Shallow pullback"]).toBe(false);
  });

  it("needs a strong pole", () => {
    expect(rules(checkBullFlag(buildContext(quiet, fmt), quiet.length - 1))["Strong rise first (the pole)"]).toBe(false);
  });
});

describe("support bounce", () => {
  it("detects a hammer at a tested support level after a fall into it", () => {
    const candles = [...range(55), k(55, 100.3, 100.4, 99.4, 100.35, 1500)];
    const c = checkSupportBounce(buildContext(candles, fmt), 55);
    expect(failedCore(c)).toEqual([]);
    expect(c.levels[0].price).toBeCloseTo(99.5, 1);
    expect(detail(c, "Bullish reversal")).toMatch(/hammer/);
    const roles = c.evidence.map((e) => e.role);
    expect(roles.filter((r) => r.includes("support level")).length).toBeGreaterThanOrEqual(2);
    expect(roles).toContain("Came down from here");
  });

  it("isn't a bounce when price rises up through a level from below", () => {
    const below = [98, 97, 96, 96.5, 97, 98].map((c, j) => k(60 + j, c + 0.3, c + 0.5, c - 0.5, c));
    const candles = [...range(60), ...below, k(66, 99.0, 99.9, 99.3, 99.8)];
    const c = checkSupportBounce(buildContext(candles, fmt), 66);
    expect(c.levels.every((l) => Math.abs(l.price - 99.5) > 0.2)).toBe(true);
    expect(c.detected).toBe(false);
  });

  it("needs price to come down to the level, not drift beside it", () => {
    const drift = Array.from({ length: 12 }, (_, j) => k(60 + j, 100, 100.6, 99.9, 100.1 + (j % 2) * 0.1));
    const candles = [...range(60), ...drift, k(72, 100.0, 100.1, 99.45, 100.05)];
    const c = checkSupportBounce(buildContext(candles, fmt), 72);
    expect(rules(c)["Came down to it"]).toBe(false);
    expect(c.detected).toBe(false);
  });

  it("can require a hammer or engulfing bar", () => {
    const candles = [...range(60), k(60, 100.0, 100.2, 99.4, 99.6), k(61, 99.7, 100.9, 99.6, 100.7)];
    const loose = checkSupportBounce(buildContext(candles, fmt), 61);
    expect(failedCore(loose)).toEqual([]);
    const strict = checkSupportBounce(buildContext(candles, fmt, { config: withRules({ supportBounce: { strictReversal: true } }) }), 61);
    expect(strict.detected).toBe(false);
    expect(detail(strict, "Bullish reversal")).toMatch(/only hammers and engulfing bars count/);
  });

  it("isn't a bounce when price closes below support", () => {
    const candles = [...range(55), k(55, 100, 100.1, 97, 97.5, 1500)];
    expect(checkSupportBounce(buildContext(candles, fmt), 55).detected).toBe(false);
  });
});

describe("golden cross", () => {
  const closes = Array.from({ length: 420 }, (_, i) => (i < 220 ? 200 - i * 0.4 : 112 + (i - 220) * 0.8));
  const candles = closes.map((c, i) => k(i, c, c + 0.5, c - 0.5, c));

  it("detects the cross on exactly one bar", () => {
    const ctx = buildContext(candles, fmt);
    const hits = candles.flatMap((_, i) => (i > 0 && checkGoldenCross(ctx, i).detected ? [i] : []));
    expect(hits).toHaveLength(1);
    expect(ctx.sma50[hits[0] - 1]!).toBeLessThanOrEqual(ctx.sma200[hits[0] - 1]!);
    expect(ctx.sma50[hits[0]]!).toBeGreaterThan(ctx.sma200[hits[0]]!);
  });

  it("reports a later death cross as the cross being reversed", () => {
    const fall = Array.from({ length: 200 }, (_, j) => { const c = closes[419] - (j + 1) * 1.2; return k(420 + j, c, c + 0.5, c - 0.5, c); });
    const s = scanSetups([...candles, ...fall], fmt).find((x) => x.type === "goldenCross")!;
    const d = s.detections[s.detections.length - 1];
    expect(d.status.kind).toBe("invalidated");
    if (d.status.kind === "invalidated") expect(d.status.text).toMatch(/death cross/);
  });

  it("needs 200 bars", () => {
    expect(detail(checkGoldenCross(buildContext(candles.slice(0, 150), fmt), 149), "SMA 50 crosses")).toMatch(/200\+ bars/);
  });
});

describe("rules configuration", () => {
  it("fills gaps from the defaults and keeps values in range", () => {
    expect(sanitizeSetupConfig(null)).toEqual(DEFAULT_SETUP_CONFIG);
    const c = sanitizeSetupConfig({ breakout: { volumeSurge: 99, freshBars: "x" }, bullFlag: { minFlagBars: 20, maxFlagBars: 5 }, supportBounce: { strictReversal: "yes" } });
    expect(c.breakout.volumeSurge).toBe(5);
    expect(c.breakout.freshBars).toBe(DEFAULT_SETUP_CONFIG.breakout.freshBars);
    expect(c.bullFlag.minFlagBars).toBeLessThanOrEqual(c.bullFlag.maxFlagBars);
    expect(c.supportBounce.strictReversal).toBe(false);
  });

  it("lists which rules differ from the defaults", () => {
    expect(changedRules(DEFAULT_SETUP_CONFIG)).toEqual([]);
    expect(changedRules(withRules({ pullback: { minDrop: 3 }, supportBounce: { strictReversal: true } }))).toEqual(["pullback.minDrop", "supportBounce.strictReversal"]);
  });
});

describe("after a detection", () => {
  it("reports when the invalidation level is later hit", () => {
    const candles = [...range(60), k(60, 101.67, 113.5, 101.67, 113, 3000), k(61, 113, 114, 112, 113.5), k(62, 113, 113.2, 109, 109.5)];
    const s = scanSetups(candles, fmt).find((x) => x.type === "breakout")!;
    expect(s.recent).not.toBeNull();
    expect(s.recent!.start).toBe(60);
    expect(s.recent!.status).toMatchObject({ kind: "invalidated", index: 62 });
  });

  it("stays valid while price holds", () => {
    const candles = [...range(60), k(60, 101.67, 113.5, 101.67, 113, 3000), k(61, 113, 114, 112, 113.5)];
    expect(scanSetups(candles, fmt).find((x) => x.type === "breakout")!.recent!.status.kind).toBe("valid");
  });
});

describe("the newest bar", () => {
  const nyOpen = Date.UTC(2026, 10, 20, 14, 30) / 1000; // Fri Nov 20, 9:30 New York
  it("is still forming during its own interval on intraday charts", () => {
    expect(barStillForming(nyOpen, 300, true, "America/New_York", nyOpen + 120)).toBe(true);
    expect(barStillForming(nyOpen, 300, true, "America/New_York", nyOpen + 400)).toBe(false);
  });
  it("is still forming until the close on daily charts", () => {
    const day = Date.UTC(2026, 10, 20) / 1000;
    expect(barStillForming(day, 86_400, false, "America/New_York", nyOpen + 3 * 3600)).toBe(true);
    expect(barStillForming(day, 86_400, false, "America/New_York", nyOpen + 7 * 3600)).toBe(false); // 16:30
    expect(barStillForming(day, 86_400, false, "America/New_York", nyOpen + 3 * 86_400)).toBe(false);
  });
});

describe("no look-ahead", () => {
  it("judges each bar the same whether or not later bars exist, with any rules", () => {
    const candles: Candle[] = [];
    let p = 100;
    for (let i = 0; i < 330; i++) {
      const drift = i < 120 ? 0.15 : i < 200 ? -0.1 : 0.2;
      const c = p + drift + (Math.sin(i / 4) * 1.2 + Math.sin(i / 17) * 2) * 0.3;
      candles.push(k(i, p, Math.max(p, c) + 0.4, Math.min(p, c) - 0.4, c, 1000 + ((i * 37) % 900)));
      p = c;
    }
    for (const config of [DEFAULT_SETUP_CONFIG, withRules({ general: { rangeBars: 7 }, bullFlag: { minPole: 2 }, supportBounce: { approachRanges: 0.5 } })]) {
      const full = buildContext(candles, fmt, { config });
      for (const i of [60, 150, 205, 260, 300, 329]) {
        const partial = buildContext(candles.slice(0, i + 1), fmt, { config });
        for (const type of SETUP_ORDER) expect(checkSetup(type as SetupType, partial, i)).toEqual(checkSetup(type as SetupType, full, i));
      }
    }
  });
});

describe("scanSetups", () => {
  it("summarises every setup, judging the latest bar even when nothing is detected", () => {
    const s = scanSetups(range(80), fmt);
    expect(s.map((x) => x.type)).toEqual(SETUP_ORDER);
    for (const x of s) expect(x.latest.index).toBe(79);
    expect(scanSetups([], fmt)).toEqual([]);
  });

  it("groups consecutive detections into one, judged on its last bar", () => {
    const quiet = Array.from({ length: 30 }, (_, i) => k(i, 100, 100.5, 99.5, 100 + (i % 2 ? 0.1 : -0.1)));
    const pole = [101, 103, 105, 107, 109].map((c, j) => k(30 + j, c - 2, c + 0.4, c - 2.2, c, 2000));
    const flag = [108.6, 108.2, 107.8, 108.0, 108.1].map((c, j) => k(35 + j, c + 0.2, c + 0.5, c - 0.5, c, 700));
    const s = scanSetups([...quiet, ...pole, ...flag], fmt).find((x) => x.type === "bullFlag")!;
    expect(s.detections).toHaveLength(1);
    expect(s.detections[0]).toMatchObject({ start: 36, end: 39 });
    expect(s.detections[0].check.index).toBe(39);
    expect(s.recent?.check.stage).toBe("forming");
  });
});
