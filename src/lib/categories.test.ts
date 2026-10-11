import { describe, expect, it } from "vitest";
import { categoryFrom, knownCategory } from "./categories";

describe("categoryFrom", () => {
  it("files funds under ETFs whatever their sector", () => {
    expect(categoryFrom({ quoteType: "ETF", sector: "Technology" })).toBe("ETFs");
    expect(categoryFrom({ quoteType: "MUTUALFUND", sector: null })).toBe("ETFs");
  });

  it("maps Yahoo sector names to the app's names", () => {
    expect(categoryFrom({ quoteType: "EQUITY", sector: "Financial Services" })).toBe("Financials");
    expect(categoryFrom({ quoteType: "EQUITY", sector: "Energy" })).toBe("Energy");
  });

  it("uses Other for an equity without a sector, and null when nothing is known", () => {
    expect(categoryFrom({ quoteType: "EQUITY", sector: null })).toBe("Other");
    expect(categoryFrom({})).toBeNull();
  });
});

describe("knownCategory", () => {
  it("knows common tickers without a lookup", () => {
    expect(knownCategory("VOO")).toBe("ETFs");
    expect(knownCategory("XOM")).toBe("Energy");
    expect(knownCategory("ZZZZ")).toBeNull();
  });
});
