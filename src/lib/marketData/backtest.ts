// Historical evaluation, step 2: a backtest. Signals from evaluation.ts are traded through an
// account with a starting balance, position sizing, brokerage fees and slippage, and the results
// are reported for the whole history and separately for a training and a testing period.
//
// Each setup is tested in its own account, and all setups together in one more account, where
// setups that fire on the same bar become one trade and the overlap rule decides whether a new
// signal can open a second position while one is already open.
//
// Everything here is arithmetic on past prices. Past results don't predict future ones.

import type { Candle } from "./types";
import { ParamDef, SETUP_ORDER, SetupCheck, SetupConfig, SetupContext, SetupType, buildContext } from "./setups";
import { Outcome, SkippedSignal, TradeRecord, TradeRules, findSignals, simulateTrade } from "./evaluation";

// ── Settings ────────────────────────────────────────────────────────────────

export interface BacktestConfig extends TradeRules {
  /** Brokerage per order (buy or sell): a fixed amount plus a % of the order's value */
  feeFixed: number;
  feePct: number;
  /** Starting balance, and the share of the account (closed trades only) risked per trade */
  capital: number;
  riskPct: number;
  /** Combined account: allow a new position while one is open */
  overlap: boolean;
  /** Share of the bars, from the start, used as the training period */
  trainPct: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  targetR: 2, maxBars: 20, fallbackStopRanges: 2, slippagePct: 0.05,
  feeFixed: 1, feePct: 0.05,
  capital: 10_000, riskPct: 1,
  overlap: false,
  trainPct: 70,
};

type Key = keyof BacktestConfig;
export const BACKTEST_PARAMS: { title: string; params: (ParamDef & { key: Key })[] }[] = [
  {
    title: "Trades", params: [
      { key: "targetR", label: "Target", help: "Distance from entry to target, as a multiple of the distance from entry to stop.", kind: "number", min: 0.5, max: 10, step: 0.5, unit: "× the risk" },
      { key: "maxBars", label: "Exit after", help: "If neither the stop nor the target is hit, sell at the close of this bar.", kind: "number", min: 1, max: 250, step: 1, unit: "bars" },
      { key: "fallbackStopRanges", label: "Golden-cross stop", help: "Golden crosses have no invalidation price, so their stop sits this far below the entry.", kind: "number", min: 0.5, max: 10, step: 0.5, unit: "avg bar ranges" },
    ],
  },
  {
    title: "Costs", params: [
      { key: "feeFixed", label: "Fixed brokerage", help: "Charged on every buy and every sell, in the stock's currency.", kind: "number", min: 0, max: 100, step: 0.5, unit: "per order" },
      { key: "feePct", label: "Percentage brokerage", help: "Also charged on every buy and every sell.", kind: "number", min: 0, max: 2, step: 0.01, unit: "% of each order" },
      { key: "slippagePct", label: "Slippage", help: "Every buy fills this much above, and every sell this much below, the price that triggered it.", kind: "number", min: 0, max: 2, step: 0.01, unit: "% per fill" },
    ],
  },
  {
    title: "Position sizing", params: [
      { key: "capital", label: "Starting balance", help: "In the stock's currency.", kind: "number", min: 100, max: 10_000_000, step: 100 },
      { key: "riskPct", label: "Risk per trade", help: "Shares are chosen so a loss at the stop costs this share of the balance (before costs), in whole shares and never more than the cash available.", kind: "number", min: 0.1, max: 10, step: 0.1, unit: "% of the balance" },
      { key: "overlap", label: "All setups together: allow several positions at once", help: "When off, a signal while a position is open is skipped.", kind: "boolean" },
    ],
  },
  {
    title: "Training and testing", params: [
      { key: "trainPct", label: "Training period", help: "The first part of the history, for judging and adjusting the rules. The rest is the testing period: check it only after you've finished adjusting.", kind: "number", min: 50, max: 90, step: 5, unit: "% of the bars" },
    ],
  },
];

