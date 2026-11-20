import { describe, expect, it } from "vitest";
import { IndicatorId, averageVolume, computeIndicators, relativeVolume, sessionVwap } from "./indicators";
import { Candle } from "./types";

const at = (iso: string) => Date.parse(iso) / 1000;
const bar = (time: number, h: number, l: number, c: number, volume: number | null): Candle => ({ time, open: c, high: h, low: l, close: c, volume });
const NY = "America/New_York";
const on = (...ids: IndicatorId[]) => new Set(ids);

describe("sessionVwap", () => {
  it("weights each bar's typical price by volume and restarts each session", () => {
    const out = sessionVwap([
      bar(at("2026-11-18T14:30:00Z"), 12, 8, 10, 100),   // typical 10
      bar(at("2026-11-18T15:30:00Z"), 22, 18, 20, 300),  // typical 20
      bar(at("2026-11-19T14:30:00Z"), 33, 27, 30, 50),   // new session
    ], NY);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe((10 * 100 + 20 * 300) / 400); // 17.5
    expect(out[2]).toBe(30);
  });

  it("ignores bars with unknown or zero volume, and is empty until the session trades", () => {
    const out = sessionVwap([
      bar(at("2026-11-19T14:30:00Z"), 11, 9, 10, null),
      bar(at("2026-11-19T15:30:00Z"), 21, 19, 20, 0),
      bar(at("2026-11-19T16:30:00Z"), 31, 29, 30, 10),
      bar(at("2026-11-19T17:30:00Z"), 99, 1, 50, null),
    ], NY);
    expect(out).toEqual([null, null, 30, 30]);
  });
});

describe("averageVolume", () => {
  it("averages the last n bars including the current one", () => {
    const candles = [10, 20, 30, 40].map((v, i) => bar(i, 1, 1, 1, v));
    expect(averageVolume(candles, 3)).toEqual([null, null, 20, 30]);
  });

  it("gives no value while a bar in the window has unknown volume", () => {
    const candles = [10, null, 30, 40, 50].map((v, i) => bar(i, 1, 1, 1, v));
    expect(averageVolume(candles, 2)).toEqual([null, null, null, 35, 45]);
  });
});

describe("relativeVolume", () => {
  it("compares a daily bar with the previous 20 sessions, not including itself", () => {
    const candles = [...Array(20)].map((_, i) => bar(i * 86400, 1, 1, 1, 100)).concat(bar(20 * 86400, 1, 1, 1, 250));
    const out = relativeVolume(candles, false, NY);
    expect(out.slice(0, 20).every((v) => v === null)).toBe(true);
    expect(out[20]).toBe(2.5);
  });

  it("compares an intraday bar with the same time of day in earlier sessions", () => {
    // Opening bars trade 1000 a day and midday bars 100; a 1000-share midday bar is 10× normal
    const days = ["10", "11", "12", "13", "16", "17"];
    const candles: Candle[] = [];
    for (const d of days) {
      candles.push(bar(at(`2026-11-${d}T14:30:00Z`), 1, 1, 1, 1000));
      candles.push(bar(at(`2026-11-${d}T17:30:00Z`), 1, 1, 1, d === "17" ? 1000 : 100));
    }
    const out = relativeVolume(candles, true, NY);
    expect(out.slice(0, 10).every((v) => v === null)).toBe(true); // fewer than 5 earlier sessions
    expect(out[10]).toBe(1);  // the open on day 6 is as usual
    expect(out[11]).toBe(10); // midday on day 6 is 10× its usual
  });
});

describe("computeIndicators", () => {
  const candles = [...Array(60)].map((_, i) => bar(at("2026-09-01T14:30:00Z") + i * 86400, i + 2, i, i + 1, 1000));

  it("computes only what is switched on", () => {
    const out = computeIndicators(candles, on("sma20", "rsi"), false, NY);
    expect(Object.keys(out).sort()).toEqual(["rsi", "sma20"]);
    expect(out.sma20).toHaveLength(60);
  });

  it("skips VWAP on daily bars", () => {
    expect(computeIndicators(candles, on("vwap"), false, NY).vwap).toBeUndefined();
    expect(computeIndicators(candles, on("vwap"), true, NY).vwap).toHaveLength(60);
  });

  it("gives the MACD histogram as MACD minus signal", () => {
    const m = computeIndicators(candles, on("macd"), false, NY).macd!;
    const i = m.signal.findIndex((v) => v !== null);
    expect(i).toBeGreaterThan(0);
    expect(m.histogram[i]).toBeCloseTo(m.line[i]! - m.signal[i]!);
    expect(m.histogram[i - 1]).toBeNull();
  });
});
