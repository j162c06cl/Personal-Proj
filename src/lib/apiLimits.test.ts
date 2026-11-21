import { describe, expect, it } from "vitest";
import { MAX_QUOTE_TICKERS, readTicker, readTickerList } from "./apiLimits";

describe("readTicker", () => {
  it("trims and upper-cases a valid ticker", () => {
    expect(readTicker(" aapl ")).toBe("AAPL");
    for (const t of ["D05.SI", "BRK-B", "^GSPC", "EURUSD=X"]) expect(readTicker(t)).toBe(t);
  });

  it("rejects missing, malformed and overlong tickers", () => {
    for (const t of [null, undefined, "", "   ", "AAPL&crumb=x", "AA PL", "AAPL,MSFT", "../x", "A".repeat(21)]) {
      expect(readTicker(t)).toBeNull();
    }
  });
});

describe("readTickerList", () => {
  it("splits, trims and upper-cases, keeping order", () => {
    expect(readTickerList("msft, aapl,,D05.SI")).toEqual({ tickers: ["MSFT", "AAPL", "D05.SI"] });
  });

  it("keeps a malformed entry for the route to report, instead of failing the batch", () => {
    expect(readTickerList("AAPL,BAD&X")).toEqual({ tickers: ["AAPL", "BAD&X"] });
  });

  it("needs at least one ticker", () => {
    for (const raw of [null, "", " , ,"]) expect(readTickerList(raw)).toHaveProperty("error");
  });

  it("takes up to the batch limit and no more", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`).join(",");
    expect(readTickerList(list(MAX_QUOTE_TICKERS))).toHaveProperty("tickers");
    expect(readTickerList(list(MAX_QUOTE_TICKERS + 1))).toEqual({ error: `At most ${MAX_QUOTE_TICKERS} tickers per request.` });
  });
});
