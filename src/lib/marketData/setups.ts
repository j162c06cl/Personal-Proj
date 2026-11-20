// Rule-based swing-trading setups. Every setup is a fixed checklist: "core" rules must all pass
// for the setup to count as detected; "confirmation" rules add evidence. Scores are counts of
// rules met, reported separately for core rules and confirmations, so every number on screen
// can be traced to a rule. Every threshold lives in SetupConfig and can be changed by the reader.
//
// No look-ahead: judging bar i uses bars 0..i only. Support and resistance come from bars
// before i, and their swing points are themselves only confirmed LEVEL_RULES.pivotBars later.
// (What happened *after* a detection, i.e. whether it was later invalidated, is reported
// separately as its status and never feeds back into detection.)
//
// Distances use the average bar range (mean true range of the bars before i), so the same
// rules make sense on daily and intraday bars. Intraday volume is compared with the same time
// of day in earlier sessions, because volume is always heavy at the open.

import { ema, rsi, sma } from "@/lib/indicators";
import type { Candle } from "./types";
import { Level, LevelAnalysis, analyseLevels } from "./levels";
import { REL_VOLUME, relativeVolume } from "./indicators";

export type SetupType = "breakout" | "pullback" | "bullFlag" | "supportBounce" | "goldenCross";

export const SETUP_ORDER: SetupType[] = ["breakout", "pullback", "bullFlag", "supportBounce", "goldenCross"];

// ── Rules ───────────────────────────────────────────────────────────────────

export interface SetupConfig {
  general: { scanBars: number; rangeBars: number; volumeBars: number };
  breakout: { volumeSurge: number; freshBars: number; strongClose: number; recentBars: number };
  pullback: {
    highBars: number; minDrop: number; touchBars: number; nearBelow: number; nearAbove: number;
    slopeBars: number; minRsi: number; quietBars: number; recentBars: number;
  };
  bullFlag: {
    maxPoleBars: number; minPole: number; minFlagBars: number; maxFlagBars: number; maxRetrace: number;
    volumeSurge: number; recentBars: number;
  };
  supportBounce: {
    testBars: number; approachBars: number; approachRanges: number; strictReversal: boolean;
    strongTouches: number; recentBars: number;
  };
  goldenCross: { slopeBars: number; recentBars: number };
}

export const DEFAULT_SETUP_CONFIG: SetupConfig = {
  general: { scanBars: 250, rangeBars: 14, volumeBars: 20 },
  breakout: { volumeSurge: 1.5, freshBars: 10, strongClose: 50, recentBars: 10 },
  pullback: { highBars: 15, minDrop: 2, touchBars: 3, nearBelow: 1, nearAbove: 0.5, slopeBars: 10, minRsi: 40, quietBars: 5, recentBars: 10 },
  bullFlag: { maxPoleBars: 10, minPole: 4, minFlagBars: 2, maxFlagBars: 12, maxRetrace: 50, volumeSurge: 1.5, recentBars: 10 },
  supportBounce: { testBars: 3, approachBars: 10, approachRanges: 1.5, strictReversal: false, strongTouches: 3, recentBars: 10 },
  goldenCross: { slopeBars: 20, recentBars: 20 },
};

