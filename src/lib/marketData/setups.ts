// Rule-based swing-trading setups. Every setup is a fixed checklist: "core" rules must all pass
// for the setup to count as detected; "confirmation" rules add evidence. The score is simply how
// many rules passed, so every number on screen can be traced to a rule.
//
// No look-ahead: judging bar i uses bars 0..i only. Support and resistance come from bars
// before i, and their swing points are themselves only confirmed LEVEL_RULES.pivotBars later.
//
// Distances use the average bar range (mean true range of the previous 14 bars), so the same
// rules make sense on daily and intraday bars.

import { ema, rsi, sma } from "@/lib/indicators";
import type { Candle } from "./types";
import { Level, LevelAnalysis, analyseLevels } from "./levels";

export type SetupType = "breakout" | "pullback" | "bullFlag" | "supportBounce" | "goldenCross";

export const SETUP_RULES = {
  /** Bars (counting back from the latest) searched for past setups */
  scanBars: 250,
  /** A detection this many bars back or fewer counts as recent */
  recentBars: { breakout: 10, pullback: 10, bullFlag: 10, supportBounce: 10, goldenCross: 20 } as Record<SetupType, number>,
  rangeBars: 14,
  volumeBars: 20,
  /** Volume at least this many times its average counts as a surge */
  volumeSurge: 1.5,
  pullback: { highBars: 15, minDrop: 2, touchBars: 3, slopeBars: 10, minRsi: 40, quietBars: 5 },
  flag: { maxPoleBars: 10, minPole: 4, minFlagBars: 2, maxFlagBars: 12, maxRetrace: 0.5 },
  bounce: { testBars: 3, strongTouches: 3 },
  goldenCross: { slopeBars: 20 },
} as const;

export const SETUP_INFO: Record<SetupType, { name: string; short: string; summary: string }> = {
  breakout: {
    name: "Breakout", short: "Breakout",
    summary: "Price closes above a level where it has turned down before, on heavier than usual volume.",
  },
  pullback: {
    name: "Pullback", short: "Pullback",
    summary: "In an uptrend, price dips back to its 20- or 50-bar exponential average and starts to turn up.",
  },
  bullFlag: {
    name: "Bull flag", short: "Bull flag",
    summary: "A sharp rise (the pole) followed by a short, shallow pause (the flag). It completes when price closes above the flag.",
  },
  supportBounce: {
    name: "Support bounce", short: "Bounce",
    summary: "Price falls to a level where it has turned up before and prints a bullish reversal bar there.",
  },
  goldenCross: {
    name: "Golden cross", short: "Golden cross",
    summary: "The 50-bar average crosses above the 200-bar average, a sign the longer trend has turned up.",
  },
};

export const SETUP_ORDER: SetupType[] = ["breakout", "pullback", "bullFlag", "supportBounce", "goldenCross"];

export interface Condition {
  label: string;
  /** Core rules must all pass for detection; the rest are confirmations */
  core: boolean;
  met: boolean;
  /** The numbers behind the result */
  detail: string;
}

export interface SetupCheck {
  type: SetupType;
  /** Bar the rules were judged on */
  index: number;
  detected: boolean;
  conditions: Condition[];
  met: number;
  total: number;
  /** Bars that make up the pattern, inclusive */
  range: [number, number];
  /** Prices the setup is built around (the level broken, the flag's high…) */
  levels: { price: number; label: string }[];
  /** Price whose loss would invalidate the setup, by its own rules (null: not a price) */
  invalidation: { price: number | null; text: string };
}

export interface SetupSummary {
  type: SetupType;
  /** The rules judged on the latest bar */
  latest: SetupCheck;
  /** Most recent detection in the scanned bars (the last bar of its run of detections) */
  last: SetupCheck | null;
  /** First bar of that run, i.e. when it was first detected */
  lastStart: number | null;
  /** Whether `last` is within the recent window */
  recent: boolean;
  /** Separate runs of detections in the scanned bars */
  occurrences: number;
  /** Bars scanned for this setup */
  scanned: number;
}

type Fmt = (price: number) => string;

