import { describe, expect, it } from "vitest";
import { normaliseYahoo, YahooChartResult } from "./yahooCandles";

const at = (iso: string) => Date.parse(iso) / 1000;

/** Builds a Yahoo chart result from rows of [time, open, high, low, close, volume] */
function yahoo(tz: string, rows: [string, number | null, number | null, number | null, number | null, number | null][]): YahooChartResult {
  return {
    meta: { exchangeTimezoneName: tz },
    timestamp: rows.map((r) => at(r[0])),
    indicators: {
      quote: [{
        open: rows.map((r) => r[1]),
        high: rows.map((r) => r[2]),
        low: rows.map((r) => r[3]),
        close: rows.map((r) => r[4]),
        volume: rows.map((r) => r[5]),
      }],
    },
  };
}

describe("normaliseYahoo", () => {
  it("folds the live off-grid tick into the bar it belongs to", () => {
    const res = yahoo("Asia/Singapore", [
      ["2026-11-20T07:00:00Z", 66.3, 66.4, 66.1, 66.16, 858990],
      ["2026-11-20T08:00:00Z", 66.16, 66.2, 66.1, 66.13, 34660],
      ["2026-11-20T08:02:28Z", 66.14, 66.14, 66.14, 66.14, 0],
    ]);
    const out = normaliseYahoo(res, false, 3600);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ time: at("2026-11-20T08:00:00Z"), close: 66.14, high: 66.2, volume: 34660 });
  });

  it("folds the zero-volume closing tick even when it sits on the bar grid", () => {
    const res = yahoo("America/New_York", [
      ["2026-11-19T20:45:00Z", 348.85, 349.2, 348.8, 349.11, 3272992],
      ["2026-11-19T21:00:00Z", 349.21, 349.21, 349.21, 349.21, 0],
    ]);
    const out = normaliseYahoo(res, false, 900);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ close: 349.21, high: 349.21, volume: 3272992 });
  });

  it("sorts bars before folding, so an out-of-order response still folds the right tick", () => {
    const res = yahoo("America/New_York", [
      ["2026-11-19T21:00:00Z", 349.21, 349.21, 349.21, 349.21, 0],
      ["2026-11-19T20:30:00Z", 349.09, 349.64, 347.93, 349.11, 4280545],
      ["2026-11-19T19:30:00Z", 350.03, 350.2, 349.0, 349.14, 2733210],
    ]);
    const out = normaliseYahoo(res, false, 3600);
    expect(out.map((c) => c.time)).toEqual([at("2026-11-19T19:30:00Z"), at("2026-11-19T20:30:00Z")]);
    expect(out[1].close).toBe(349.21);
  });

  it("keeps a quiet mid-session bar with no trades", () => {
    const res = yahoo("Asia/Singapore", [
      ["2026-11-20T02:00:00Z", 1.2, 1.21, 1.19, 1.2, 5000],
      ["2026-11-20T02:05:00Z", 1.2, 1.2, 1.2, 1.2, 0],
      ["2026-11-20T02:10:00Z", 1.2, 1.22, 1.2, 1.21, 8000],
    ]);
    expect(normaliseYahoo(res, false, 300)).toHaveLength(3);
  });

  it("drops bars with a missing price instead of inventing one", () => {
    const res = yahoo("America/New_York", [
      ["2026-11-18T14:30:00Z", 10, 11, 9, 10.5, 100],
      ["2026-11-19T14:30:00Z", null, null, null, null, null],
      ["2026-11-20T14:30:00Z", 10.5, 12, 10, 11, null],
    ]);
    const out = normaliseYahoo(res, true, 86400);
    expect(out.map((c) => c.time)).toEqual([at("2026-11-18T00:00:00Z"), at("2026-11-20T00:00:00Z")]);
    expect(out[1].volume).toBeNull();
  });

  it("keys daily bars to the exchange date and keeps the newer of two bars on the same date", () => {
    const res = yahoo("America/New_York", [
      ["2026-11-19T14:30:00Z", 352.9, 353, 348, 349, 40000000],
      ["2026-11-19T20:59:00Z", 352.9, 353.5, 348, 349.21, 40795500],
    ]);
    const out = normaliseYahoo(res, true, 86400);
    expect(out).toEqual([{ time: at("2026-11-19T00:00:00Z"), open: 352.9, high: 353.5, low: 348, close: 349.21, volume: 40795500 }]);
  });
});
