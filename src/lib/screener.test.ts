import { describe, expect, it } from "vitest";
import { FILTERS, daysUntil, filtersFor, keepFor } from "./screenerFilters";
import { LONG_TERM_PRESETS, SWING_PRESETS, Signals, evaluate } from "./rules";
import { periodReturns } from "./indicators";
import { backupLists, defsToWatchlists, flattenLists, normaliseItem } from "./store";
import type { ScreenerRow, WatchlistItem } from "./types";

const row = (over: Partial<ScreenerRow> = {}): ScreenerRow => ({
  ticker: "X", name: "X", quoteType: "EQUITY", exchange: "NasdaqGS", currency: "USD",
  price: 100, changePercent: 1, change52w: 25, volume: 2e6, avgVolume: 1e6, relVolume: 2,
  marketCap: 50e9, pe: 15, forwardPE: 13, priceToBook: 2, divYield: 0.035,
  sma50: 95, sma200: 85, high52: 110, low52: 70, earningsDate: null, ...over,
});
const filter = (key: string) => FILTERS.find((f) => f.key === key)!;

describe("screener filters", () => {
  it("shows each strategy only its own filters", () => {
    const swing = filtersFor("swing").map((f) => f.key);
    const long = filtersFor("long-term").map((f) => f.key);
    expect(swing).toEqual(expect.arrayContaining(["rsi", "earnings", "relVolume", "trend50", "trend200", "marketCap"]));
    expect(swing).not.toContain("pe");
    expect(long).toEqual(expect.arrayContaining(["pe", "roe", "debtToEquity", "trend200"]));
    expect(long).not.toContain("rsi");
  });

  it("drops the other strategy's filters when switching", () => {
    expect(keepFor("long-term", { rsi: "lt30", pe: "10-20", marketCap: "large" })).toEqual({ pe: "10-20", marketCap: "large" });
  });

  it("tests price against the 50- and 200-day averages", () => {
    expect(filter("trend50").test(row(), {}, "above")).toBe(true);
    expect(filter("trend200").test(row({ price: 80 }), {}, "below")).toBe(true);
    expect(filter("trend200").test(row({ sma200: null }), {}, "above")).toBe(false);
  });

  it("filters on RSI and earnings dates", () => {
    expect(filter("rsi").test(row(), { rsi14: 25 }, "lt30")).toBe(true);
    expect(filter("rsi").test(row(), {}, "lt30")).toBe(false); // missing data never passes
    const soon = new Date(); soon.setDate(soon.getDate() + 5);
    const r = row({ earningsDate: soon.toLocaleDateString("en-CA") });
    expect(filter("earnings").test(r, {}, "within14")).toBe(true);
    expect(filter("earnings").test(r, {}, "clear14")).toBe(false);
    expect(filter("earnings").test(row(), {}, "clear14")).toBe(true);
  });

  it("describes matches with the stock's actual values", () => {
    expect(filter("pe").describe(row(), {}, "10-20")).toBe("P/E 15.0");
    expect(filter("avgVolume").describe(row(), {}, "1e6")).toBe("Trades 1.0M shares a day on average");
    expect(filter("roe").describe(row(), { roe: 0.183 }, "0.15")).toBe("Return on equity 18.3%");
  });

  it("counts days to a calendar date", () => {
    expect(daysUntil("2026-10-20", new Date("2026-10-17T15:00:00"))).toBe(3);
    expect(daysUntil(null)).toBeNull();
  });
});

