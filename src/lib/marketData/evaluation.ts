// Historical evaluation: every past setup replayed as a trade with fixed, stated rules, using only
// what was known at the time.
//
// No look-ahead:
// - A setup is judged on bar i from bars 0..i only (the setup engine guarantees this).
// - The trade enters at the *next* bar's open, the first price available after bar i closed.
// - The stop comes from the setup as judged on bar i, and the target from that stop and the
//   entry; neither moves afterwards.
// - Exits are found bar by bar from the entry onwards. Within one bar the order of the high and
//   the low is unknown, so a bar that reaches both the stop and the target counts as the stop.
// - A bar still forming is left out by the caller, so a result never rests on an unfinished bar.
//
// The results are arithmetic on past prices. They ignore commissions, slippage beyond gaps,
// dividends and taxes, and say nothing about future results.

import type { Candle } from "./types";
import {
  ParamDef, SETUP_ORDER, SetupCheck, SetupConfig, SetupContext, SetupType, buildContext, checkSetup,
} from "./setups";

// ── Rules ───────────────────────────────────────────────────────────────────

export interface EvalConfig {
  /** Target distance as a multiple of the risk (entry − stop) */
  targetR: number;
  /** Exit at the close of this bar (counting the entry bar as 1) if neither stop nor target is hit */
  maxBars: number;
  /** Stop for setups with no invalidation price (golden crosses), in average bar ranges below the entry */
  fallbackStopRanges: number;
}

export const DEFAULT_EVAL_CONFIG: EvalConfig = { targetR: 2, maxBars: 20, fallbackStopRanges: 2 };

export const EVAL_PARAMS: (ParamDef & { key: keyof EvalConfig })[] = [
  { key: "targetR", label: "Target", help: "Distance from entry to target, as a multiple of the distance from entry to stop.", kind: "number", min: 0.5, max: 10, step: 0.5, unit: "× the risk" },
  { key: "maxBars", label: "Exit after", help: "If neither the stop nor the target is hit, exit at the close of this bar.", kind: "number", min: 1, max: 250, step: 1, unit: "bars" },
  { key: "fallbackStopRanges", label: "Golden-cross stop", help: "Golden crosses have no invalidation price, so their stop sits this far below the entry.", kind: "number", min: 0.5, max: 10, step: 0.5, unit: "avg ranges" },
];

export function sanitizeEvalConfig(raw: unknown): EvalConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_EVAL_CONFIG };
  for (const p of EVAL_PARAMS) {
    const v = src[p.key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const step = p.step ?? 1;
    const clamped = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
    out[p.key] = Number((Math.round(clamped / step) * step).toFixed(4));
  }
  return out;
}

// ── Results ─────────────────────────────────────────────────────────────────

export type Outcome = "target" | "stop" | "time" | "open";

export interface TradeRecord {
  type: SetupType;
  /** Bar the setup was detected on: the first bar of a detection, or a bull flag's breakout bar */
  signal: number;
  /** The rules as judged on the signal bar */
  check: SetupCheck;
  entryIndex: number;
  entry: number;
  stop: number;
  /** Where the stop came from */
  stopBasis: "invalidation" | "ranges";
  target: number;
  /** Entry − stop */
  risk: number;
  /** Last bar of the trade (the latest bar while it's still open) */
  exitIndex: number;
  /** Exit price; for an open trade, the latest close */
  exit: number;
  outcome: Outcome;
  /** The exit bar reached both the stop and the target; counted as the stop */
  sameBar: boolean;
  /** The exit bar opened beyond the stop or target, so the exit is that open */
  gap: boolean;
  /** (exit − entry) ÷ entry, in % */
  returnPct: number;
  /** (exit − entry) ÷ risk */
  r: number;
  /** Most favourable and most adverse prices reached while in the trade, as % of entry and in R */
  mfePct: number;
  maePct: number;
  mfeR: number;
  maeR: number;
  /** Bars in the trade, counting the entry bar */
  bars: number;
}

export type SkipReason = "busy" | "noEntry" | "belowStop" | "noStop";

export interface SkippedSignal {
  type: SetupType;
  signal: number;
  reason: SkipReason;
}

