import { describe, expect, it } from "vitest";
import { Candle } from "./types";
import { SetupCheck, SetupType, buildContext } from "./setups";
import {
  BacktestConfig, DEFAULT_BACKTEST_CONFIG, changedBacktestSettings, combineSameBar, runAccount, runBacktest, sanitizeBacktestConfig,
} from "./backtest";

const fmt = (p: number) => `$${p.toFixed(2)}`;
const k = (open: number, high: number, low: number, close: number): Omit<Candle, "time"> => ({ open, high, low, close, volume: 1000 });
const NO_COSTS: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, feeFixed: 0, feePct: 0, slippagePct: 0 };

/** 20 flat bars at 100, then the given bars */
function ctxWith(after: Omit<Candle, "time">[]) {
  const bars = [...Array.from({ length: 20 }, () => k(100, 100.5, 99.5, 100)), ...after].map((c, i) => ({ ...c, time: i * 86_400 }));
  return buildContext(bars, fmt);
}
const sig = (index: number, stop: number, type: SetupType = "breakout", confirmationsMet = 0): SetupCheck => ({
  type, index, detected: true, conditions: [], coreMet: 1, coreTotal: 1, confirmationsMet, confirmationsTotal: 3,
  range: [index, index], levels: [], invalidation: { price: stop, text: "" }, evidence: [],
});
const one = (check: SetupCheck) => ({ check, also: [] as SetupType[] });

describe("position sizing", () => {
  it("risks the chosen share of the balance, in whole shares", () => {
    // Entry 100, stop 98: $2 a share; 1% of $10,000 is $100, so 50 shares
    const ctx = ctxWith([k(100, 100.5, 99.5, 100), k(100, 104.5, 99.8, 104)]);
    const a = runAccount(ctx, "breakout", [one(sig(19, 98))], NO_COSTS, 0, 21);
    expect(a.trades[0].shares).toBe(50);
    expect(a.trades[0].netPnl).toBeCloseTo(200); // target 104: +$4 × 50
    expect(a.stats.finalBalance).toBeCloseTo(10_200);
  });

  it("never spends more cash than the account has", () => {
    // 10% risk = $1,000 on a $0.10 risk would be 10,000 shares; $10,000 buys 100
    const ctx = ctxWith([k(100, 100.5, 99.95, 100)]);
    const a = runAccount(ctx, "breakout", [one(sig(19, 99.9))], { ...NO_COSTS, riskPct: 10 }, 0, 20);
    expect(a.trades[0].shares).toBe(100);
  });

  it("skips a trade the risk budget can't buy one share of", () => {
    const ctx = ctxWith([k(100, 100.5, 99.5, 100)]);
    const a = runAccount(ctx, "breakout", [one(sig(19, 10))], { ...NO_COSTS, capital: 100, riskPct: 1 }, 0, 20);
    expect(a.trades).toHaveLength(0);
    expect(a.skipped[0].reason).toBe("tooSmall");
  });

  it("sizes later trades from the balance after earlier ones closed", () => {
    // First trade loses $100 (50 shares × $2), so the second risks 1% of $9,900 = $99: 49 shares
    const ctx = ctxWith([k(100, 100.5, 97, 97.5), k(97.5, 98, 97, 97.5), k(97.5, 98, 97, 97.5)]);
    const a = runAccount(ctx, "breakout", [one(sig(19, 98)), one(sig(21, 95.5))], NO_COSTS, 0, 22);
    expect(a.trades.map((t) => t.shares)).toEqual([50, 49]);
    expect(a.trades[1].balanceBefore).toBeCloseTo(9_900);
  });
});