export interface ParamDef {
  key: string;
  label: string;
  help: string;
  kind: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** Every adjustable rule, grouped as the rules panel shows them */
export const SETUP_PARAMS: { group: keyof SetupConfig; title: string; params: ParamDef[] }[] = [
  {
    group: "general", title: "All setups", params: [
      { key: "scanBars", label: "Bars searched for past setups", help: "How far back the history list goes (golden crosses: all bars).", kind: "number", min: 50, max: 1000, step: 10, unit: "bars" },
      { key: "rangeBars", label: "Average bar range over", help: "Bars averaged for the typical high-to-low range that distances are measured in.", kind: "number", min: 5, max: 50, step: 1, unit: "bars" },
      { key: "volumeBars", label: "Average volume over (daily)", help: "Bars averaged for 'usual' volume on daily charts. Intraday charts compare the same time of day over earlier sessions.", kind: "number", min: 5, max: 100, step: 1, unit: "bars" },
    ],
  },
  {
    group: "breakout", title: "Breakout", params: [
      { key: "volumeSurge", label: "Heavier volume means at least", help: "Volume on the breakout bar compared with usual.", kind: "number", min: 1, max: 5, step: 0.1, unit: "×" },
      { key: "freshBars", label: "First break within", help: "Confirmation: no other close above the level in this many bars.", kind: "number", min: 2, max: 50, step: 1, unit: "bars" },
      { key: "strongClose", label: "Strong close: at least", help: "Confirmation: how far up the bar's range it must close.", kind: "number", min: 0, max: 100, step: 5, unit: "% up the bar" },
      { key: "recentBars", label: "Counts as recent for", help: "Detections this recent are shown as current.", kind: "number", min: 1, max: 100, step: 1, unit: "bars" },
    ],
  },
  {
    group: "pullback", title: "Pullback", params: [
      { key: "highBars", label: "Recent high: highest of", help: "Bars searched for the high the pullback starts from.", kind: "number", min: 5, max: 60, step: 1, unit: "bars" },
      { key: "minDrop", label: "Pullback at least", help: "Fall from that high to the pullback low.", kind: "number", min: 0.5, max: 10, step: 0.5, unit: "avg ranges" },
      { key: "touchBars", label: "Low must be in the last", help: "Bars in which price must reach the average.", kind: "number", min: 1, max: 10, step: 1, unit: "bars" },
      { key: "nearBelow", label: "Reached the average: down to", help: "How far below EMA 20 / 50 the low may go and still count as reaching it.", kind: "number", min: 0, max: 5, step: 0.25, unit: "avg ranges below" },
      { key: "nearAbove", label: "…or up to", help: "How far above EMA 20 / 50 the low may stop and still count.", kind: "number", min: 0, max: 3, step: 0.25, unit: "avg ranges above" },
      { key: "slopeBars", label: "SMA 50 rising over", help: "Uptrend: SMA 50 higher than this many bars ago.", kind: "number", min: 1, max: 60, step: 1, unit: "bars" },
      { key: "minRsi", label: "RSI at least", help: "Confirmation: momentum hasn't broken down.", kind: "number", min: 0, max: 100, step: 1 },
      { key: "quietBars", label: "Lighter volume over", help: "Confirmation: bars before the turn whose volume should be below usual.", kind: "number", min: 1, max: 20, step: 1, unit: "bars" },
      { key: "recentBars", label: "Counts as recent for", help: "Detections this recent are shown as current.", kind: "number", min: 1, max: 100, step: 1, unit: "bars" },
    ],
  },
  {
    group: "bullFlag", title: "Bull flag", params: [
      { key: "minPole", label: "Pole: rise of at least", help: "Size of the sharp rise before the flag.", kind: "number", min: 1, max: 15, step: 0.5, unit: "avg ranges" },
      { key: "maxPoleBars", label: "Pole: within", help: "Bars the pole may take.", kind: "number", min: 2, max: 40, step: 1, unit: "bars" },
      { key: "minFlagBars", label: "Flag: at least", help: "Bars of pause after the high.", kind: "number", min: 1, max: 20, step: 1, unit: "bars" },
      { key: "maxFlagBars", label: "Flag: at most", help: "Longer pauses aren't flags.", kind: "number", min: 2, max: 40, step: 1, unit: "bars" },
      { key: "maxRetrace", label: "Flag gives back at most", help: "Share of the pole the flag may give back.", kind: "number", min: 10, max: 100, step: 5, unit: "% of the pole" },
      { key: "volumeSurge", label: "Breakout volume at least", help: "Confirmation, only on a bar that closes above the flag.", kind: "number", min: 1, max: 5, step: 0.1, unit: "×" },
      { key: "recentBars", label: "Counts as recent for", help: "Detections this recent are shown as current.", kind: "number", min: 1, max: 100, step: 1, unit: "bars" },
    ],
  },
  {
    group: "supportBounce", title: "Support bounce", params: [
      { key: "testBars", label: "Test of support within", help: "Bars in which the low must reach the level.", kind: "number", min: 1, max: 10, step: 1, unit: "bars" },
      { key: "approachRanges", label: "Came down from at least", help: "Price must have been this far above the level shortly before.", kind: "number", min: 0, max: 10, step: 0.5, unit: "avg ranges above" },
      { key: "approachBars", label: "…within", help: "Bars searched for that higher price.", kind: "number", min: 2, max: 40, step: 1, unit: "bars" },
      { key: "strictReversal", label: "Only hammers and engulfing bars count as reversals", help: "When off, a close above the previous bar's high also counts.", kind: "boolean" },
      { key: "strongTouches", label: "Strong level: at least", help: "Confirmation: touches of the level.", kind: "number", min: 2, max: 10, step: 1, unit: "touches" },
      { key: "recentBars", label: "Counts as recent for", help: "Detections this recent are shown as current.", kind: "number", min: 1, max: 100, step: 1, unit: "bars" },
    ],
  },
  {
    group: "goldenCross", title: "Golden cross (SMA 50 / 200)", params: [
      { key: "slopeBars", label: "SMA 200 rising over", help: "Confirmation: SMA 200 higher than this many bars ago.", kind: "number", min: 1, max: 100, step: 1, unit: "bars" },
      { key: "recentBars", label: "Counts as recent for", help: "Detections this recent are shown as current.", kind: "number", min: 1, max: 200, step: 1, unit: "bars" },
    ],
  },
];

/** Fills gaps from the defaults and keeps every value within its allowed range */
export function sanitizeSetupConfig(raw: unknown): SetupConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, Record<string, unknown>>) : {};
  const out = JSON.parse(JSON.stringify(DEFAULT_SETUP_CONFIG)) as SetupConfig;
  for (const { group, params } of SETUP_PARAMS) {
    const target = out[group] as unknown as Record<string, number | boolean>;
    const given = src[group] && typeof src[group] === "object" ? src[group] : {};
    for (const p of params) {
      const v = given[p.key];
      if (p.kind === "boolean") {
        if (typeof v === "boolean") target[p.key] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        const step = p.step ?? 1;
        const clamped = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
        target[p.key] = Number((Math.round(clamped / step) * step).toFixed(4));
      }
    }
  }
  if (out.bullFlag.minFlagBars > out.bullFlag.maxFlagBars) out.bullFlag.minFlagBars = out.bullFlag.maxFlagBars;
  return out;
}

