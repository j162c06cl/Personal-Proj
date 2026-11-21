// Every API route rejects malformed or oversized input with a 400, before asking any provider.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MAX_NAME_LENGTH, MAX_QUOTE_TICKERS, MAX_SEARCH_LENGTH } from "@/lib/apiLimits";
import { GET as candles } from "./candles/route";
import { GET as chart } from "./chart/route";
import { GET as financials } from "./financials/route";
import { GET as fundamentals } from "./fundamentals/route";
import { GET as historical } from "./historical/route";
import { GET as news } from "./news/route";
import { GET as quote } from "./quote/route";
import { GET as screener } from "./screener/route";
import { GET as search } from "./search/route";

const req = (path: string) => new NextRequest(`http://localhost${path}`);
const fetchSpy = vi.fn(async () => { throw new Error("no network in tests"); });

beforeEach(() => { fetchSpy.mockClear(); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => vi.unstubAllGlobals());

async function expect400(res: Response) {
  expect(res.status).toBe(400);
  expect((await res.json()).error).toEqual(expect.any(String));
  expect(fetchSpy).not.toHaveBeenCalled();
}

describe("routes that take one ticker", () => {
  const routes = { candles, chart, financials, fundamentals, historical, news };
  const extra: Record<string, string> = { candles: "&timeframe=1d", historical: "&from=2024-01-02" };

  for (const [name, GET] of Object.entries(routes)) {
    it(`${name}: rejects a missing or malformed ticker`, async () => {
      for (const t of ["", "AAPL%26crumb%3Dx", "AA%20PL", "A".repeat(21)]) {
        await expect400(await GET(req(`/api/${name}?ticker=${t}${extra[name] ?? ""}`)));
      }
    });
  }

  it("news: rejects an overlong company name", async () => {
    await expect400(await news(req(`/api/news?ticker=AAPL&name=${"a".repeat(MAX_NAME_LENGTH + 1)}`)));
  });
});

describe("quote", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`).join(",");

  it("rejects a missing list and one over the batch limit", async () => {
    await expect400(await quote(req("/api/quote")));
    await expect400(await quote(req(`/api/quote?ticker=${list(MAX_QUOTE_TICKERS + 1)}`)));
  });

  it("answers a malformed ticker 'Not found' without asking a provider", async () => {
    const res = await quote(req("/api/quote?ticker=BAD%26X"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ticker: "BAD&X", price: null, error: "Not found" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("search and screener", () => {
  it("search: rejects overlong text", async () => {
    await expect400(await search(req(`/api/search?q=${"a".repeat(MAX_SEARCH_LENGTH + 1)}`)));
  });

  it("screener: rejects an unknown market", async () => {
    await expect400(await screener(req("/api/screener?market=XX")));
  });
});