export function sanitizeBacktestConfig(raw: unknown): BacktestConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG };
  for (const { params } of BACKTEST_PARAMS) {
    for (const p of params) {
      const v = src[p.key];
      if (p.kind === "boolean") { if (typeof v === "boolean") (out[p.key] as boolean) = v; continue; }
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const step = p.step ?? 1;
      const clamped = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
      (out[p.key] as number) = Number((Math.round(clamped / step) * step).toFixed(4));
    }
  }
  return out;
}

export const changedBacktestSettings = (c: BacktestConfig) =>
  (Object.keys(DEFAULT_BACKTEST_CONFIG) as Key[]).filter((k) => c[k] !== DEFAULT_BACKTEST_CONFIG[k]);

// ── Results ─────────────────────────────────────────────────────────────────

export interface AccountTrade extends TradeRecord {
  /** Other setups detected on the same bar, folded into this trade (combined account only) */
  also: SetupType[];
  shares: number;
  /** Balance (closed trades) when the trade was opened */
  balanceBefore: number;
  /** Brokerage paid (an open trade: the buy only) */
  fees: number;
  /** What slippage cost, against the prices that triggered the fills */
  slippageCost: number;
  /** After slippage and fees (an open trade: valued at the latest close) */
  netPnl: number;
  /** Net P&L ÷ the amount paid for the shares */
  netReturnPct: number;
  /** Net P&L ÷ the amount at risk (shares × risk per share) */
  netR: number;
  /** Target distance ÷ stop distance from the filled entry */
  plannedRR: number;
}

export interface AccountStats {
  /** Closed trades; open ones are listed but not counted */
  trades: number;
  open: number;
  targetFirst: number;
  stopFirst: number;
  timeExits: number;
  /** % of closed trades with a net profit */
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Average net P&L per closed trade */
  avgPnl: number | null;
  avgReturnPct: number | null;
  /** Expectancy in units of risk, after costs */
  avgR: number | null;
  avgPlannedRR: number | null;
  /** Average win ÷ average loss */
  payoff: number | null;
  /** Gross profit ÷ gross loss, after costs (null with no losing trades) */
  profitFactor: number | null;
  totalPnl: number;
  fees: number;
  slippage: number;
  /** Largest fall in the balance (closed trades plus open positions at each close) from a peak */
  maxDrawdownPct: number;
  maxDrawdown: number;
  drawdownFrom: number | null;
  drawdownTo: number | null;
  /** Balance at the period's last close, including open positions */
  finalBalance: number;
  returnPct: number;
  avgMfeR: number | null;
  avgMaeR: number | null;
  avgBars: number | null;
}

export interface AccountResult {
  /** A single setup, or every setup together */
  key: SetupType | "all";
  /** Oldest first, including any still open at the period's end */
  trades: AccountTrade[];
  skipped: SkippedSignal[];
  /** Balance at the close of every bar in the period */
  balance: number[];
  stats: AccountStats;
}

export type PeriodId = "whole" | "training" | "testing";

export interface PeriodResult {
  id: PeriodId;
  /** First and last bar of the period; signals are taken from bars in it */
  from: number;
  to: number;
  accounts: Record<SetupType, AccountResult>;
  combined: AccountResult;
  /** The stock's own move over the period: first open to last close, in % */
  stockChangePct: number;
}

export interface Backtest {
  config: BacktestConfig;
  /** First bar of the testing period */
  split: number;
  periods: Record<PeriodId, PeriodResult>;
}

/** Fewer closed trades than this and results are flagged as too few to judge */
export const MIN_SAMPLE = 30;

// ── The account ─────────────────────────────────────────────────────────────

interface Candidate {
  check: SetupCheck;
  also: SetupType[];
}

const fee = (cfg: BacktestConfig, value: number) => cfg.feeFixed + (cfg.feePct / 100) * value;

/**
 * Trades the candidates, oldest first, through one account over bars [from, to].
 * The balance used for sizing counts closed trades only; cash is what's left after paying for
 * open positions, so the account never borrows.
 */
