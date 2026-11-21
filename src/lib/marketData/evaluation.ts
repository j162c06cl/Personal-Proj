// Historical evaluation, step 1: find every past setup signal and replay it as one trade with
// fixed, stated rules, using only what was known at the time. Accounts, position sizing, fees and
// statistics are in backtest.ts.
//
// No look-ahead:
// - A setup is judged on bar i from bars 0..i only (the setup engine guarantees this).
// - The trade enters at the *next* bar's open, the first price available after bar i closed.
// - The stop comes from the setup as judged on bar i, and the target from that stop and the
//   entry; neither moves afterwards.
// - Exits are found bar by bar from the entry onwards, never past `lastBar`. Within one bar the
//   order of the high and the low is unknown, so a bar that reaches both counts as the stop.
// - A bar still forming is left out by the caller, so a result never rests on an unfinished bar.

import { SETUP_ORDER, SetupCheck, SetupContext, SetupType, checkSetup } from "./setups";

/** The rules every replayed trade follows */
export interface TradeRules {
  /** Target distance as a multiple of the risk (entry − stop) */
  targetR: number;
  /** Exit at the close of this bar (counting the entry bar as 1) if neither stop nor target is hit */
  maxBars: number;
  /** Stop for setups with no invalidation price (golden crosses), in average bar ranges below the entry */
  fallbackStopRanges: number;
  /** Every fill is this % worse than the price that triggered it */
  slippagePct: number;
}

export type Outcome = "target" | "stop" | "time" | "open";

export interface TradeRecord {
  type: SetupType;
  /** Bar the setup was detected on: the first bar of a detection, or a bull flag's breakout bar */
  signal: number;
  /** The rules as judged on the signal bar */
  check: SetupCheck;
  entryIndex: number;
  /** The entry bar's open, and what was paid after slippage */
  entryPrice: number;
  entry: number;
  stop: number;
  /** Where the stop came from */
  stopBasis: "invalidation" | "ranges";
  target: number;
  /** Entry (filled) − stop, per share */
  risk: number;
  /** Last bar of the trade (the period's last bar while it's still open) */
  exitIndex: number;
  /** The price that triggered the exit, and what was received after slippage. Open: the latest close for both */
  exitPrice: number;
  exit: number;
  outcome: Outcome;
  /** The exit bar reached both the stop and the target; counted as the stop */
  sameBar: boolean;
  /** The exit bar opened beyond the stop or target, so the exit is that open */
  gap: boolean;
  /** Price-only results per share, after slippage and before fees */
  returnPct: number;
  r: number;
  /** Most favourable and most adverse prices reached while in the trade, as % of entry and in R */
  mfePct: number;
  maePct: number;
  mfeR: number;
  maeR: number;
  /** Bars in the trade, counting the entry bar */
  bars: number;
}

export type SkipReason = "busy" | "noEntry" | "belowStop" | "noStop" | "tooSmall";

export interface SkippedSignal {
  type: SetupType;
  signal: number;
  reason: SkipReason;
}

export const SKIP_TEXT: Record<SkipReason, string> = {
  busy: "a position was already open",
  noEntry: "there was no bar after it to enter on in the period",
  belowStop: "the next bar opened at or below the stop",
  noStop: "there wasn't enough history to place a stop",
  tooSmall: "the risk budget or the cash left couldn't buy one share",
};

/**
 * Whether bar i is a signal: the first bar of a detection, or for bull flags the first bar of a
 * detection that has closed above the flag (a forming flag hasn't broken out, so isn't traded).
 */
function isSignal(type: SetupType, now: SetupCheck, prev: SetupCheck | null): boolean {
  const on = (c: SetupCheck | null) => !!c && c.detected && (type !== "bullFlag" || c.stage === "confirmed");
  return on(now) && !on(prev);
}

