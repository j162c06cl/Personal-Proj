import { describe, expect, it } from "vitest";
import { Candle } from "./types";
import { SetupCheck, buildContext } from "./setups";
import { TradeRecord, TradeRules, simulateTrade } from "./evaluation";

const RULES: TradeRules = { targetR: 2, maxBars: 20, fallbackStopRanges: 2, slippagePct: 0 };

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

function run(after: Candle[], stop: number | null, config: Partial<TradeRules> = {}) {
  const bars = [...flat(20), ...after.map((c, j) => ({ ...c, time: (20 + j) * 86_400 }))];
  return simulateTrade(buildContext(bars, fmt), signalAt(19, stop), { ...RULES, ...config });
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
    expect(simulateTrade(buildContext(flat(20), fmt), signalAt(19, 98), RULES)).toBe("noEntry");
    expect(run([k(0, 97.5, 98, 97, 97.5)], 98)).toBe("belowStop");
  });

  it("places a stop in average ranges below the entry for setups without an invalidation price", () => {
    const t = trade(run([k(0, 100, 100.5, 99.5, 100)], null, { fallbackStopRanges: 2 }));
    expect(t.stopBasis).toBe("ranges");
    expect(t.stop).toBeCloseTo(98); // average range of the flat bars is 1
  });
});

describe("costs and limits on a single trade", () => {
  it("fills the entry above and the exit below the trigger price by the slippage", () => {
    const t = trade(run([k(0, 100, 101, 99, 100.5), k(0, 100.5, 104.5, 100, 104), k(0, 104, 106, 103.5, 105.8)], 98, { slippagePct: 0.5 }));
    expect(t.entryPrice).toBe(100);
    expect(t.entry).toBeCloseTo(100.5);
    expect(t.risk).toBeCloseTo(2.5);
    expect(t.target).toBeCloseTo(105.5); // 2R from the filled entry
    expect([t.outcome, t.exitIndex]).toEqual(["target", 22]);
    expect(t.exit).toBeCloseTo(105.5 * 0.995);
    expect(t.r).toBeCloseTo((105.5 * 0.995 - 100.5) / 2.5);
  });

  it("sells a stop below the stop price", () => {
    const t = trade(run([k(0, 100, 100.5, 97, 97.5)], 98, { slippagePct: 1 }));
    expect([t.outcome, t.exitPrice]).toEqual(["stop", 98]);
    expect(t.exit).toBeCloseTo(97.02);
  });

  it("never looks past the last bar it's given", () => {
    const t = trade(simulateTrade(buildContext([...flat(20), k(20, 100, 100.5, 99.5, 100), k(21, 100, 110, 99, 109)].map((c, i) => ({ ...c, time: i * 86_400 })), fmt), signalAt(19, 98), RULES, 20));
    expect([t.outcome, t.exitIndex]).toEqual(["open", 20]);
  });
});