export const SKIP_TEXT: Record<SkipReason, string> = {
  busy: "a trade from the same setup was still open",
  noEntry: "there is no bar after it to enter on yet",
  belowStop: "the next bar opened at or below the stop",
  noStop: "there wasn't enough history to place a stop",
};

export interface SetupStats {
  /** Closed trades (open ones are listed but not counted) */
  trades: number;
  open: number;
  targetFirst: number;
  stopFirst: number;
  timeExits: number;
  /** % of closed trades with a positive return */
  winRate: number | null;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  /** Average R per closed trade: the expectancy, in units of risk */
  avgR: number | null;
  totalR: number;
  /** Gains ÷ losses, in R (null with no losses) */
  profitFactor: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  avgBars: number | null;
  best: number | null;
  worst: number | null;
}

export interface Evaluation {
  config: EvalConfig;
  /** Every trade, oldest first */
  trades: TradeRecord[];
  skipped: SkippedSignal[];
  stats: Record<SetupType, SetupStats>;
  overall: SetupStats;
  /** First and last bar of the history replayed */
  from: number;
  to: number;
  /** The stock's own change over those bars, open of the first to close of the last, in % */
  stockChangePct: number | null;
}

/** Fewer closed trades than this and the statistics are flagged as too few to judge */
export const MIN_SAMPLE = 30;

// ── Simulation ──────────────────────────────────────────────────────────────

/**
 * Whether bar i is a signal: the first bar of a detection, or for bull flags the first bar of a
 * detection that has closed above the flag (a forming flag hasn't broken out, so isn't traded).
 */
function isSignal(type: SetupType, now: SetupCheck, prev: SetupCheck | null): boolean {
  const on = (c: SetupCheck | null) => !!c && c.detected && (type !== "bullFlag" || c.stage === "confirmed");
  return on(now) && !on(prev);
}

/**
 * The trade from a signal on bar `signal`, or the reason it can't be taken.
 * Uses bars after `signal` only to find the entry and the exit.
 */
