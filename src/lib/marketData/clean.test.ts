import { describe, expect, it } from "vitest";
import { cleanCandles, toChartData } from "./clean";
import { Candle } from "./types";

const at = (iso: string) => Date.parse(iso) / 1000;
const bar = (time: number, close: number, volume: number | null = 100): Candle => ({
  time, open: close, high: close * 1.1, low: close * 0.9, close, volume,
});

describe("cleanCandles", () => {
  it("sorts bars that arrive out of order", () => {
    const out = cleanCandles([bar(300, 3), bar(100, 1), bar(200, 2)]);
    expect(out.map((c) => c.time)).toEqual([100, 200, 300]);
  });

  it("keeps the later bar when a time repeats", () => {
    const out = cleanCandles([bar(100, 1), bar(200, 2), bar(200, 2.5)]);
    expect(out.map((c) => c.close)).toEqual([1, 2.5]);
  });

  it("drops bars with missing, non-numeric or non-positive prices", () => {
    const broken = [
      { ...bar(200, 2), open: null as unknown as number },
      { ...bar(300, 3), close: NaN },
      { ...bar(400, 4), low: 0 },
      { ...bar(500, 5), high: Infinity },
      { ...bar(NaN, 6) },
    ];
    expect(cleanCandles([bar(100, 1), ...broken, bar(600, 7)]).map((c) => c.time)).toEqual([100, 600]);
  });

  it("widens high and low to contain the open and close", () => {
    const [c] = cleanCandles([{ time: 1, open: 10.2, high: 10.1, low: 9.5, close: 9.8, volume: 5 }]);
    expect(c).toMatchObject({ high: 10.2, low: 9.5 });
    const [swapped] = cleanCandles([{ time: 1, open: 10, high: 9, low: 11, close: 10, volume: 5 }]);
    expect(swapped).toMatchObject({ high: 11, low: 9 });
  });

  it("treats missing or negative volume as unknown, not zero", () => {
    const out = cleanCandles([bar(1, 1, null), bar(2, 1, -5), bar(3, 1, NaN), bar(4, 1, 0)]);
    expect(out.map((c) => c.volume)).toEqual([null, null, null, 0]);
  });

  it("returns an empty list for empty input", () => {
    expect(cleanCandles([])).toEqual([]);
  });
});

describe("toChartData", () => {
  it("leaves daily bars on their calendar date", () => {
    const d = toChartData([bar(at("2026-11-19T00:00:00Z"), 1)], false, "America/New_York");
    expect(d).toMatchObject({ times: [at("2026-11-19T00:00:00Z")], clock: "exchange" });
  });

  it("shows intraday bars on the exchange's clock", () => {
    const d = toChartData([bar(at("2026-11-19T14:30:00Z"), 1), bar(at("2026-11-19T15:30:00Z"), 1)], true, "America/New_York");
    expect(d.times).toEqual([at("2026-11-19T09:30:00Z"), at("2026-11-19T10:30:00Z")]);
    expect(d.clock).toBe("exchange");
  });

  it("cleans its input, so unsorted or broken bars can't reach the chart", () => {
    const d = toChartData([bar(300, 3), bar(100, 1), { ...bar(200, 2), close: NaN }], false, "UTC");
    expect(d.candles.map((c) => c.time)).toEqual([100, 300]);
    expect(d.times).toEqual([100, 300]);
  });

  it("falls back to UTC when clocks going back would repeat a local hour", () => {
    // 1:30 am EDT and 1:30 am EST on Nov 1, 2026 read the same on a New York clock
    const bars = [bar(at("2026-11-01T05:30:00Z"), 1), bar(at("2026-11-01T06:30:00Z"), 1)];
    const d = toChartData(bars, true, "America/New_York");
    expect(d.clock).toBe("UTC");
    expect(d.times).toEqual(bars.map((b) => b.time));
  });
});
