import { describe, expect, it } from "vitest";
import { Candle } from "./types";
import { SetupCheck, buildContext } from "./setups";
import {
  DEFAULT_EVAL_CONFIG, EvalConfig, TradeRecord, evaluateSetups, sanitizeEvalConfig, simulateTrade, tradeStats,
} from "./evaluation";

const fmt = (p: number) => `$${p.toFixed(2)}`;
const k = (i: number, open: number, high: number, low: number, close: number, volume: number | null = 1000): Candle =>
  ({ time: i * 86_400, open, high, low, close, volume });

/** Flat bars at 100 (average range 1), so a stop and target can be placed by hand */
const flat = (count: number) => Array.from({ length: count }, (_, i) => k(i, 100, 100.5, 99.5, 100));

/** A detected setup on bar `index` whose invalidation price is `stop` (null: none) */
const signalAt = (index: number, stop: number | null): SetupCheck => ({
  type: stop === null ? "goldenCross" : "breakout", index, detected: true, conditions: [],
  coreMet: 1, coreTotal: 1, confirmationsMet: 0, confirmationsTotal: 0, range: [index, index], levels: [],
  invalidation: { price: stop, text: "" }, evidence: [],
});

function run(after: Candle[], stop: number | null, config: Partial<EvalConfig> = {}) {
  const bars = [...flat(20), ...after.map((c, j) => ({ ...c, time: (20 + j) * 86_400 }))];
  return simulateTrade(buildContext(bars, fmt), signalAt(19, stop), { ...DEFAULT_EVAL_CONFIG, ...config });
}
const trade = (x: TradeRecord | string) => { if (typeof x === "string") throw new Error(x); return x; };

describe("replaying one setup as a trade", () => {
  it("enters at the next bar's open, not the signal bar's close", () => {
    const t = trade(run([k(0, 101, 101.5, 100.5, 101)], 98));
    expect(t.entryIndex).toBe(20);
    expect(t.entry).toBe(101);
    expect(t.risk).toBe(3);
    expect(t.target).toBe(107); // 2R
  });

  it("exits at the target when it's reached first, with MFE and MAE in % and R", () => {
    const t = trade(run([k(0, 100, 101, 99, 100.5), k(0, 100.5, 104.5, 100, 104)], 98));
    expect([t.outcome, t.exit, t.exitIndex, t.bars]).toEqual(["target", 104, 21, 2]);
    expect(t.r).toBeCloseTo(2);
    expect(t.returnPct).toBeCloseTo(4);
    expect(t.mfeR).toBeCloseTo(2); // prices beyond the target don't count
    expect(t.maeR).toBeCloseTo(0.5);
    expect(t.maePct).toBeCloseTo(1);
  });

  it("exits at the stop when it's reached first", () => {
    const t = trade(run([k(0, 100, 100.5, 99, 99.5), k(0, 99.5, 101, 97, 97.5)], 98));
    expect([t.outcome, t.exit, t.r]).toEqual(["stop", 98, -1]);
    expect(t.maeR).toBeCloseTo(1);
    expect(t.mfeR).toBeCloseTo(0.5);
  });

  it("counts a bar that reaches both the stop and the target as the stop", () => {
    const t = trade(run([k(0, 100, 105, 97, 100)], 98));
    expect([t.outcome, t.sameBar, t.r]).toEqual(["stop", true, -1]);
  });

  it("fills at the open when a bar gaps past the stop or the target", () => {
    const down = trade(run([k(0, 100, 100.5, 99.5, 100), k(0, 96, 97, 95, 96.5)], 98));
    expect([down.outcome, down.exit, down.gap, down.r]).toEqual(["stop", 96, true, -2]);
    expect(down.maeR).toBeCloseTo(2); // the open, not the bar's later low
    const up = trade(run([k(0, 100, 100.5, 99.5, 100), k(0, 106, 108, 105, 107)], 98));
    expect([up.outcome, up.exit, up.gap, up.r]).toEqual(["target", 106, true, 3]);
  });

  it("exits at the close after the time limit when neither is hit", () => {
    const t = trade(run([k(0, 100, 101, 99, 100), k(0, 100, 101, 99, 101), k(0, 101, 102, 100, 101.5)], 98, { maxBars: 3 }));
    expect([t.outcome, t.exit, t.exitIndex, t.bars]).toEqual(["time", 101.5, 22, 3]);
    expect(t.r).toBeCloseTo(0.75);
  });

  it("leaves a trade open when the data runs out, with its result so far", () => {
    const t = trade(run([k(0, 100, 101, 99, 100), k(0, 100, 101, 99, 100.8)], 98));
    expect([t.outcome, t.exit, t.exitIndex]).toEqual(["open", 100.8, 21]);
  });

  it("can't be taken without a next bar, or when the next bar opens at or below the stop", () => {
    expect(simulateTrade(buildContext(flat(20), fmt), signalAt(19, 98), DEFAULT_EVAL_CONFIG)).toBe("noEntry");
    expect(run([k(0, 97.5, 98, 97, 97.5)], 98)).toBe("belowStop");
  });

  it("places a stop in average ranges below the entry for setups without an invalidation price", () => {
    const t = trade(run([k(0, 100, 100.5, 99.5, 100)], null, { fallbackStopRanges: 2 }));
    expect(t.stopBasis).toBe("ranges");
    expect(t.stop).toBeCloseTo(98); // average range of the flat bars is 1
  });
});