describe("fees and slippage", () => {
  it("charges brokerage on the buy and the sell, and reports slippage separately", () => {
    const cfg = { ...DEFAULT_BACKTEST_CONFIG, feeFixed: 1, feePct: 0.1, slippagePct: 0 };
    const ctx = ctxWith([k(100, 100.5, 99.5, 100), k(100, 104.5, 99.8, 104)]);
    const t = runAccount(ctx, "breakout", [one(sig(19, 98))], cfg, 0, 21).trades[0];
    const buy = 1 + 0.001 * 50 * 100, sell = 1 + 0.001 * 50 * 104;
    expect(t.fees).toBeCloseTo(buy + sell);
    expect(t.netPnl).toBeCloseTo(200 - buy - sell);
    expect(t.slippageCost).toBe(0);
  });

  it("turns a small winner into a loser when the costs are larger than the move", () => {
    const cfg = { ...DEFAULT_BACKTEST_CONFIG, feeFixed: 20, feePct: 0, slippagePct: 0.2 };
    const ctx = ctxWith([k(100, 100.5, 99.9, 100), k(100, 100.8, 99.9, 100.6)]);
    const t = runAccount(ctx, "breakout", [one(sig(19, 99.8))], { ...cfg, maxBars: 2 }, 0, 21).trades[0];
    expect(t.outcome).toBe("time");
    expect(t.exitPrice).toBeGreaterThan(t.entryPrice); // the price moved the right way
    expect(t.netPnl).toBeLessThan(0); // …but not enough to pay for the trade
    expect(t.slippageCost).toBeGreaterThan(0);
  });
});

describe("several setups on one stock", () => {
  it("holds one position at a time unless overlapping is allowed", () => {
    const bars = [k(100, 100.5, 99.5, 100), k(100, 101, 99.5, 100.5), k(100.5, 101, 100, 100.5), k(100.5, 101, 100, 100.5)];
    const signals = [one(sig(19, 98)), one(sig(20, 98, "pullback"))];
    const single = runAccount(ctxWith(bars), "all", signals, NO_COSTS, 0, 23);
    expect(single.trades).toHaveLength(1);
    expect(single.skipped).toEqual([{ type: "pullback", signal: 20, reason: "busy" }]);
    const both = runAccount(ctxWith(bars), "all", signals, { ...NO_COSTS, overlap: true }, 0, 23);
    expect(both.trades).toHaveLength(2);
  });

  it("makes setups on the same bar one trade, led by the one with most confirmations", () => {
    const c = combineSameBar([sig(30, 98, "breakout", 1), sig(30, 97, "supportBounce", 2), sig(31, 98, "pullback")]);
    expect(c).toHaveLength(2);
    expect(c[0].check.type).toBe("supportBounce");
    expect(c[0].also).toEqual(["breakout"]);
  });
});

describe("account statistics", () => {
  it("works out win rate, average win and loss, payoff, profit factor and planned R:R after costs", () => {
    // Win +$200, then a loss of 50 shares × $2 = −$100
    const ctx = ctxWith([k(100, 100.5, 99.5, 100), k(100, 104.5, 99.8, 104), k(104, 104.5, 103.8, 104), k(104, 104.2, 101.5, 102)]);
    const a = runAccount(ctx, "breakout", [one(sig(21, 102))], NO_COSTS, 0, 23);
    const b = runAccount(ctx, "breakout", [one(sig(19, 98)), one(sig(21, 102))], NO_COSTS, 0, 23);
    expect(a.stats.trades).toBe(1);
    const s = b.stats;
    expect(s.trades).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.avgWin).toBeCloseTo(200);
    expect(s.avgLoss).toBeCloseTo(-102); // 51 shares (1% of $10,200) × $2
    expect(s.payoff).toBeCloseTo(200 / 102);
    expect(s.profitFactor).toBeCloseTo(200 / 102);
    expect(s.avgPlannedRR).toBeCloseTo(2);
    expect([s.targetFirst, s.stopFirst]).toEqual([1, 1]);
  });

  it("measures the maximum drawdown from the balance at each close, open positions included", () => {
    // 50 shares bought at 100: the close of 99 marks the balance $50 down before the stop at 98
    const ctx = ctxWith([k(100, 100.5, 98.8, 99), k(99, 99.5, 97, 97.5)]);
    const s = runAccount(ctx, "breakout", [one(sig(19, 98))], NO_COSTS, 0, 21).stats;
    expect(s.maxDrawdown).toBeCloseTo(100);
    expect(s.maxDrawdownPct).toBeCloseTo(1);
    expect([s.drawdownFrom, s.drawdownTo]).toEqual([0, 21]);
    expect(s.returnPct).toBeCloseTo(-1);
  });

  it("lists open trades but leaves them out of the statistics", () => {
    const ctx = ctxWith([k(100, 100.5, 99.5, 101)]);
    const a = runAccount(ctx, "breakout", [one(sig(19, 98))], NO_COSTS, 0, 20);
    expect(a.trades[0].outcome).toBe("open");
    expect([a.stats.trades, a.stats.open, a.stats.winRate]).toEqual([0, 1, null]);
    expect(a.stats.finalBalance).toBeCloseTo(10_050); // valued at the latest close
  });
});

