import { describe, expect, it } from "vitest";
import {
  Benchmarks, DEFAULT_BENCHMARKS, normalizeBenchmarks, overallCall, pegRatio, rateDebtToEquity, rateGrowth, rateMACD, ratePE,
  ratePEvsHistory, ratePriceVsAverage, rateRSI, signalOf, Signal,
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

describe("benchmarks", () => {
  const custom = (over: Partial<Benchmarks["bands"]>): Benchmarks =>
    ({ ...DEFAULT_BENCHMARKS, bands: { ...DEFAULT_BENCHMARKS.bands, ...over } });

  it("rates against the user's lines, and says so in the note", () => {
    const loose = custom({ pe: { good: 25, bad: 50 } });
    expect(ratePE(40)?.rating).toBe("bad");
    expect(ratePE(40, loose)).toEqual({ rating: "neutral", note: "Around market levels (25–50)" });
    expect(ratePE(20, loose)?.rating).toBe("good");
  });

  it("compares fractions against percent benchmarks without float noise", () => {
    expect(rateGrowth(0.1)?.rating).toBe("good");
    expect(rateGrowth(0.29, custom({ growth: { good: 29, bad: 0 } }))?.rating).toBe("good");
  });

  it("uses the user's weights and Buy / Sell line", () => {
    const signals = { financials: s(6, 0, 0), valuation: s(4, 0, 0), technical: s(0, 0, 6), risks: s(1, 2, 1) };
    const chartOnly: Benchmarks = { ...DEFAULT_BENCHMARKS, weights: { ...DEFAULT_BENCHMARKS.weights, "long-term": { financials: 0, valuation: 0, technical: 1, risks: 0 } } };
    expect(overallCall(signals, "long-term", chartOnly)?.call).toBe("Sell");
    const mixed = { financials: s(3, 1, 2), valuation: s(1, 2, 2), technical: s(2, 2, 2), risks: s(2, 1, 1) };
    expect(overallCall(mixed, "long-term", { ...DEFAULT_BENCHMARKS, callThreshold: 0.01 })?.call).toBe("Buy");
  });

  it("fills missing values and drops invalid ones when loading", () => {
    const b = normalizeBenchmarks({
      bands: { pe: { good: 20, bad: 40 }, roe: { good: 2, bad: 10 } }, // roe's lines are the wrong way round
      weights: { swing: { financials: 0, valuation: 0, technical: 0, risks: 0 } },
      callThreshold: 5,
    });
    expect(b.bands.pe).toEqual({ good: 20, bad: 40 });
    expect(b.bands.roe).toEqual(DEFAULT_BENCHMARKS.bands.roe);
    expect(b.weights.swing).toEqual(DEFAULT_BENCHMARKS.weights.swing);
    expect(b.callThreshold).toBe(DEFAULT_BENCHMARKS.callThreshold);
    expect(normalizeBenchmarks(undefined)).toEqual(DEFAULT_BENCHMARKS);
  });
});