export function simulateTrade(
  ctx: SetupContext, check: SetupCheck, config: EvalConfig
): TradeRecord | SkipReason {
  const { candles } = ctx;
  const signal = check.index;
  const e = signal + 1;
  if (e >= candles.length) return "noEntry";
  const entry = candles[e].open;

  let stop: number, stopBasis: TradeRecord["stopBasis"];
  if (check.invalidation.price !== null) {
    stop = check.invalidation.price;
    stopBasis = "invalidation";
  } else {
    const range = ctx.range[signal];
    if (range === null) return "noStop";
    stop = entry - config.fallbackStopRanges * range;
    stopBasis = "ranges";
  }
  if (!(stop > 0) || entry <= stop) return "belowStop";
  const risk = entry - stop;
  const target = entry + config.targetR * risk;

  let hi = entry, lo = entry;
  let outcome: Outcome = "open", exit = candles[candles.length - 1].close, exitIndex = candles.length - 1;
  let sameBar = false, gap = false;
  const last = Math.min(candles.length - 1, e + config.maxBars - 1);
  for (let j = e; j <= last; j++) {
    const c = candles[j];
    // A gap past the stop or target fills at the open (the entry bar opens at the entry itself)
    if (j > e && c.open <= stop) {
      lo = Math.min(lo, c.open);
      outcome = "stop"; exit = c.open; exitIndex = j; gap = true; break;
    }
    if (j > e && c.open >= target) {
      hi = Math.max(hi, c.open);
      outcome = "target"; exit = c.open; exitIndex = j; gap = true; break;
    }
    const hitStop = c.low <= stop, hitTarget = c.high >= target;
    if (hitStop) {
      // Prices beyond the exit don't count; the bar's other extreme might have come first
      lo = Math.min(lo, stop);
      hi = Math.max(hi, c.high);
      outcome = "stop"; exit = stop; exitIndex = j; sameBar = hitTarget; break;
    }
    if (hitTarget) {
      hi = Math.max(hi, target);
      lo = Math.min(lo, c.low);
      outcome = "target"; exit = target; exitIndex = j; break;
    }
    hi = Math.max(hi, c.high);
    lo = Math.min(lo, c.low);
    if (j === e + config.maxBars - 1) { outcome = "time"; exit = c.close; exitIndex = j; break; }
    exit = c.close; exitIndex = j;
  }

  return {
    type: check.type, signal, check,
    entryIndex: e, entry, stop, stopBasis, target, risk,
    exitIndex, exit, outcome, sameBar, gap,
    returnPct: ((exit - entry) / entry) * 100,
    r: (exit - entry) / risk,
    mfePct: ((hi - entry) / entry) * 100,
    maePct: ((entry - lo) / entry) * 100,
    mfeR: (hi - entry) / risk,
    maeR: (entry - lo) / risk,
    bars: exitIndex - e + 1,
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function tradeStats(trades: TradeRecord[]): SetupStats {
  const closed = trades.filter((t) => t.outcome !== "open");
  const rs = closed.map((t) => t.r), rets = closed.map((t) => t.returnPct);
  const gains = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const losses = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  return {
    trades: closed.length,
    open: trades.length - closed.length,
    targetFirst: closed.filter((t) => t.outcome === "target").length,
    stopFirst: closed.filter((t) => t.outcome === "stop").length,
    timeExits: closed.filter((t) => t.outcome === "time").length,
    winRate: closed.length ? (rets.filter((r) => r > 0).length / closed.length) * 100 : null,
    avgReturnPct: mean(rets),
    medianReturnPct: median(rets),
    avgR: mean(rs),
    totalR: rs.reduce((a, b) => a + b, 0),
    profitFactor: losses > 0 ? gains / losses : null,
    avgMfeR: mean(closed.map((t) => t.mfeR)),
    avgMaeR: mean(closed.map((t) => t.maeR)),
    avgBars: mean(closed.map((t) => t.bars)),
    best: rets.length ? Math.max(...rets) : null,
    worst: rets.length ? Math.min(...rets) : null,
  };
}

/**
 * Replays every setup in `candles` as a trade. Pass only finished bars: a bar still forming
 * would make results depend on a price that can still change.
 * One trade at a time per setup type: a new signal while one is open is skipped, so one move
 * isn't counted several times.
 */
export function evaluateSetups(
  candles: Candle[],
  fmt: (price: number) => string,
  opts: { config?: SetupConfig; intraday?: boolean; timeZone?: string; evalConfig?: EvalConfig; ctx?: SetupContext } = {}
): Evaluation {
  const config = opts.evalConfig ?? DEFAULT_EVAL_CONFIG;
  const ctx = opts.ctx ?? buildContext(candles, fmt, opts);
  const n = candles.length;
  const trades: TradeRecord[] = [];
  const skipped: SkippedSignal[] = [];

  for (const type of SETUP_ORDER) {
    let prev: SetupCheck | null = null;
    let busyUntil = -1;
    // Bar 0 has no bar before it, which every setup needs
    for (let i = 1; i < n; i++) {
      // Golden crosses are rare and cheap to rule out without the whole checklist
      if (type === "goldenCross") {
        const a = ctx.sma50[i], b = ctx.sma200[i], pa = ctx.sma50[i - 1], pb = ctx.sma200[i - 1];
        if (!(a !== null && b !== null && pa !== null && pb !== null && pa <= pb && a > b)) { prev = null; continue; }
      }
      const check = checkSetup(type, ctx, i);
      if (isSignal(type, check, prev)) {
        // The previous trade ended during bar busyUntil, so a signal at that bar's close is free
        if (i < busyUntil) skipped.push({ type, signal: i, reason: "busy" });
        else {
          const t = simulateTrade(ctx, check, config);
          if (typeof t === "string") skipped.push({ type, signal: i, reason: t });
          else { trades.push(t); busyUntil = t.outcome === "open" ? n : t.exitIndex; }
        }
      }
      prev = check;
    }
  }

  trades.sort((a, b) => a.signal - b.signal || SETUP_ORDER.indexOf(a.type) - SETUP_ORDER.indexOf(b.type));
  skipped.sort((a, b) => a.signal - b.signal);
  const stats = Object.fromEntries(SETUP_ORDER.map((t) => [t, tradeStats(trades.filter((x) => x.type === t))])) as Record<SetupType, SetupStats>;
  return {
    config, trades, skipped, stats,
    overall: tradeStats(trades),
    from: 0, to: n - 1,
    stockChangePct: n > 1 ? ((candles[n - 1].close - candles[0].open) / candles[0].open) * 100 : null,
  };
}
