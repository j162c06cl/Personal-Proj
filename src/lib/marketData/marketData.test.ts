import { describe, expect, it } from "vitest";
import { aggregateCandles } from "./aggregate";
import { tradingDate, tradingDateStart, wallClockAsUtc } from "./time";
import { Candle, isTimeframe, isValidTicker } from "./types";

const at = (iso: string) => Date.parse(iso) / 1000;
const bar = (iso: string, o: number, h: number, l: number, c: number, v: number | null = 100): Candle => ({
  time: at(iso), open: o, high: h, low: l, close: c, volume: v,
});

describe("exchange time", () => {
  it("shows New York bars on New York's clock across daylight saving", () => {
    expect(wallClockAsUtc(at("2026-07-15T13:30:00Z"), "America/New_York")).toBe(at("2026-07-15T09:30:00Z")); // EDT
    expect(wallClockAsUtc(at("2026-11-19T14:30:00Z"), "America/New_York")).toBe(at("2026-11-19T09:30:00Z")); // EST
  });

  it("dates a Singapore morning bar on Singapore's date, not UTC's", () => {
    const t = at("2026-11-19T17:00:00Z"); // 1:00 am Nov 20 in Singapore
    expect(tradingDate(t, "Asia/Singapore")).toBe("2026-11-20");
    expect(tradingDateStart(t, "Asia/Singapore")).toBe(at("2026-11-20T00:00:00Z"));
  });
});

describe("aggregateCandles (1H → 4H)", () => {
  const usDay = [
    bar("2026-11-19T14:30:00Z", 10, 12, 9, 11, 100),
    bar("2026-11-19T15:30:00Z", 11, 13, 10, 12, 100),
    bar("2026-11-19T16:30:00Z", 12, 14, 11, 13, 100),
    bar("2026-11-19T17:30:00Z", 13, 15, 8, 14, 100),
    bar("2026-11-19T18:30:00Z", 14, 16, 13, 15, 50),
    bar("2026-11-19T19:30:00Z", 15, 20, 14, 16, 50),
    bar("2026-11-19T20:30:00Z", 16, 17, 15, 15.5, null),
  ];

  it("splits a US session into 9:30–13:30 and a shorter 13:30–16:00 bar", () => {
    const out = aggregateCandles(usDay, 4 * 3600, "America/New_York");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: at("2026-11-19T14:30:00Z"), open: 10, high: 15, low: 8, close: 14, volume: 400 });
    expect(out[1]).toEqual({ time: at("2026-11-19T18:30:00Z"), open: 14, high: 20, low: 13, close: 15.5, volume: 100 });
  });

  it("never joins bars from different trading days", () => {
    const next = bar("2026-11-20T14:30:00Z", 20, 21, 19, 20.5);
    const out = aggregateCandles([...usDay.slice(5), next], 4 * 3600, "America/New_York");
    expect(out.map((c) => c.time)).toEqual([at("2026-11-19T19:30:00Z"), at("2026-11-20T14:30:00Z")]);
  });

  it("splits a Singapore session at 9:00 and 13:00, even with an hour missing", () => {
    const hours = ["01", "02", "04", "05", "06", "07", "08"].map((h) => bar(`2026-11-20T${h}:00:00Z`, 1, 2, 0.5, 1.5));
    const out = aggregateCandles(hours, 4 * 3600, "Asia/Singapore");
    expect(out.map((c) => c.time)).toEqual([at("2026-11-20T01:00:00Z"), at("2026-11-20T05:00:00Z")]);
  });
});

describe("request validation", () => {
  it("accepts US, Singapore, class-share and index tickers", () => {
    for (const t of ["AAPL", "D05.SI", "BRK-B", "^GSPC", "EURUSD=X"]) expect(isValidTicker(t)).toBe(true);
  });

  it("rejects empty, lowercase and path-like input", () => {
    for (const t of ["", "aapl", "../etc", "A B", "X".repeat(21)]) expect(isValidTicker(t)).toBe(false);
  });

  it("knows the supported timeframes", () => {
    expect(isTimeframe("4h")).toBe(true);
    expect(isTimeframe("1w")).toBe(false);
    expect(isTimeframe(null)).toBe(false);
  });
});