describe("training and testing periods", () => {
  /** Swings between 100 and 110 for 120 bars, so supports and resistances keep forming */
  function swings(count: number): Candle[] {
    return Array.from({ length: count }, (_, n) => {
      const ph = n % 12, m = 100 + (ph <= 6 ? ph : 12 - ph) * (10 / 6) + (n % 5 === 0 ? 0.3 : 0);
      return { time: n * 86_400, open: m, high: m + 0.6, low: m - 0.6, close: m + (n % 2 ? 0.2 : -0.2), volume: 1000 + (n % 7) * 400 };
    });
  }

  it("splits the bars, keeps training trades inside the training bars, and starts testing with a fresh balance", () => {
    const bt = runBacktest(swings(240), fmt, { backtest: { ...DEFAULT_BACKTEST_CONFIG, trainPct: 70 } })!;
    expect(bt.split).toBe(168);
    const { training, testing, whole } = bt.periods;
    expect([training.from, training.to, testing.from, testing.to]).toEqual([0, 167, 168, 239]);
    for (const a of [training.combined, ...Object.values(training.accounts)]) {
      for (const t of a.trades) { expect(t.signal).toBeLessThan(168); expect(t.exitIndex).toBeLessThanOrEqual(167); }
    }
    for (const t of testing.combined.trades) expect(t.signal).toBeGreaterThanOrEqual(168);
    if (testing.combined.trades.length) expect(testing.combined.trades[0].balanceBefore).toBe(DEFAULT_BACKTEST_CONFIG.capital);
    expect(whole.combined.balance).toHaveLength(240);
    expect(testing.combined.balance).toHaveLength(72);
    expect(whole.combined.trades.length).toBeGreaterThan(0);
  });

  it("gives the same training results whatever comes after the split", () => {
    const all = swings(240);
    const a = runBacktest(all, fmt)!.periods.training.combined.trades.map((t) => [t.signal, t.entry, t.exit, t.shares]);
    const b = runBacktest(all.slice(0, 168), fmt, { backtest: { ...DEFAULT_BACKTEST_CONFIG, trainPct: 90 } })!;
    // The first 168 bars as a whole history, cut off at the same last bar
    const c = b.periods.whole.combined.trades.map((t) => [t.signal, t.entry, t.exit, t.shares]);
    expect(a).toEqual(c);
  });
});

describe("settings", () => {
  it("fills gaps from the defaults, keeps values in range and reads older saved settings", () => {
    expect(sanitizeBacktestConfig(null)).toEqual(DEFAULT_BACKTEST_CONFIG);
    const c = sanitizeBacktestConfig({ targetR: 3, maxBars: 0, riskPct: 50, overlap: true, feePct: "x", trainPct: 72 });
    expect([c.targetR, c.maxBars, c.riskPct, c.overlap, c.feePct, c.trainPct]).toEqual([3, 1, 10, true, 0.05, 70]);
    expect(changedBacktestSettings(c).sort()).toEqual(["maxBars", "overlap", "riskPct", "targetR"]);
  });
});