describe("statistics", () => {
  const t = (outcome: TradeRecord["outcome"], r: number, bars = 5) =>
    ({ outcome, r, returnPct: r * 2, mfeR: Math.max(r, 0.5), maeR: 0.5, bars }) as TradeRecord;

  it("counts closed trades only, and works out win rate, expectancy and profit factor", () => {
    const s = tradeStats([t("target", 2), t("stop", -1), t("stop", -1), t("time", 0.5), t("open", 1)]);
    expect([s.trades, s.open, s.targetFirst, s.stopFirst, s.timeExits]).toEqual([4, 1, 1, 2, 1]);
    expect(s.winRate).toBe(50);
    expect(s.avgR).toBeCloseTo(0.125);
    expect(s.totalR).toBeCloseTo(0.5);
    expect(s.profitFactor).toBeCloseTo(1.25);
    expect(s.medianReturnPct).toBeCloseTo(-0.5);
    expect([s.best, s.worst]).toEqual([4, -2]);
  });

  it("reports nothing rather than zeros when there are no closed trades", () => {
    const s = tradeStats([t("open", 1)]);
    expect([s.trades, s.winRate, s.avgR, s.profitFactor]).toEqual([0, null, null, null]);
  });
});

describe("evaluating a whole history", () => {
  /** Swings between 100 and 110, then breaks out on heavy volume and runs up */
  function history(): Candle[] {
    const out: Candle[] = [];
    for (let n = 0; n < 60; n++) {
      const phase = n % 12;
      const m = 100 + (phase <= 6 ? phase : 12 - phase) * (10 / 6);
      out.push(k(n, m, m + 0.5, m - 0.5, m));
    }
    const last = out[59].close;
    out.push(k(60, last, 113.5, last, 113, 3000));
    for (let j = 1; j <= 30; j++) { const p = 113 + j * 0.5; out.push(k(60 + j, p - 0.3, p + 0.4, p - 0.6, p)); }
    return out;
  }

  it("finds the breakout and trades it from the next bar", () => {
    const ev = evaluateSetups(history(), fmt);
    const b = ev.trades.find((t) => t.type === "breakout")!;
    expect(b.signal).toBe(60);
    expect(b.entryIndex).toBe(61);
    expect(b.stop).toBeCloseTo(110.5, 1);
    expect(b.outcome).toBe("target");
    expect(ev.stats.breakout.trades).toBe(1);
  });

  it("never uses later bars to decide the signal: the same bars give the same trade with or without what follows", () => {
    const all = history();
    const full = evaluateSetups(all, fmt).trades.find((t) => t.type === "breakout")!;
    const cut = evaluateSetups(all.slice(0, 62), fmt).trades.find((t) => t.type === "breakout")!;
    expect(cut.signal).toBe(full.signal);
    expect([cut.entry, cut.stop, cut.target]).toEqual([full.entry, full.stop, full.target]);
    expect(cut.outcome).toBe("open");
  });

  it("takes one trade at a time per setup type", () => {
    const ev = evaluateSetups(history(), fmt);
    for (const type of Array.from(new Set(ev.trades.map((t) => t.type)))) {
      const ts = ev.trades.filter((t) => t.type === type);
      for (let i = 1; i < ts.length; i++) expect(ts[i].signal).toBeGreaterThanOrEqual(ts[i - 1].exitIndex);
    }
  });
});

describe("evaluation rules", () => {
  it("fills gaps from the defaults and keeps values in range", () => {
    expect(sanitizeEvalConfig(null)).toEqual(DEFAULT_EVAL_CONFIG);
    expect(sanitizeEvalConfig({ targetR: 99, maxBars: 0, fallbackStopRanges: "x" })).toEqual({ targetR: 10, maxBars: 1, fallbackStopRanges: 2 });
    expect(sanitizeEvalConfig({ targetR: 1.3 }).targetR).toBe(1.5);
  });
});
