import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require("yahoo-finance2").default;

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const tickers = ticker.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  const results = await Promise.all(
    tickers.map(async (t) => {
      try {
        const quote = await yahooFinance.quote(t);
        return {
          ticker: t,
          name: quote.longName || quote.shortName || t,
          price: quote.regularMarketPrice ?? null,
          marketCap: quote.marketCap ?? null,
          peRatio: quote.trailingPE ?? null,
          revenue: (quote as Record<string, unknown>).totalRevenue as number ?? null,
          netIncome: (quote as Record<string, unknown>).netIncome as number ?? null,
        };
      } catch {
        return { ticker: t, name: t, price: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: "Not found" };
      }
    })
  );

  return NextResponse.json(tickers.length === 1 ? results[0] : results);
}