/** Rules that differ from the defaults, as "group.key" */
export function changedRules(config: SetupConfig): string[] {
  const out: string[] = [];
  for (const { group, params } of SETUP_PARAMS) {
    for (const p of params) {
      const a = (config[group] as unknown as Record<string, unknown>)[p.key];
      const b = (DEFAULT_SETUP_CONFIG[group] as unknown as Record<string, unknown>)[p.key];
      if (a !== b) out.push(`${group}.${p.key}`);
    }
  }
  return out;
}

export const SETUP_INFO: Record<SetupType, { name: string; short: string; summary: string }> = {
  breakout: {
    name: "Breakout", short: "Breakout",
    summary: "Price closes above a resistance level (a price where it has repeatedly turned) on heavier than usual volume.",
  },
  pullback: {
    name: "Pullback", short: "Pullback",
    summary: "In an uptrend, price dips back to its 20- or 50-bar exponential average and starts to turn up.",
  },
  bullFlag: {
    name: "Bull flag", short: "Bull flag",
    summary: "A sharp rise (the pole) followed by a short, shallow pause (the flag). It is forming during the pause and confirmed when price closes above the flag.",
  },
  supportBounce: {
    name: "Support bounce", short: "Bounce",
    summary: "Price falls to a support level (a price where it has repeatedly turned) and prints a bullish reversal bar there.",
  },
  goldenCross: {
    name: "Golden cross", short: "Golden cross",
    summary: "The 50-bar average crosses above the 200-bar average, a sign the longer trend has turned up.",
  },
};

// ── Results ─────────────────────────────────────────────────────────────────

export interface Condition {
  label: string;
  /** Core rules must all pass for detection; the rest are confirmations */
  core: boolean;
  met: boolean;
  /** The numbers behind the result */
  detail: string;
}

/** A bar that matters to a setup, and why */
export interface Evidence {
  index: number;
  role: string;
}

export interface SetupCheck {
  type: SetupType;
  /** Bar the rules were judged on */
  index: number;
  detected: boolean;
  conditions: Condition[];
  coreMet: number;
  coreTotal: number;
  confirmationsMet: number;
  confirmationsTotal: number;
  /** Bull flags only: still pausing, or closed above the flag */
  stage?: "forming" | "confirmed";
  /** Bars that make up the pattern, inclusive */
  range: [number, number];
  /** Prices the setup is built around (the level broken, the flag's high…) */
  levels: { price: number; label: string }[];
  /** Price whose loss would invalidate the setup, by its own rules (null: not a price) */
  invalidation: { price: number | null; text: string };
  /** Every bar the result depends on, oldest first, including earlier touches of a level */
  evidence: Evidence[];
}

export type DetectionStatus =
  | { kind: "valid" }
  | { kind: "invalidated"; index: number; text: string };

/** A run of consecutive bars on which a setup was detected */
export interface Detection {
  start: number;
  end: number;
  /** The rules as judged on the last bar of the run */
  check: SetupCheck;
  /** What happened after the run: whether the invalidation level has since been hit */
  status: DetectionStatus;
}

export interface SetupSummary {
  type: SetupType;
  /** The rules judged on the latest bar */
  latest: SetupCheck;
  /** Detections in the scanned bars, oldest first */
  detections: Detection[];
  /** The last detection, if it ended within the recent window */
  recent: Detection | null;
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
  /** Mean true range of the bars before i (null for the first bars) */
  range: (number | null)[];
  /** Bar volume ÷ usual volume (daily: previous bars; intraday: same time of day) */
  volRatio: (number | null)[];
  intraday: boolean;
  /** Support / resistance from bars before i, cached */
  levelsBefore: (i: number) => LevelAnalysis;
  config: SetupConfig;
  fmt: Fmt;
}

/**
 * Each bar's volume ÷ its usual volume: the average of the previous `volumeBars` bars on daily
 * charts, or the same time of day in earlier sessions on intraday charts.
 */