export function runAccount(
  ctx: SetupContext, key: AccountResult["key"], candidates: Candidate[], cfg: BacktestConfig, from: number, to: number
): AccountResult {
  const trades: AccountTrade[] = [];
  const skipped: SkippedSignal[] = [];
  let cash = cfg.capital, balance = cfg.capital;
  let open: AccountTrade[] = [];

  for (const { check, also } of candidates) {
    const e = check.index + 1;
    // Positions that ended before this entry bar have been sold
    open = open.filter((t) => {
      if (t.outcome === "open" || t.exitIndex >= e) return true;
      cash += t.shares * t.exit - fee(cfg, t.shares * t.exit);
      balance += t.netPnl;
      return false;
    });
    if (!cfg.overlap && open.length) { skipped.push({ type: check.type, signal: check.index, reason: "busy" }); continue; }
    const t = simulateTrade(ctx, check, cfg, to);
    if (typeof t === "string") { skipped.push({ type: check.type, signal: check.index, reason: t }); continue; }

    const byRisk = Math.floor((balance * cfg.riskPct) / 100 / t.risk + 1e-9);
    const byCash = Math.floor((cash - cfg.feeFixed) / (t.entry * (1 + cfg.feePct / 100)) + 1e-9);
    const shares = Math.min(byRisk, byCash);
    if (shares < 1) { skipped.push({ type: check.type, signal: check.index, reason: "tooSmall" }); continue; }

    const buyFee = fee(cfg, shares * t.entry);
    const sellFee = t.outcome === "open" ? 0 : fee(cfg, shares * t.exit);
    const netPnl = shares * (t.exit - t.entry) - buyFee - sellFee;
    const trade: AccountTrade = {
      ...t, also, shares, balanceBefore: balance,
      fees: buyFee + sellFee,
      slippageCost: shares * (t.entry - t.entryPrice) + (t.outcome === "open" ? 0 : shares * (t.exitPrice - t.exit)),
      netPnl,
      netReturnPct: (netPnl / (shares * t.entry)) * 100,
      netR: netPnl / (shares * t.risk),
      plannedRR: (t.target - t.entry) / t.risk,
    };
    cash -= shares * t.entry + buyFee;
    trades.push(trade);
    open.push(trade);
  }

  // Balance at each close: closed trades' results plus open positions at that close
  const n = to - from + 1;
  const bal = new Array<number>(n).fill(cfg.capital);
  const realised = new Array<number>(n).fill(0);
  for (const t of trades) {
    const buyFee = fee(cfg, t.shares * t.entry);
    const end = t.outcome === "open" ? to + 1 : t.exitIndex;
    for (let j = Math.max(t.entryIndex, from); j < end && j <= to; j++) bal[j - from] += t.shares * (ctx.candles[j].close - t.entry) - buyFee;
    if (t.outcome !== "open") realised[t.exitIndex - from] += t.netPnl;
  }
  let sum = 0;
  for (let k = 0; k < n; k++) { sum += realised[k]; bal[k] += sum; }

  return { key, trades, skipped, balance: bal, stats: accountStats(trades, bal, from, cfg) };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function accountStats(trades: AccountTrade[], balance: number[], from: number, cfg: BacktestConfig): AccountStats {
  const closed = trades.filter((t) => t.outcome !== "open");
  const pnl = closed.map((t) => t.netPnl);
  const wins = pnl.filter((p) => p > 0), losses = pnl.filter((p) => p <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0), grossLoss = -losses.reduce((a, b) => a + b, 0);
  const avgWin = mean(wins), avgLoss = mean(losses);

  let peak = balance[0] ?? cfg.capital, peakAt = 0, maxDd = 0, maxDdPct = 0, ddFrom: number | null = null, ddTo: number | null = null;
  balance.forEach((v, k) => {
    if (v > peak) { peak = v; peakAt = k; }
    const dd = peak - v;
    if (peak > 0 && dd / peak > maxDdPct) { maxDdPct = dd / peak; maxDd = dd; ddFrom = from + peakAt; ddTo = from + k; }
  });
  const final = balance.length ? balance[balance.length - 1] : cfg.capital;
  const count = (o: Outcome) => closed.filter((t) => t.outcome === o).length;

  return {
    trades: closed.length,
    open: trades.length - closed.length,
    targetFirst: count("target"),
    stopFirst: count("stop"),
    timeExits: count("time"),
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    avgWin, avgLoss,
    avgPnl: mean(pnl),
    avgReturnPct: mean(closed.map((t) => t.netReturnPct)),
    avgR: mean(closed.map((t) => t.netR)),
    avgPlannedRR: mean(closed.map((t) => t.plannedRR)),
    payoff: avgWin !== null && avgLoss !== null && avgLoss < 0 ? avgWin / -avgLoss : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    totalPnl: pnl.reduce((a, b) => a + b, 0),
    fees: closed.reduce((a, t) => a + t.fees, 0),
    slippage: closed.reduce((a, t) => a + t.slippageCost, 0),
    maxDrawdownPct: maxDdPct * 100,
    maxDrawdown: maxDd,
    drawdownFrom: ddFrom, drawdownTo: ddTo,
    finalBalance: final,
    returnPct: ((final - cfg.capital) / cfg.capital) * 100,
    avgMfeR: mean(closed.map((t) => t.mfeR)),
    avgMaeR: mean(closed.map((t) => t.maeR)),
    avgBars: mean(closed.map((t) => t.bars)),
  };
}

/** Signals on the same bar become one trade: the setup with the most confirmations met leads */
export function combineSameBar(signals: SetupCheck[]): Candidate[] {
  const byBar = new Map<number, SetupCheck[]>();
  for (const s of signals) byBar.set(s.index, [...(byBar.get(s.index) ?? []), s]);
  return Array.from(byBar.values()).map((group) => {
    const sorted = group.slice().sort((a, b) =>
      b.confirmationsMet - a.confirmationsMet || SETUP_ORDER.indexOf(a.type) - SETUP_ORDER.indexOf(b.type));
    return { check: sorted[0], also: sorted.slice(1).map((s) => s.type) };
  }).sort((a, b) => a.check.index - b.check.index);
}

function runPeriod(ctx: SetupContext, signals: SetupCheck[], cfg: BacktestConfig, id: PeriodId, from: number, to: number): PeriodResult {
  const inPeriod = signals.filter((s) => s.index >= from && s.index <= to);
  const accounts = Object.fromEntries(SETUP_ORDER.map((type) => [
    // Each setup on its own: one position at a time (the overlap setting is for the combined account)
    type, runAccount(ctx, type, inPeriod.filter((s) => s.type === type).map((check) => ({ check, also: [] })), { ...cfg, overlap: false }, from, to),
  ])) as Record<SetupType, AccountResult>;
  const c = ctx.candles;
  return {
    id, from, to, accounts,
    combined: runAccount(ctx, "all", combineSameBar(inPeriod), cfg, from, to),
    stockChangePct: ((c[to].close - c[from].open) / c[from].open) * 100,
  };
}

/**
 * Backtests every setup over `candles`, which must be finished bars only. The training period is
 * the first `trainPct` % of the bars and the testing period the rest; trades in the training
 * period can't use testing bars (a trade still open at the split stays open), and testing
 * starts with a fresh balance. Earlier bars are still used to judge setups in the testing period,
 * as they would have been at the time.
 */
export function runBacktest(
  candles: Candle[],
  fmt: (price: number) => string,
  opts: { config?: SetupConfig; intraday?: boolean; timeZone?: string; backtest?: BacktestConfig; ctx?: SetupContext } = {}
): Backtest | null {
  const n = candles.length;
  if (n < 3) return null;
  const cfg = opts.backtest ?? DEFAULT_BACKTEST_CONFIG;
  const ctx = opts.ctx ?? buildContext(candles, fmt, opts);
  const signals = findSignals(ctx);
  const split = Math.min(n - 1, Math.max(1, Math.floor((n * cfg.trainPct) / 100)));
  return {
    config: cfg, split,
    periods: {
      whole: runPeriod(ctx, signals, cfg, "whole", 0, n - 1),
      training: runPeriod(ctx, signals, cfg, "training", 0, split - 1),
      testing: runPeriod(ctx, signals, cfg, "testing", split, n - 1),
    },
  };
}