/** Every signal in the context's bars, oldest first (same bar: in SETUP_ORDER) */
export function findSignals(ctx: SetupContext): SetupCheck[] {
  const n = ctx.candles.length;
  const out: SetupCheck[] = [];
  for (const type of SETUP_ORDER) {
    let prev: SetupCheck | null = null;
    // Bar 0 has no bar before it, which every setup needs
    for (let i = 1; i < n; i++) {
      // Golden crosses are rare and cheap to rule out without the whole checklist
      if (type === "goldenCross") {
        const a = ctx.sma50[i], b = ctx.sma200[i], pa = ctx.sma50[i - 1], pb = ctx.sma200[i - 1];
        if (!(a !== null && b !== null && pa !== null && pb !== null && pa <= pb && a > b)) { prev = null; continue; }
      }
      const check = checkSetup(type, ctx, i);
      if (isSignal(type, check, prev)) out.push(check);
      prev = check;
    }
  }
  return out.sort((a, b) => a.index - b.index || SETUP_ORDER.indexOf(a.type) - SETUP_ORDER.indexOf(b.type));
}

/**
 * The trade from a signal, or the reason it can't be taken. Uses bars after the signal only to
 * find the entry and the exit, and none after `lastBar`.
 */
export function simulateTrade(
  ctx: SetupContext, check: SetupCheck, rules: TradeRules, lastBar = ctx.candles.length - 1
): TradeRecord | SkipReason {
  const { candles } = ctx;
  const signal = check.index;
  const e = signal + 1;
  if (e > lastBar) return "noEntry";
  const slip = rules.slippagePct / 100;
  const entryPrice = candles[e].open;
  const entry = entryPrice * (1 + slip);

  let stop: number, stopBasis: TradeRecord["stopBasis"];
  if (check.invalidation.price !== null) {
    stop = check.invalidation.price;
    stopBasis = "invalidation";
  } else {
    const range = ctx.range[signal];
    if (range === null) return "noStop";
    stop = entryPrice - rules.fallbackStopRanges * range;
    stopBasis = "ranges";
  }
  if (!(stop > 0) || entry <= stop || entryPrice <= stop) return "belowStop";
  const risk = entry - stop;
  const target = entry + rules.targetR * risk;

  let hi = entry, lo = entry;
  let outcome: Outcome = "open", exitPrice = candles[lastBar].close, exitIndex = lastBar;
  let sameBar = false, gap = false;
  const last = Math.min(lastBar, e + rules.maxBars - 1);
  for (let j = e; j <= last; j++) {
    const c = candles[j];
    // A gap past the stop or target fills at the open (the entry bar opens at the entry itself)
    if (j > e && c.open <= stop) {
      lo = Math.min(lo, c.open);
      outcome = "stop"; exitPrice = c.open; exitIndex = j; gap = true; break;
    }
    if (j > e && c.open >= target) {
      hi = Math.max(hi, c.open);
      outcome = "target"; exitPrice = c.open; exitIndex = j; gap = true; break;
    }
    const hitStop = c.low <= stop, hitTarget = c.high >= target;
    if (hitStop) {
      // Prices beyond the exit don't count; the bar's other extreme might have come first
      lo = Math.min(lo, stop);
      hi = Math.max(hi, c.high);
      outcome = "stop"; exitPrice = stop; exitIndex = j; sameBar = hitTarget; break;
    }
    if (hitTarget) {
      hi = Math.max(hi, target);
      lo = Math.min(lo, c.low);
      outcome = "target"; exitPrice = target; exitIndex = j; break;
    }
    hi = Math.max(hi, c.high);
    lo = Math.min(lo, c.low);
    if (j === e + rules.maxBars - 1) { outcome = "time"; exitPrice = c.close; exitIndex = j; break; }
    exitPrice = c.close; exitIndex = j;
  }
  // An open trade is valued at the latest close, with no exit slippage until it's actually sold
  const exit = outcome === "open" ? exitPrice : exitPrice * (1 - slip);

  return {
    type: check.type, signal, check,
    entryIndex: e, entryPrice, entry, stop, stopBasis, target, risk,
    exitIndex, exitPrice, exit, outcome, sameBar, gap,
    returnPct: ((exit - entry) / entry) * 100,
    r: (exit - entry) / risk,
    mfePct: ((hi - entry) / entry) * 100,
    maePct: ((entry - lo) / entry) * 100,
    mfeR: (hi - entry) / risk,
    maeR: (entry - lo) / risk,
    bars: exitIndex - e + 1,
  };
}
