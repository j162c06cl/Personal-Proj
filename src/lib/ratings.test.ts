import { describe, expect, it } from "vitest";
import {
  overallCall, pegRatio, rateDebtToEquity, rateMACD, ratePE, ratePEvsHistory, ratePriceVsAverage, rateRSI, signalOf, Signal,
} from "./ratings";

const s = (good: number, neutral: number, bad: number): Signal => signalOf([
  ...Array(good).fill({ rating: "good", note: "" }),
  ...Array(neutral).fill({ rating: "neutral", note: "" }),
  ...Array(bad).fill({ rating: "bad", note: "" }),
]);

describe("single ratings", () => {
  it("rates P/E by band, losses as bad, missing as unrated", () => {
    expect(ratePE(12)?.rating).toBe("good");
    expect(ratePE(22)?.rating).toBe("neutral");
    expect(ratePE(40)?.rating).toBe("bad");
    expect(ratePE(-5)?.rating).toBe("bad");
    expect(ratePE(null)).toBeNull();
  });

  it("only computes PEG for growing earnings", () => {
    expect(pegRatio(30, 0.3)).toBeCloseTo(1);
    expect(pegRatio(30, -0.1)).toBeNull();
    expect(pegRatio(null, 0.2)).toBeNull();
  });

  it("treats price within 1% of an average as neutral", () => {
    expect(ratePriceVsAverage(100.5, 100)?.rating).toBe("neutral");
    expect(ratePriceVsAverage(105, 100)?.rating).toBe("good");
    expect(ratePriceVsAverage(95, 100)?.rating).toBe("bad");
  });

  it("flags overbought RSI as bad and oversold as neutral", () => {
    expect(rateRSI(75)?.rating).toBe("bad");
    expect(rateRSI(60)?.rating).toBe("good");
    expect(rateRSI(25)?.rating).toBe("neutral");
  });

  it("prefers a recent MACD cross over the plain line position", () => {
    expect(rateMACD(-1, 1, { dir: "bullish", barsAgo: 2 })?.rating).toBe("good");
    expect(rateMACD(-1, 1, { dir: "bullish", barsAgo: 9 })?.rating).toBe("bad");
  });

  it("compares P/E with its own history", () => {
    expect(ratePEvsHistory(20, 30)?.rating).toBe("good");
    expect(ratePEvsHistory(31, 30)?.rating).toBe("neutral");
    expect(ratePEvsHistory(40, 30)?.rating).toBe("bad");
  });

  it("calls negative equity bad", () => {
    expect(rateDebtToEquity(-0.5)?.rating).toBe("bad");
    expect(rateDebtToEquity(0.4)?.rating).toBe("good");
  });
});

describe("roll-up", () => {
  it("scores a section as (good − bad) ÷ rated and ignores unrated", () => {
    const sig = signalOf([{ rating: "good", note: "" }, { rating: "bad", note: "" }, { rating: "good", note: "" }, null]);
    expect(sig).toEqual({ good: 2, neutral: 0, bad: 1, score: 1 / 3 });
  });

  it("needs enough rated numbers before making a call", () => {
    expect(overallCall({ financials: s(2, 0, 0), valuation: s(0, 0, 0), technical: s(1, 0, 0), risks: s(0, 0, 0) }, "long-term")).toBeNull();
  });

  it("weights the business for long-term and the chart for swing", () => {
    const signals = { financials: s(6, 0, 0), valuation: s(4, 0, 0), technical: s(0, 0, 6), risks: s(1, 2, 1) };
    expect(overallCall(signals, "long-term")?.call).toBe("Buy");
    expect(overallCall(signals, "swing")?.call).toBe("Sell");
  });

  it("holds when the numbers are mixed", () => {
    const signals = { financials: s(3, 1, 2), valuation: s(1, 2, 2), technical: s(2, 2, 2), risks: s(2, 1, 1) };
    expect(overallCall(signals, "long-term")?.call).toBe("Hold");
  });
});