describe("long-term setups", () => {
  const signals = (over: Partial<Signals> = {}): Signals => ({ ...row(), roe: 0.2, revenueGrowth: 0.08, profitMargin: 0.15, payoutRatio: 0.5, ...over });
  const preset = (id: string) => LONG_TERM_PRESETS.find((p) => p.id === id)!;

  it("Quality growth explains each rule it passed", () => {
    const r = evaluate(preset("quality"), signals());
    expect(r.pass).toBe(true);
    expect(r.reasons.map((x) => x.text)).toEqual([
      "Return on equity 20.0% (15%+ is strong)",
      "Revenue up 8.0% year over year",
      "Net margin 15.0%",
      "Long-term trend intact: price 17.6% above its 200-day average",
    ]);
  });

  it("Quality growth fails without fundamentals rather than guessing", () => {
    expect(evaluate(preset("quality"), signals({ roe: null })).pass).toBe(false);
  });

  it("Dividend income requires a covered payout", () => {
    expect(evaluate(preset("dividend"), signals()).pass).toBe(true);
    expect(evaluate(preset("dividend"), signals({ payoutRatio: 1.2 })).pass).toBe(false);
  });

  it("allows lower share prices outside the US", () => {
    const sg = { ...row({ currency: "SGD", price: 4.2, sma50: 4.1, sma200: 3.8, high52: 4.3, changePercent: 2, relVolume: 2 }), volume: 3e6, avgVolume: 1e6 };
    expect(SWING_PRESETS.some((p) => evaluate(p, sg).pass)).toBe(true);
    expect(SWING_PRESETS.some((p) => evaluate(p, { ...sg, currency: "USD" }).pass)).toBe(false);
  });
});

describe("period returns", () => {
  it("measures from the last close on or before each lookback date", () => {
    const pts = [
      { t: "2025-10-16", c: 50 }, { t: "2025-12-31", c: 60 }, { t: "2026-07-16", c: 70 },
      { t: "2026-09-16", c: 80 }, { t: "2026-10-16", c: 100 },
    ].map((p) => ({ ...p, o: null, h: null, l: null, v: null }));
    const r = periodReturns(pts);
    expect(r.m1).toBe(25);
    expect(r.ytd).toBeCloseTo(66.67, 1);
    expect(r.y1).toBe(100);
  });

  it("is null without enough history", () => {
    const pts = [{ t: "2026-10-01", c: 90 }, { t: "2026-10-16", c: 100 }].map((p) => ({ ...p, o: null, h: null, l: null, v: null }));
    expect(periodReturns(pts).y1).toBeNull();
  });
});

describe("watchlist storage", () => {
  it("turns the old research status into a tag", () => {
    const old = { ticker: "A", intent: "swing", note: "", status: "researching", addedAt: "" } as unknown as WatchlistItem;
    const n = normaliseItem(old);
    expect(n.tag).toBe("researching");
    expect("status" in n).toBe(false);
    expect(normaliseItem({ ...old, status: "done" }).tag).toBe("watching");
  });

  it("restores named lists from v2 data, with intents guessed from the list name", () => {
    const lists = defsToWatchlists([{ id: "a", name: "Swing ideas", tickers: ["AMD", "AMD", "NVDA"] }, { id: "b", name: "Dividend", tickers: ["KO"] }]);
    expect(lists.map((l) => l.name)).toEqual(["Swing ideas", "Dividend"]);
    expect(lists[0].items.map((i) => i.ticker)).toEqual(["AMD", "NVDA"]);
    expect(lists[0].items[0].intent).toBe("swing");
    expect(lists[1].items[0].intent).toBe("long-term");
  });

  it("reads every backup version", () => {
    const item = { ticker: "KO", intent: "long-term", tag: "watching", note: "", addedAt: "" } as WatchlistItem;
    const v3 = backupLists({ app: "investor-research", version: 3, watchlists: [{ id: "x", name: "Core", createdAt: "", items: [item] }] });
    const v2 = backupLists({ app: "investor-research", version: 2, watchlist: [item] });
    const v1 = backupLists({ app: "investor-research", version: 1, watchlists: [{ id: "y", name: "ETF", tickers: ["VOO"] }] });
    expect(v3?.[0].name).toBe("Core");
    expect(v2?.[0].items[0].ticker).toBe("KO");
    expect(v1?.[0].items[0].ticker).toBe("VOO");
  });

  it("flattens lists with each stock once", () => {
    const a = { ticker: "A", intent: "swing", tag: "watching", note: "first", addedAt: "" } as WatchlistItem;
    const lists = [{ id: "1", name: "1", createdAt: "", items: [a] }, { id: "2", name: "2", createdAt: "", items: [{ ...a, note: "second" }] }];
    expect(flattenLists(lists)).toEqual([a]);
  });
});
