import { describe, expect, it } from "vitest";
import { SWING_PRESETS, Signals, contextReasons, evaluate, normaliseSector } from "./rules";

const preset = (id: string) => SWING_PRESETS.find((p) => p.id === id)!;
const passes = (s: Signals) => SWING_PRESETS.filter((p) => evaluate(p, s).pass).map((p) => p.id);

// A liquid, large-cap stock; each test overrides the fields it cares about
const base: Signals = {
  ticker: "X",
  price: 100,
  changePercent: 0,
  volume: 1_000_000,
  avgVolume: 1_000_000,
  sma50: 100,
  sma200: 100,
  high52: 150,
  low52: 50,
  marketCap: 50e9,
};

describe("swing presets", () => {
  it("Momentum: uptrend, up today, above-average volume", () => {
    const s = { ...base, price: 110, sma50: 100, sma200: 90, changePercent: 3.2, volume: 1_800_000 };
    const r = evaluate(preset("momentum"), s);
    expect(r.pass).toBe(true);
    expect(r.reasons.map((x) => x.text)).toEqual([
      "Uptrend: price 10.0% above its 50-day average, which is above the 200-day",
      "Up 3.2% today",
      "Volume 1.8× average",
    ]);
  });

  it("Breakout: near the 52-week high on heavy volume", () => {
    const s = { ...base, price: 129, sma50: 115, sma200: 100, high52: 130, changePercent: 2.4, volume: 2_000_000 };
    expect(passes(s)).toContain("breakout");
    expect(evaluate(preset("breakout"), s).reasons[0].text).toBe("Within 0.8% of its 52-week high");
  });

  it("Breakout: says 'new 52-week high' when at the high", () => {
    const s = { ...base, price: 130, sma50: 115, sma200: 100, high52: 130, changePercent: 2, volume: 2_000_000 };
    expect(evaluate(preset("breakout"), s).reasons[0].text).toBe("At a new 52-week high");
  });

  it("Breakout: rejects a stock near its high that fell today", () => {
    // Real case: HAE was 2% off its high on 1.5× volume but down 0.65% that session
    const s = { ...base, price: 118.69, sma50: 101.6, sma200: 75.8, high52: 121.19, changePercent: -0.65, volume: 1_225_339, avgVolume: 806_120 };
    expect(evaluate(preset("breakout"), s).pass).toBe(false);
  });

  it("Pullback: uptrend that has dipped to its 50-day average", () => {
    const s = { ...base, price: 101, sma50: 102, sma200: 90, high52: 112, changePercent: -0.5 };
    expect(passes(s)).toEqual(["pullback"]);
    expect(evaluate(preset("pullback"), s).reasons.map((x) => x.text)).toEqual([
      "Longer-term uptrend: 50-day average above the 200-day",
      "Pulled back 9.8% from its 52-week high",
      "Trading 1.0% below its 50-day average, a common support level",
    ]);
  });

  it("Pullback: rejects a stock in free fall today", () => {
    const s = { ...base, price: 101, sma50: 102, sma200: 90, high52: 112, changePercent: -6 };
    expect(evaluate(preset("pullback"), s).pass).toBe(false);
  });

  it("rejects small caps and penny stocks for every setup", () => {
    const strong = { ...base, price: 110, sma50: 100, sma200: 90, high52: 112, changePercent: 3, volume: 3_000_000 };
    expect(passes({ ...strong, marketCap: 500e6 })).toEqual([]);
    expect(passes({ ...strong, price: 4, sma50: 3.6, sma200: 3.2, high52: 4.1 })).toEqual([]);
  });

  it("never passes on missing data", () => {
    const s = { ...base, price: 110, sma50: null, sma200: null, high52: null, low52: null, changePercent: 3, volume: 3_000_000 };
    expect(passes(s)).toEqual([]);
  });

  it("returns no reasons when a stock fails", () => {
    expect(evaluate(preset("momentum"), base)).toEqual({ pass: false, reasons: [] });
  });
});

describe("portfolio context", () => {
  const holdings = [
    { ticker: "NVDA", sector: "Technology", industry: "Semiconductors", value: 4400 },
    { ticker: "KO", sector: "Consumer Defensive", industry: "Beverages - Non-Alcoholic", value: 5600 },
  ];
  const ctx = (over: Partial<Parameters<typeof contextReasons>[0]>) =>
    contextReasons({ ticker: "AMD", sector: "Technology", industry: "Semiconductors", holdings, positions: [], watchlist: [], watchedSectors: [], ...over });

  it("flags concentration in an industry you already hold", () => {
    const [r] = ctx({});
    expect(r.text).toBe("Adds to your semiconductors exposure (44% of portfolio: NVDA)");
    expect(r.tone).toBe("warn");
  });

  it("falls back to sector when the industry differs", () => {
    const [r] = ctx({ industry: "Software" });
    expect(r.text).toBe("Adds to your Technology exposure (44% of portfolio)");
  });

  it("matches Yahoo sector names to the app's sector names", () => {
    expect(normaliseSector("Consumer Defensive")).toBe("Consumer Staples");
    const [r] = ctx({ ticker: "PEP", sector: "Consumer Staples", industry: "Snacks" });
    expect(r.text).toBe("Adds to your Consumer Staples exposure (56% of portfolio)");
  });

  it("notes when a stock diversifies the portfolio", () => {
    const [r] = ctx({ ticker: "XOM", sector: "Energy", industry: "Oil & Gas" });
    expect(r).toMatchObject({ text: "Diversifies: you hold nothing in Energy yet", tone: "good" });
  });

  it("mentions an existing position and watchlist entry", () => {
    const texts = ctx({
      positions: [{ id: "1", ticker: "AMD", name: "AMD", sector: "Technology", purchasePrice: 100, purchaseDate: "2024-01-02", quantity: 5 }],
      watchlist: [{ ticker: "AMD", intent: "swing", note: "", status: "not-started", addedAt: "" }],
    }).map((r) => r.text);
    expect(texts).toContain("You already own 5 shares");
    expect(texts).toContain("On your watchlist (Swing)");
    // Exposure isn't repeated for something you already own
    expect(texts.some((t) => t.startsWith("Adds to"))).toBe(false);
  });

  it("highlights sectors from the investor profile", () => {
    expect(ctx({ watchedSectors: ["Technology"] }).map((r) => r.text)).toContain("In a sector you watch (Technology)");
  });
});