export function volumeRatios(candles: Candle[], opts: { config?: SetupConfig; intraday?: boolean; timeZone?: string } = {}): (number | null)[] {
  if (opts.intraday) return relativeVolume(candles, true, opts.timeZone ?? "America/New_York");
  const V = (opts.config ?? DEFAULT_SETUP_CONFIG).general.volumeBars;
  return candles.map((c, i) => {
    if (c.volume === null || i < V) return null;
    let sum = 0;
    for (let j = i - V; j < i; j++) { const v = candles[j].volume; if (v === null) return null; sum += v; }
    return sum > 0 ? c.volume / (sum / V) : null;
  });
}

export function buildContext(
  candles: Candle[],
  fmt: Fmt,
  opts: { config?: SetupConfig; intraday?: boolean; timeZone?: string } = {}
): SetupContext {
  const config = opts.config ?? DEFAULT_SETUP_CONFIG;
  const intraday = !!opts.intraday;
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const R = config.general.rangeBars;

  const tr = candles.map((c, i) => (i === 0 ? c.high - c.low
    : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))));
  const range: (number | null)[] = new Array(n).fill(null);
  let trSum = 0;
  for (let i = 0; i < n; i++) {
    if (i >= R) range[i] = trSum / R; // bars i-R .. i-1
    trSum += tr[i];
    if (i >= R) trSum -= tr[i - R];
  }

  const volRatio = volumeRatios(candles, { config, intraday, timeZone: opts.timeZone });

  const cache = new Map<number, LevelAnalysis>();
  return {
    candles, closes, fmt, range, volRatio, intraday, config,
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
const ranges = (n: number) => `${Number(n.toFixed(2))} average bar range${n === 1 ? "" : "s"}`;

function finish(
  type: SetupType, index: number, conditions: Condition[],
  rest: Omit<SetupCheck, "type" | "index" | "detected" | "conditions" | "coreMet" | "coreTotal" | "confirmationsMet" | "confirmationsTotal" | "evidence"> & { evidence: Evidence[] }
): SetupCheck {
  const core = conditions.filter((c) => c.core), conf = conditions.filter((c) => !c.core);
  // One row per bar, roles joined, oldest first
  const byBar = new Map<number, string[]>();
  for (const e of rest.evidence) {
    if (e.index < 0) continue;
    const roles = byBar.get(e.index) ?? [];
    if (!roles.includes(e.role)) roles.push(e.role);
    byBar.set(e.index, roles);
  }
  return {
    type, index, conditions,
    detected: core.every((c) => c.met),
    coreMet: core.filter((c) => c.met).length,
    coreTotal: core.length,
    confirmationsMet: conf.filter((c) => c.met).length,
    confirmationsTotal: conf.length,
    ...rest,
    evidence: Array.from(byBar, ([i, roles]) => ({ index: i, role: roles.join(" · ") })).sort((a, b) => a.index - b.index),
  };
}

function volumeBasis(ctx: SetupContext) {
  return ctx.intraday
    ? `the usual for this time of day (average of the last ${REL_VOLUME.intradayLookback} sessions)`
    : `its ${ctx.config.general.volumeBars}-bar average`;
}

function volumeRule(ctx: SetupContext, i: number, core: boolean, label: string, multiple: number): Condition {
  const ratio = ctx.volRatio[i];
  if (ratio === null) return rule(label, core, false, "No volume data for this bar or the bars it's compared with.");
  return rule(label, core, ratio >= multiple, `Volume ${x(ratio)} ${volumeBasis(ctx)} (needs ${x(multiple)}).`);
}

/** Mean of the volume ratios over bars [from, to], ignoring gaps; null if none */
function meanRatio(ctx: SetupContext, from: number, to: number): number | null {
  let sum = 0, count = 0;
  for (let j = Math.max(0, from); j <= to; j++) { const r = ctx.volRatio[j]; if (r !== null) { sum += r; count++; } }
  return count ? sum / count : null;
}

/** Bullish reversal bar: hammer, bullish engulfing, or a close above the previous bar's high */
export function reversalBar(candles: Candle[], i: number): { kind: "hammer" | "engulfing" | "closeAbove"; text: string } | null {
  const c = candles[i], p = candles[i - 1];
  if (!p) return null;
  const body = Math.abs(c.close - c.open);
  const lower = Math.min(c.open, c.close) - c.low;
  const upper = c.high - Math.max(c.open, c.close);
  // Hammer: lower wick at least twice the body, and only a small upper wick (no bigger than the
  // body or a tenth of the bar's range, so near-equal prices don't fail on rounding)
  if (c.high > c.low && lower > 0 && lower >= 2 * body && upper <= Math.max(body, (c.high - c.low) * 0.1)) return { kind: "hammer", text: "hammer (long lower wick)" };
  if (p.close < p.open && c.close > c.open && c.open <= p.close && c.close >= p.open) return { kind: "engulfing", text: "bullish engulfing" };
  if (c.close > p.high) return { kind: "closeAbove", text: "close above the previous bar's high" };
  return null;
}

const touchEvidence = (l: Level | undefined, what: string): Evidence[] => (l ? l.pivots.map((p) => ({ index: p, role: `Turned at the ${what}` })) : []);

// ── The five setups ─────────────────────────────────────────────────────────

export function checkBreakout(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const B = ctx.config.breakout;
  const c = candles[i];
  const prev = candles[i - 1];
  const r: Level | undefined = i > 0 ? ctx.levelsBefore(i).resistance[0] : undefined;
  const rsiV = ctx.rsi14[i], s50 = ctx.sma50[i];

  // Confirmation: the first close above this level for a while (not a retry after a failed break)
  let lastAbove: number | null = null;
  if (r) for (let j = i - 2; j >= Math.max(0, i - B.freshBars); j--) if (candles[j].close > r.price) { lastAbove = j; break; }
  const pos = c.high > c.low ? ((c.close - c.low) / (c.high - c.low)) * 100 : 100;

  const conditions = [
    rule("A resistance level above the price", true, !!r,
      r ? `${fmt(r.price)}, where price turned ${r.touches} times (found from earlier bars).` : "No level above the previous close with 2+ touches."),
    rule("Closes above resistance", true, !!r && c.close > r.price,
      r ? `Closed ${fmt(c.close)} vs ${fmt(r.price)}.` : "No resistance to break."),
    rule("Previous close at or below it", true, !!r && !!prev && prev.close <= r.price,
      r && prev ? `Previous close ${fmt(prev.close)} was ${prev.close <= r.price ? "at or below" : "already above"} it.` : "No resistance to break."),
    volumeRule(ctx, i, true, "Heavier volume", B.volumeSurge),
    rule("RSI above 50", false, rsiV !== null && rsiV > 50, rsiV === null ? "Not enough bars for RSI." : `RSI ${rsiV.toFixed(1)}.`),
    rule("Closes above SMA 50", false, s50 !== null && c.close > s50, s50 === null ? "Not enough bars for SMA 50." : `SMA 50 is ${fmt(s50)}.`),
    rule(`First break in ${B.freshBars} bars`, false, !!r && lastAbove === null,
      !r ? "No resistance to break." : lastAbove === null ? `No other close above it in the previous ${B.freshBars} bars.`
        : `Also closed above it ${i - lastAbove} bars earlier, so this is a retry after falling back.`),
    rule("Strong close", false, pos >= B.strongClose,
      `Closed ${Math.round(pos)}% of the way up the bar's range (needs ${B.strongClose}%).`),
  ];
  return finish("breakout", i, conditions, {
    range: [r ? Math.max(r.lastIndex, i - 30) : i, i],
    levels: r ? [{ price: r.price, label: "Resistance broken" }] : [],
    invalidation: r ? { price: r.price, text: `A close back below ${fmt(r.price)}, the level it broke.` } : { price: null, text: "Needs a resistance level." },
    evidence: [...touchEvidence(r, "resistance level"), { index: i - 1, role: "Last close below" }, { index: i, role: "Breakout bar" }],
  });
}

export function checkPullback(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const P = ctx.config.pullback;
  const c = candles[i], prev = candles[i - 1];
  const s50 = ctx.sma50[i], s200 = ctx.sma200[i], s50Before = ctx.sma50[i - P.slopeBars] ?? null;
  const e20 = ctx.ema20[i], e50 = ctx.ema50[i];
  const range = ctx.range[i];

  // The recent high, then the lowest low *after* it within the last few bars
  const highFrom = Math.max(0, i - P.highBars);
  let highIdx = highFrom;
  for (let j = highFrom; j < i; j++) if (candles[j].high >= candles[highIdx].high) highIdx = j;
  const recentHigh = candles[highIdx].high;
  let lowIdx = Math.max(highIdx + 1, i - P.touchBars + 1);
  for (let j = lowIdx; j <= i; j++) if (candles[j].low < candles[lowIdx].low) lowIdx = j;
  const dipLow = candles[lowIdx].low;
  const drop = range ? (recentHigh - dipLow) / range : null;

  // "Reached" an average: the low ends near it, not anywhere below it
  const near = (avg: number | null) => avg !== null && range !== null && dipLow >= avg - P.nearBelow * range && dipLow <= avg + P.nearAbove * range;
  const touched = [{ name: "EMA 20", v: e20 }, { name: "EMA 50", v: e50 }]
    .filter((a) => near(a.v))
    .sort((a, b) => Math.abs(dipLow - a.v!) - Math.abs(dipLow - b.v!))[0];

  const quiet = meanRatio(ctx, i - P.quietBars, i - 1);
  const rsiV = ctx.rsi14[i];

  const conditions = [
    rule("Established uptrend", true, s50 !== null && s200 !== null && s50Before !== null && s50 > s200 && s50 > s50Before,
      s50 === null || s200 === null || s50Before === null ? "Needs 200+ bars for the averages."
        : `SMA 50 ${fmt(s50)} is ${s50 > s200 ? "above" : "below"} SMA 200 ${fmt(s200)} and ${s50 > s50Before ? "rising" : "not rising"} over ${P.slopeBars} bars.`),
    rule("Pulled back from a recent high", true, drop !== null && drop >= P.minDrop,
      drop === null ? "Not enough bars." : `Low ${fmt(dipLow)} (after the ${P.highBars}-bar high of ${fmt(recentHigh)}) is ${drop.toFixed(1)} average bar ranges below it (needs ${P.minDrop}).`),
    rule("Reached EMA 20 or EMA 50", true, !!touched,
      touched ? `Low ${fmt(dipLow)} came within ${ranges(P.nearBelow)} below to ${ranges(P.nearAbove)} above ${touched.name} (${fmt(touched.v!)}).`
        : e20 === null || e50 === null || range === null ? "Not enough bars for the averages."
        : `Low ${fmt(dipLow)} isn't within ${ranges(P.nearBelow)} below to ${ranges(P.nearAbove)} above EMA 20 (${fmt(e20)}) or EMA 50 (${fmt(e50)}).`),
    rule("Held above EMA 50", true, e50 !== null && c.close > e50, e50 === null ? "Not enough bars." : `Closed ${fmt(c.close)} vs EMA 50 ${fmt(e50)}.`),
    rule("Turning up", true, !!prev && c.close > c.open && c.close > prev.close,
      prev ? `Closed ${c.close > c.open ? "above" : "below"} its open and ${c.close > prev.close ? "above" : "below"} the previous close.` : "No previous bar."),
    rule("Lighter volume on the dip", false, quiet !== null && quiet < 1,
      quiet === null ? "No volume data." : `The ${P.quietBars} bars before this one averaged ${x(quiet)} usual volume.`),
    rule(`RSI at or above ${P.minRsi}`, false, rsiV !== null && rsiV >= P.minRsi, rsiV === null ? "Not enough bars for RSI." : `RSI ${rsiV.toFixed(1)}.`),
  ];
  return finish("pullback", i, conditions, {
    range: [highIdx, i],
    levels: [{ price: recentHigh, label: "Recent high" }],
    invalidation: { price: dipLow, text: `A close below the pullback low of ${fmt(dipLow)}.` },
    evidence: [{ index: highIdx, role: "Recent high" }, { index: lowIdx, role: "Pullback low" }, { index: i, role: "Turning bar" }],
  });
}

export function checkBullFlag(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const F = ctx.config.bullFlag;
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

  // Volume: a breakout bar should be heavy; the flag itself quieter than the pole
  const breakVolume = volumeRule(ctx, i, false, "Volume on the breakout", F.volumeSurge);
  const flagVol = meanRatio(ctx, top + 1, broke ? i - 1 : i);
  const poleVol = meanRatio(ctx, start + 1, top);

  const conditions = [
    rule("Strong rise first (the pole)", true, poleRanges !== null && poleRanges >= F.minPole && clean,
      poleRanges === null ? "Not enough bars."
        : !clean ? `No clean rise into the high of ${fmt(topHigh)}.`
        : `${fmt(poleLow)} → ${fmt(topHigh)} in ${top - start} bars: ${poleRanges.toFixed(1)} average bar ranges (needs ${F.minPole}).`),
    rule("Pause without a new high", true, flagBars >= F.minFlagBars && flagBars <= F.maxFlagBars,
      `${flagBars} bar${flagBars === 1 ? "" : "s"} since the high (needs ${F.minFlagBars}–${F.maxFlagBars}).`),
    rule("Shallow pullback", true, retrace !== null && retrace * 100 <= F.maxRetrace,
      retrace === null ? "No pullback yet." : `Gave back ${Math.round(retrace * 100)}% of the pole (at most ${F.maxRetrace}%).`),
    rule("Closes above the flag", false, broke,
      flagBars < F.minFlagBars ? "The flag hasn't formed yet." : `Closed ${fmt(candles[i].close)} vs the flag's high ${fmt(flagHigh)}.`),
    broke ? breakVolume : rule("Volume on the breakout", false, false, "Only counts on a bar that closes above the flag."),
    rule("Quieter volume in the flag", false, flagVol !== null && poleVol !== null && flagVol < poleVol,
      flagVol === null || poleVol === null ? "No volume data." : `Flag bars averaged ${x(flagVol)} usual volume vs ${x(poleVol)} during the pole.`),
  ];
  const check = finish("bullFlag", i, conditions, {
    range: [start, i],
    levels: [{ price: flagHigh, label: "Flag high" }],
    invalidation: flagLow !== Infinity
      ? { price: flagLow, text: `A close below the flag's low of ${fmt(flagLow)}.` }
      : { price: null, text: "The flag hasn't formed yet." },
    evidence: [
      { index: start, role: "Pole start" },
      ...Array.from({ length: Math.max(0, top - start - 1) }, (_, k) => ({ index: start + 1 + k, role: "Pole" })),
      { index: top, role: "Flag top" },
      ...Array.from({ length: Math.max(0, i - top - 1) }, (_, k) => ({ index: top + 1 + k, role: "Flag" })),
      ...(i > top ? [{ index: i, role: broke ? "Breakout bar" : "Flag (latest bar)" }] : []),
    ],
  });
  if (check.detected) check.stage = broke ? "confirmed" : "forming";
  return check;
}

export function checkSupportBounce(ctx: SetupContext, i: number): SetupCheck {
  const { candles, fmt } = ctx;
  const S = ctx.config.supportBounce;
  const c = candles[i];
  const range = ctx.range[i];
  const from = Math.max(0, i - S.testBars + 1);
  let lowIdx = from;
  for (let j = from; j <= i; j++) if (candles[j].low < candles[lowIdx].low) lowIdx = j;
  const low = candles[lowIdx].low;
  // The level must have been support: below the close just before the test began. That rules
  // out rising up through resistance, but still allows a dip below support and a close back above.
  const pre = i - S.testBars;
  const preClose = pre >= 0 ? candles[pre].close : null;
  const a = i > 0 ? ctx.levelsBefore(i) : null;
  const candidates = a && preClose !== null ? [...a.support, ...a.resistance].filter((l) => l.price < preClose) : [];
  const s = candidates.sort((p, q) => Math.abs(p.price - low) - Math.abs(q.price - low))[0];
  const tol = a?.tolerance ?? 0;
  const tested = !!s && low <= s.price + tol && low >= s.price - 2 * tol;
  // …and price came down to it, rather than drifting sideways next to it
  let approachIdx = -1;
  for (let j = Math.max(0, i - S.approachBars); j < i; j++) if (approachIdx < 0 || candles[j].high > candles[approachIdx].high) approachIdx = j;
  const approachHigh = approachIdx >= 0 ? candles[approachIdx].high : null;
  const cameDown = !!s && range !== null && approachHigh !== null && approachHigh >= s.price + S.approachRanges * range;
  const reversal = reversalBar(candles, i);
  const reversalOk = !!reversal && (!S.strictReversal || reversal.kind !== "closeAbove");

  const conditions = [
    rule("A support level", true, !!s,
      s ? `${fmt(s.price)}, where price turned ${s.touches} times (found from earlier bars), below the close before the dip.`
        : "No level with 2+ touches below the price before the dip."),
    rule("Came down to it", true, cameDown,
      !s || range === null || approachHigh === null ? "No level to come down to."
        : `High of ${fmt(approachHigh)} in the previous ${S.approachBars} bars was ${((approachHigh - s.price) / range).toFixed(1)} average bar ranges above it (needs ${S.approachRanges}).`),
    rule("Dipped to support", true, tested,
      s ? `Lowest low of the last ${S.testBars} bars ${fmt(low)} vs ${fmt(s.price)} (must come within ${fmt(tol)} above, or ${fmt(2 * tol)} below).` : "No level to test."),
    rule("Closed back above it", true, !!s && c.close > s.price, s ? `Closed ${fmt(c.close)}.` : "No level to test."),
    rule("Bullish reversal bar", true, reversalOk,
      !reversal ? "Not a hammer, bullish engulfing, or close above the previous high."
        : reversalOk ? `This bar is a ${reversal.text}.`
        : `A ${reversal.text}, but only hammers and engulfing bars count with the current rules.`),
    volumeRule(ctx, i, false, "Volume at or above usual", 1),
    rule(`Level has ${S.strongTouches}+ touches`, false, !!s && s.touches >= S.strongTouches, s ? `${s.touches} touches.` : "No level."),
  ];
  return finish("supportBounce", i, conditions, {
    range: [Math.min(from, approachIdx >= 0 && cameDown ? approachIdx : from), i],
    levels: s ? [{ price: s.price, label: "Support" }] : [],
    invalidation: { price: low, text: `A close below the bounce low of ${fmt(low)}.` },
    evidence: [
      ...touchEvidence(s, "support level"),
      ...(approachIdx >= 0 && s ? [{ index: approachIdx, role: "Came down from here" }] : []),
      { index: lowIdx, role: "Test of support" },
      { index: i, role: "Reversal bar" },
    ],
  });
}

export function checkGoldenCross(ctx: SetupContext, i: number): SetupCheck {
  const { fmt, closes } = ctx;
  const G = ctx.config.goldenCross;
  const a = ctx.sma50[i], b = ctx.sma200[i], pa = ctx.sma50[i - 1] ?? null, pb = ctx.sma200[i - 1] ?? null;
  const bBefore = ctx.sma200[i - G.slopeBars] ?? null;
  const crossed = a !== null && b !== null && pa !== null && pb !== null && pa <= pb && a > b;
  const conditions = [
    rule("SMA 50 crosses above SMA 200", true, crossed,
      a === null || b === null || pa === null || pb === null ? "Needs 200+ bars."
        : crossed ? `SMA 50 ${fmt(a)} moved above SMA 200 ${fmt(b)} on this bar (previous bar: ${fmt(pa)} vs ${fmt(pb)}).`
        : `SMA 50 ${fmt(a)} is ${a > b ? "above" : "below"} SMA 200 ${fmt(b)}; no cross on this bar.`),
    rule("Price above both averages", false, a !== null && b !== null && closes[i] > a && closes[i] > b,
      a === null || b === null ? "Needs 200+ bars." : `Closed ${fmt(closes[i])}.`),
    rule("SMA 200 rising", false, b !== null && bBefore !== null && b > bBefore,
      b === null || bBefore === null ? `Needs ${200 + G.slopeBars}+ bars.` : `SMA 200 ${fmt(b)} vs ${fmt(bBefore)} ${G.slopeBars} bars earlier.`),
  ];
  return finish("goldenCross", i, conditions, {
    range: [Math.max(0, i - 1), i],
    levels: [],
    invalidation: { price: null, text: "SMA 50 falling back below SMA 200 (a death cross)." },
    evidence: [{ index: i - 1, role: "Last bar before the cross" }, { index: i, role: "Cross" }],
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

/** Whether, after bar `end`, the setup was invalidated by its own rule (reported, never used for detection) */
export function statusAfter(ctx: SetupContext, check: SetupCheck, end: number): DetectionStatus {
  const n = ctx.candles.length;
  if (check.type === "goldenCross") {
    for (let j = end + 1; j < n; j++) {
      const a = ctx.sma50[j], b = ctx.sma200[j];
      if (a !== null && b !== null && a <= b) return { kind: "invalidated", index: j, text: "SMA 50 fell back below SMA 200 (death cross)" };
    }
    return { kind: "valid" };
  }
  const p = check.invalidation.price;
  if (p === null) return { kind: "valid" };
  for (let j = end + 1; j < n; j++) {
    if (ctx.closes[j] < p) return { kind: "invalidated", index: j, text: `closed ${ctx.fmt(ctx.closes[j])}, below ${ctx.fmt(p)}` };
  }
  return { kind: "valid" };
}

/**
 * Judges every setup on each of the last `scanBars` bars (golden crosses across the whole
 * history, since they're rare), groups consecutive detections, and reports for each what has
 * happened since.
 */
export function scanSetups(
  candles: Candle[],
  fmt: Fmt,
  opts: { config?: SetupConfig; intraday?: boolean; timeZone?: string } = {}
): SetupSummary[] {
  const n = candles.length;
  if (n < 2) return [];
  const ctx = buildContext(candles, fmt, opts);
  const cfg = ctx.config;
  return SETUP_ORDER.map((type) => {
    const first = type === "goldenCross" ? 1 : Math.max(1, n - cfg.general.scanBars);
    const detections: Detection[] = [];
    let run: { start: number; check: SetupCheck } | null = null;
    let latest: SetupCheck | null = null;
    const close = (end: number) => {
      if (!run) return;
      detections.push({ start: run.start, end, check: run.check, status: statusAfter(ctx, run.check, end) });
      run = null;
    };
    for (let i = first; i < n; i++) {
      // Golden crosses are cheap to rule out without building the whole checklist
      if (type === "goldenCross" && i < n - 1) {
        const a = ctx.sma50[i], b = ctx.sma200[i], pa = ctx.sma50[i - 1], pb = ctx.sma200[i - 1];
        if (!(a !== null && b !== null && pa !== null && pb !== null && pa <= pb && a > b)) { close(i - 1); continue; }
      }
      const check = checkSetup(type, ctx, i);
      if (i === n - 1) latest = check;
      if (check.detected) {
        if (!run) run = { start: i, check };
        else run.check = check;
      } else {
        close(i - 1);
      }
    }
    close(n - 1);
    latest ??= checkSetup(type, ctx, n - 1);
    const last = detections[detections.length - 1] ?? null;
    return {
      type, latest, detections,
      recent: last && n - 1 - last.end <= cfg[type].recentBars ? last : null,
      scanned: n - first,
    };
  });
}
