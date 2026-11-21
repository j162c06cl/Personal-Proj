// Hypothetical trade plans: entry, stop and target, with the arithmetic that follows from them.
// Nothing here forecasts anything or places an order; the numbers ignore commissions, slippage,
// gaps through the stop and currency conversion.

import type { SetupType } from "./marketData/setups";
import { isValidTicker } from "./marketData/types";

export type Direction = "long" | "short";

export interface TradePlan {
  id: string;
  ticker: string;
  currency: string | null;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  /** Optional position size */
  shares: number | null;
  note: string;
  /** When it was made, and the bar it was made on (Unix seconds), for drawing its zones */
  createdAt: string;
  updatedAt: string;
  startTime: number;
  /** The setup it was planned from, if any */
  source: { setup: SetupType; detected: string } | null;
}

export interface PlanNumbers {
  direction: Direction;
  entry: number | null;
  stop: number | null;
  target: number | null;
  shares: number | null;
}

export interface PlanMetrics {
  /** Every problem stopping the plan from making sense; empty when it's valid */
  problems: string[];
  riskPerShare: number | null;
  rewardPerShare: number | null;
  /** Reward ÷ risk */
  rewardRisk: number | null;
  /** Distance from entry to stop and to target, as % of the entry (always positive) */
  stopPct: number | null;
  targetPct: number | null;
  /** How often a trade like this must reach its target, rather than its stop, to break even */
  breakEvenWinRate: number | null;
  loss: number | null;
  profit: number | null;
  positionValue: number | null;
}

export const NOTE_MAX = 500;

const pos = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;

export function planMetrics(p: PlanNumbers): PlanMetrics {
  const problems: string[] = [];
  if (!pos(p.entry)) problems.push("Enter an entry price above zero.");
  if (!pos(p.stop)) problems.push("Enter a stop-loss price above zero.");
  if (!pos(p.target)) problems.push("Enter a target price above zero.");
  if (p.shares !== null && !(Number.isFinite(p.shares) && p.shares > 0)) problems.push("Shares must be more than zero, or left blank.");
  const empty: PlanMetrics = {
    problems, riskPerShare: null, rewardPerShare: null, rewardRisk: null, stopPct: null, targetPct: null,
    breakEvenWinRate: null, loss: null, profit: null, positionValue: null,
  };
  if (!pos(p.entry) || !pos(p.stop) || !pos(p.target)) return empty;

  const long = p.direction === "long";
  if (long && p.stop >= p.entry) problems.push("For a long trade the stop must be below the entry.");
  if (long && p.target <= p.entry) problems.push("For a long trade the target must be above the entry.");
  if (!long && p.stop <= p.entry) problems.push("For a short trade the stop must be above the entry.");
  if (!long && p.target >= p.entry) problems.push("For a short trade the target must be below the entry.");
  if (problems.length) return empty;

  const risk = Math.abs(p.entry - p.stop);
  const reward = Math.abs(p.target - p.entry);
  const shares = p.shares !== null && p.shares > 0 ? p.shares : null;
  return {
    problems,
    riskPerShare: risk,
    rewardPerShare: reward,
    rewardRisk: reward / risk,
    stopPct: (risk / p.entry) * 100,
    targetPct: (reward / p.entry) * 100,
    breakEvenWinRate: (risk / (risk + reward)) * 100,
    loss: shares !== null ? shares * risk : null,
    profit: shares !== null ? shares * reward : null,
    positionValue: shares !== null ? shares * p.entry : null,
  };
}

/** Whole shares whose loss at the stop stays within `budget` */
export function sharesForRisk(budget: number, riskPerShare: number): number {
  if (!(budget > 0) || !(riskPerShare > 0)) return 0;
  // A hair of tolerance so 100 / 2.5 isn't floored to 39 by rounding
  return Math.floor(budget / riskPerShare + 1e-9);
}

/** Direction implied by where the stop and target sit around the entry */
export function inferDirection(entry: number, stop: number, target: number): Direction {
  if (stop < entry && target > entry) return "long";
  if (stop > entry && target < entry) return "short";
  return target >= entry ? "long" : "short";
}

/**
 * A starting long plan from a bullish setup: entry at the latest close, stop at the setup's
 * invalidation level, target at the nearest resistance above the entry or else twice the risk.
 * `why` explains each number so nothing appears unexplained.
 */
export function planFromSetup(opts: {
  lastClose: number;
  invalidation: number | null;
  resistanceAbove: number[];
  round: (v: number) => number;
}): { entry: number; stop: number | null; target: number | null; why: string[] } {
  const entry = opts.round(opts.lastClose);
  const why = ["Entry: the latest close."];
  const stop = opts.invalidation !== null && opts.invalidation > 0 ? opts.round(opts.invalidation) : null;
  if (stop === null) why.push("Stop: this setup has no price that invalidates it, so set your own.");
  else if (stop >= entry) why.push("Stop: the setup's invalidation level, which is already at or above the latest close, so the setup has been invalidated.");
  else why.push("Stop: the setup's invalidation level.");
  const above = opts.resistanceAbove.filter((r) => r > entry).sort((a, b) => a - b)[0];
  let target: number | null = null;
  if (above !== undefined) {
    target = opts.round(above);
    why.push("Target: the nearest detected resistance above the entry.");
  } else if (stop !== null && stop < entry) {
    target = opts.round(entry + 2 * (entry - stop));
    why.push("Target: twice the risk, since no resistance was detected above the entry.");
  } else {
    why.push("Target: no resistance was detected above the entry, so set your own.");
  }
  return { entry, stop, target, why };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isPrice = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const SETUPS: readonly string[] = ["breakout", "pullback", "bullFlag", "supportBounce", "goldenCross"];

/** Keeps only well-formed plans, so stored or imported data can never break the page */
export function sanitizePlans(raw: unknown): TradePlan[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).flatMap((p): TradePlan[] => {
    if (typeof p.id !== "string" || !p.id || typeof p.ticker !== "string" || !isValidTicker(p.ticker)) return [];
    if (p.direction !== "long" && p.direction !== "short") return [];
    if (!isPrice(p.entry) || !isPrice(p.stop) || !isPrice(p.target)) return [];
    if (planMetrics({ direction: p.direction, entry: p.entry, stop: p.stop, target: p.target, shares: null }).problems.length) return [];
    const src = isObj(p.source) && typeof p.source.setup === "string" && SETUPS.includes(p.source.setup) && typeof p.source.detected === "string"
      ? { setup: p.source.setup as SetupType, detected: p.source.detected } : null;
    const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date(0).toISOString();
    return [{
      id: p.id.slice(0, 64),
      ticker: p.ticker,
      currency: typeof p.currency === "string" ? p.currency : null,
      direction: p.direction,
      entry: p.entry, stop: p.stop, target: p.target,
      shares: isPrice(p.shares) ? p.shares : null,
      note: typeof p.note === "string" ? p.note.slice(0, NOTE_MAX) : "",
      createdAt,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : createdAt,
      startTime: typeof p.startTime === "number" && Number.isFinite(p.startTime) ? p.startTime : Date.parse(createdAt) / 1000,
      source: src,
    }];
  });
}