/** Values every rule may need, each computed only from bars up to its own index */
export interface SetupContext {
  candles: Candle[];
  closes: number[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  rsi14: (number | null)[];
  /** Mean true range of the 14 bars before i (null for the first bars) */
  range: (number | null)[];
  /** Mean volume of the 20 bars before i (null if any is missing) */
  avgVolume: (number | null)[];
  /** Support / resistance from bars before i, cached */
  levelsBefore: (i: number) => LevelAnalysis;
  fmt: Fmt;
}

export function buildContext(candles: Candle[], fmt: Fmt): SetupContext {
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const tr = candles.map((c, i) => (i === 0 ? c.high - c.low
    : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))));
  const range: (number | null)[] = new Array(n).fill(null);
  const avgVolume: (number | null)[] = new Array(n).fill(null);
  const R = SETUP_RULES.rangeBars, V = SETUP_RULES.volumeBars;
  let trSum = 0;
  for (let i = 0; i < n; i++) {
    if (i >= R) range[i] = trSum / R; // bars i-R .. i-1
    trSum += tr[i];
    if (i >= R) trSum -= tr[i - R];
    if (i >= V) {
      let sum = 0, ok = true;
      for (let j = i - V; j < i; j++) { const v = candles[j].volume; if (v === null) { ok = false; break; } sum += v; }
      avgVolume[i] = ok ? sum / V : null;
    }
  }
  const cache = new Map<number, LevelAnalysis>();
  return {
    candles, closes, fmt, range, avgVolume,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    levelsBefore: (i) => {
      let a = cache.get(i);
      if (!a) { a = analyseLevels(candles.slice(0, i)); cache.set(i, a); }
      return a;
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const rule = (label: string, core: boolean, met: boolean, detail: string): Condition => ({ label, core, met, detail });
const x = (n: number) => `${n.toFixed(1)}×`;

function finish(type: SetupType, index: number, conditions: Condition[], rest: Omit<SetupCheck, "type" | "index" | "detected" | "conditions" | "met" | "total">): SetupCheck {
  return {
    type, index, conditions,
    detected: conditions.filter((c) => c.core).every((c) => c.met),
    met: conditions.filter((c) => c.met).length,
    total: conditions.length,
    ...rest,
  };
}

function volumeRule(ctx: SetupContext, i: number, core: boolean, label: string, multiple: number): Condition {
  const v = ctx.candles[i].volume, avg = ctx.avgVolume[i];
  if (v === null || avg === null || avg <= 0) return rule(label, core, false, "No volume data for this bar or the 20 before it.");
  const ratio = v / avg;
  return rule(label, core, ratio >= multiple, `Volume ${x(ratio)} its 20-bar average (needs ${x(multiple)}).`);
}

/** Bullish reversal bar: hammer, bullish engulfing, or a close above the previous bar's high */
export function reversalBar(candles: Candle[], i: number): string | null {
  const c = candles[i], p = candles[i - 1];
  if (!p) return null;
  const body = Math.abs(c.close - c.open);
  const lower = Math.min(c.open, c.close) - c.low;
  const upper = c.high - Math.max(c.open, c.close);
  // Hammer: lower wick at least twice the body, and only a small upper wick (no bigger than the
  // body or a tenth of the bar's range, so near-equal prices don't fail on rounding)
  if (c.high > c.low && lower > 0 && lower >= 2 * body && upper <= Math.max(body, (c.high - c.low) * 0.1)) return "hammer (long lower wick)";
  if (p.close < p.open && c.close > c.open && c.open <= p.close && c.close >= p.open) return "bullish engulfing";
  if (c.close > p.high) return "close above the previous bar's high";
  return null;
}

// ── The five setups ─────────────────────────────────────────────────────────

export function checkBreakout(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const c = candles[i];
  const prev = candles[i - 1];
  const r: Level | undefined = i > 0 ? ctx.levelsBefore(i).resistance[0] : undefined;
  const rsiV = ctx.rsi14[i], s50 = ctx.sma50[i];
  const conditions = [
    rule("A resistance level above the price", true, !!r,
      r ? `${fmt(r.price)}, where price turned ${r.touches} times (found from earlier bars).` : "No level above the previous close with 2+ touches."),
    rule("Closes above resistance", true, !!r && c.close > r.price,
      r ? `Closed ${fmt(c.close)} vs ${fmt(r.price)}.` : "No resistance to break."),
    rule("First close above it", true, !!r && !!prev && prev.close <= r.price,
      r && prev ? `Previous close ${fmt(prev.close)} was ${prev.close <= r.price ? "at or below" : "already above"} it.` : "No resistance to break."),
    volumeRule(ctx, i, true, "Heavier volume", SETUP_RULES.volumeSurge),
    rule("RSI above 50", false, rsiV !== null && rsiV > 50, rsiV === null ? "Not enough bars for RSI." : `RSI ${rsiV.toFixed(1)}.`),
    rule("Closes above SMA 50", false, s50 !== null && c.close > s50, s50 === null ? "Not enough bars for SMA 50." : `SMA 50 is ${fmt(s50)}.`),
  ];
  return finish("breakout", i, conditions, {
    range: [r ? Math.max(r.lastIndex, i - 30) : i, i],
    levels: r ? [{ price: r.price, label: "Resistance broken" }] : [],
    invalidation: r ? { price: r.price, text: `A close back below ${fmt(r.price)}, the level it broke.` } : { price: null, text: "Needs a resistance level." },
  });
}

export function checkPullback(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const P = SETUP_RULES.pullback;
  const c = candles[i], prev = candles[i - 1];
  const s50 = ctx.sma50[i], s200 = ctx.sma200[i], s50Before = ctx.sma50[i - P.slopeBars] ?? null;
  const e20 = ctx.ema20[i], e50 = ctx.ema50[i];
  const range = ctx.range[i];

  const from = Math.max(0, i - P.highBars);
  let highIdx = from;
  for (let j = from; j < i; j++) if (candles[j].high >= candles[highIdx].high) highIdx = j;
  const recentHigh = candles[highIdx].high;
  let lowIdx = Math.max(0, i - P.touchBars + 1);
  for (let j = lowIdx; j <= i; j++) if (candles[j].low < candles[lowIdx].low) lowIdx = j;
  const dipLow = candles[lowIdx].low;
  const drop = range ? (recentHigh - dipLow) / range : null;

  const near = (avg: number | null) => avg !== null && range !== null && dipLow <= avg + range / 2;
  const touched = near(e20) ? `EMA 20 (${fmt(e20!)})` : near(e50) ? `EMA 50 (${fmt(e50!)})` : null;

  const quietFrom = i - P.quietBars;
  let quietOk = quietFrom >= 0 && ctx.avgVolume[i] !== null;
  let quietSum = 0;
  for (let j = Math.max(0, quietFrom); j < i && quietOk; j++) { const v = candles[j].volume; if (v === null) quietOk = false; else quietSum += v; }
  const quietRatio = quietOk && ctx.avgVolume[i] ? quietSum / P.quietBars / ctx.avgVolume[i]! : null;
  const rsiV = ctx.rsi14[i];

  const conditions = [
    rule("Established uptrend", true, s50 !== null && s200 !== null && s50Before !== null && s50 > s200 && s50 > s50Before,
      s50 === null || s200 === null || s50Before === null ? "Needs 200+ bars for the averages."
        : `SMA 50 ${fmt(s50)} is ${s50 > s200 ? "above" : "below"} SMA 200 ${fmt(s200)} and ${s50 > s50Before ? "rising" : "not rising"} over ${P.slopeBars} bars.`),
    rule("Pulled back from a recent high", true, drop !== null && drop >= P.minDrop,
      drop === null ? "Not enough bars." : `Low ${fmt(dipLow)} is ${drop.toFixed(1)} average bar ranges below the ${P.highBars}-bar high ${fmt(recentHigh)} (needs ${P.minDrop}).`),
    rule("Reached EMA 20 or EMA 50", true, !!touched,
      touched ? `The last ${P.touchBars} bars dipped to ${touched}.` : e20 === null || e50 === null ? "Not enough bars for the averages."
        : `Lowest low ${fmt(dipLow)} stayed above EMA 20 (${fmt(e20)}) and EMA 50 (${fmt(e50)}) by more than half a bar range.`),
    rule("Held above EMA 50", true, e50 !== null && c.close > e50, e50 === null ? "Not enough bars." : `Closed ${fmt(c.close)} vs EMA 50 ${fmt(e50)}.`),
    rule("Turning up", true, !!prev && c.close > c.open && c.close > prev.close,
      prev ? `Closed ${c.close > c.open ? "above" : "below"} its open and ${c.close > prev.close ? "above" : "below"} the previous close.` : "No previous bar."),
    rule("Lighter volume on the dip", false, quietRatio !== null && quietRatio < 1,
      quietRatio === null ? "No volume data." : `Last ${P.quietBars} bars averaged ${x(quietRatio)} the 20-bar volume.`),
    rule(`RSI at or above ${P.minRsi}`, false, rsiV !== null && rsiV >= P.minRsi, rsiV === null ? "Not enough bars for RSI." : `RSI ${rsiV.toFixed(1)}.`),
  ];
  return finish("pullback", i, conditions, {
    range: [highIdx, i],
    levels: [{ price: recentHigh, label: "Recent high" }],
    invalidation: { price: dipLow, text: `A close below the pullback low of ${fmt(dipLow)}.` },
  });
}

export function checkBullFlag(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const F = SETUP_RULES.flag;
  const range = ctx.range[i];
  // The flag top is the highest high of the last few bars (before this one)
  const from = Math.max(0, i - F.maxFlagBars);
  let top = Math.max(0, i - 1);
  for (let j = i - 1; j >= from; j--) if (candles[j].high > candles[top].high) top = j;
  // The pole runs up to the top from the lowest low of the bars before it
  let start = Math.max(0, top - F.maxPoleBars);
  for (let j = start; j < top; j++) if (candles[j].low < candles[start].low) start = j;
  const poleLow = candles[start].low, topHigh = candles[top].high;
  const pole = topHigh - poleLow;
  const flagBars = i - top;
  let flagLow = Infinity, flagHigh = -Infinity;
  for (let j = top + 1; j <= i; j++) flagLow = Math.min(flagLow, candles[j].low);
  for (let j = top + 1; j < i; j++) flagHigh = Math.max(flagHigh, candles[j].high);
  if (flagHigh === -Infinity) flagHigh = topHigh;
  const retrace = pole > 0 && flagLow !== Infinity ? (topHigh - flagLow) / pole : null;
  const poleRanges = range ? pole / range : null;
  const broke = flagBars >= F.minFlagBars && candles[i].close > flagHigh;
  // The top must be the peak of the whole move, not a lower high after an earlier peak
  let clean = top > start;
  for (let j = start; j < top && clean; j++) if (candles[j].high > topHigh) clean = false;

  const conditions = [
    rule("Strong rise first (the pole)", true, poleRanges !== null && poleRanges >= F.minPole && clean,
      poleRanges === null ? "Not enough bars."
        : !clean ? `No clean rise into the high of ${fmt(topHigh)}.`
        : `${fmt(poleLow)} → ${fmt(topHigh)} in ${top - start} bars: ${poleRanges.toFixed(1)} average bar ranges (needs ${F.minPole}).`),
    rule("Pause without a new high", true, flagBars >= F.minFlagBars && flagBars <= F.maxFlagBars,
      `${flagBars} bar${flagBars === 1 ? "" : "s"} since the high (needs ${F.minFlagBars}–${F.maxFlagBars}).`),
    rule("Shallow pullback", true, retrace !== null && retrace <= F.maxRetrace,
      retrace === null ? "No pullback yet." : `Gave back ${Math.round(retrace * 100)}% of the pole (at most ${F.maxRetrace * 100}%).`),
    rule("Closes above the flag", false, broke,
      flagBars < F.minFlagBars ? "The flag hasn't formed yet." : `Closed ${fmt(candles[i].close)} vs the flag's high ${fmt(flagHigh)}.`),
    volumeRule(ctx, i, false, "Volume on the breakout", SETUP_RULES.volumeSurge),
  ];
  return finish("bullFlag", i, conditions, {
    range: [start, i],
    levels: [{ price: flagHigh, label: "Flag high" }],
    invalidation: flagLow !== Infinity
      ? { price: flagLow, text: `A close below the flag's low of ${fmt(flagLow)}.` }
      : { price: null, text: "The flag hasn't formed yet." },
  });
}

export function checkSupportBounce(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const B = SETUP_RULES.bounce;
  const c = candles[i];
  const from = Math.max(0, i - B.testBars + 1);
  let lowIdx = from;
  for (let j = from; j <= i; j++) if (candles[j].low < candles[lowIdx].low) lowIdx = j;
  const low = candles[lowIdx].low;
  // The level tested is the detected level (from earlier bars) nearest the recent low
  const a = i > 0 ? ctx.levelsBefore(i) : null;
  const candidates = a ? [a.support[0], a.resistance[0]].filter((l): l is Level => !!l) : [];
  const s = candidates.sort((p, q) => Math.abs(p.price - low) - Math.abs(q.price - low))[0];
  const tol = a?.tolerance ?? 0;
  const tested = !!s && low <= s.price + tol && low >= s.price - 2 * tol;
  const reversal = reversalBar(candles, i);

  const conditions = [
    rule("A support level", true, !!s, s ? `${fmt(s.price)}, where price turned ${s.touches} times (found from earlier bars).` : "No level with 2+ touches nearby."),
    rule("Dipped to support", true, tested,
      s ? `Lowest low of the last ${B.testBars} bars ${fmt(low)} vs ${fmt(s.price)} (must come within ${fmt(tol)} above, or ${fmt(2 * tol)} below).` : "No level to test."),
    rule("Closed back above it", true, !!s && c.close > s.price, s ? `Closed ${fmt(c.close)}.` : "No level to test."),
    rule("Bullish reversal bar", true, !!reversal, reversal ? `This bar is a ${reversal}.` : "Not a hammer, bullish engulfing, or close above the previous high."),
    volumeRule(ctx, i, false, "Volume at or above average", 1),
    rule(`Level has ${B.strongTouches}+ touches`, false, !!s && s.touches >= B.strongTouches, s ? `${s.touches} touches.` : "No level."),
  ];
  return finish("supportBounce", i, conditions, {
    range: [from, i],
    levels: s ? [{ price: s.price, label: "Support" }] : [],
    invalidation: { price: low, text: `A close below the bounce low of ${fmt(low)}.` },
  });
}

export function checkGoldenCross(ctx: SetupContext, i: number): SetupCheck {
  const { fmt, closes } = ctx;
  const G = SETUP_RULES.goldenCross;
  const a = ctx.sma50[i], b = ctx.sma200[i], pa = ctx.sma50[i - 1] ?? null, pb = ctx.sma200[i - 1] ?? null;
  const bBefore = ctx.sma200[i - G.slopeBars] ?? null;
  const crossed = a !== null && b !== null && pa !== null && pb !== null && pa <= pb && a > b;
  const conditions = [
    rule("SMA 50 crosses above SMA 200", true, crossed,
      a === null || b === null || pa === null || pb === null ? "Needs 200+ bars."
        : crossed ? `SMA 50 ${fmt(a)} moved above SMA 200 ${fmt(b)} on this bar.`
        : `SMA 50 ${fmt(a)} is ${a > b ? "above" : "below"} SMA 200 ${fmt(b)}; no cross on this bar.`),
    rule("Price above both averages", false, a !== null && b !== null && closes[i] > a && closes[i] > b,
      a === null || b === null ? "Needs 200+ bars." : `Closed ${fmt(closes[i])}.`),
    rule("SMA 200 rising", false, b !== null && bBefore !== null && b > bBefore,
      b === null || bBefore === null ? "Needs 220+ bars." : `SMA 200 ${fmt(b)} vs ${fmt(bBefore)} ${G.slopeBars} bars earlier.`),
  ];
  return finish("goldenCross", i, conditions, {
    range: [i, i],
    levels: [],
    invalidation: { price: null, text: "SMA 50 falling back below SMA 200 (a death cross)." },
  });
}

const CHECKS: Record<SetupType, (ctx: SetupContext, i: number) => SetupCheck> = {
  breakout: checkBreakout,
  pullback: checkPullback,
  bullFlag: checkBullFlag,
  supportBounce: checkSupportBounce,
  goldenCross: checkGoldenCross,
};

export function checkSetup(type: SetupType, ctx: SetupContext, i: number) {
  return CHECKS[type](ctx, i);
}

/**
 * Judges every setup on each of the last SETUP_RULES.scanBars bars (golden crosses across the
 * whole history, since they're rare) and summarises the latest bar and the latest detection.
 */
export function scanSetups(candles: Candle[], fmt: Fmt): SetupSummary[] {
  const n = candles.length;
  if (n < 2) return [];
  const ctx = buildContext(candles, fmt);
  return SETUP_ORDER.map((type) => {
    const first = type === "goldenCross" ? 1 : Math.max(1, n - SETUP_RULES.scanBars);
    let last: SetupCheck | null = null;
    let lastStart: number | null = null;
    let occurrences = 0;
    let prevDetected = false;
    let latest: SetupCheck | null = null;
    for (let i = first; i < n; i++) {
      // Golden crosses are cheap to rule out without building the whole checklist
      if (type === "goldenCross" && i < n - 1) {
        const a = ctx.sma50[i], b = ctx.sma200[i], pa = ctx.sma50[i - 1], pb = ctx.sma200[i - 1];
        if (!(a !== null && b !== null && pa !== null && pb !== null && pa <= pb && a > b)) { prevDetected = false; continue; }
      }
      const check = checkSetup(type, ctx, i);
      if (i === n - 1) latest = check;
      if (check.detected) {
        if (!prevDetected) { occurrences++; lastStart = i; }
        last = check;
      }
      prevDetected = check.detected;
    }
    latest ??= checkSetup(type, ctx, n - 1);
    return {
      type, latest, last, lastStart,
      recent: !!last && n - 1 - last.index <= SETUP_RULES.recentBars[type],
      occurrences,
      scanned: n - first,
    };
  });
}
