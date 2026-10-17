import { NextRequest, NextResponse } from "next/server";
import { UA, getYahooAuth, resetYahooAuth } from "@/lib/server/yahoo";
import { MARKETS } from "@/lib/markets";
import { universeFor } from "@/lib/screenerUniverse";
import type { Market, ScreenerRow } from "@/lib/types";

// Candidate stocks for the screener, one market at a time. Every filter runs in the browser
// so it can explain each match; this route only gathers the raw quote data.
//
// For the US it asks Yahoo's screener for the largest listed stocks (wide coverage). When
// that returns nothing, which happens, and for Singapore, it quotes a curated universe.


type Q = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toRow(q: Q): ScreenerRow {
  const vol = n(q.regularMarketVolume);
  const avg = n(q.averageDailyVolume3Month) ?? n(q.averageDailyVolume10Day);
  const earn = n(q.earningsTimestampStart) ?? n(q.earningsTimestamp);
  const tz = typeof q.exchangeTimezoneName === "string" ? q.exchangeTimezoneName : "America/New_York";
  // Yahoo reports trailing yield as a fraction and forward "dividendYield" as a percent
  const fwdYield = n(q.dividendYield);
  return {
    ticker: String(q.symbol ?? "").toUpperCase(),
    name: String(q.shortName ?? q.longName ?? q.symbol ?? ""),
    quoteType: String(q.quoteType ?? "EQUITY"),
    exchange: (q.fullExchangeName ?? q.exchange ?? null) as string | null,
    currency: (q.currency ?? null) as string | null,
    price: n(q.regularMarketPrice),
    changePercent: n(q.regularMarketChangePercent),
    change52w: n(q.fiftyTwoWeekChangePercent),
    volume: vol,
    avgVolume: avg,
    relVolume: vol && avg ? vol / avg : null,
    marketCap: n(q.marketCap),
    pe: n(q.trailingPE),
    forwardPE: n(q.forwardPE),
    priceToBook: n(q.priceToBook),
    divYield: fwdYield !== null ? fwdYield / 100 : n(q.trailingAnnualDividendYield),
    sma50: n(q.fiftyDayAverage),
    sma200: n(q.twoHundredDayAverage),
    high52: n(q.fiftyTwoWeekHigh),
    low52: n(q.fiftyTwoWeekLow),
    // Only future dates are useful; a past timestamp means the next one isn't scheduled yet
    earningsDate: earn && earn * 1000 > Date.now() - 86_400_000
      ? new Date(earn * 1000).toLocaleDateString("en-CA", { timeZone: tz })
      : null,
  };
}

async function yahooScreener(market: Market, auth: { cookie: string; crumb: string }): Promise<Q[]> {
  const def = MARKETS.find((m) => m.id === market)!;
  const body = {
    offset: 0,
    size: 250,
    sortField: "intradaymarketcap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: {
      operator: "AND",
      operands: [
        { operator: "or", operands: def.exchanges.slice(0, 5).map((e) => ({ operator: "eq", operands: ["exchange", e] })) },
        { operator: "gt", operands: ["intradaymarketcap", 2e9] },
      ],
    },
    userId: "",
    userIdType: "guid",
  };
  const r = await fetch(
    `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}&lang=en-US&region=${market}&formatted=false&corsDomain=finance.yahoo.com`,
    {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", Cookie: auth.cookie, Origin: "https://finance.yahoo.com", Referer: "https://finance.yahoo.com/" },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  if (!r.ok) return [];
  const j = await r.json();
  return j?.finance?.result?.[0]?.quotes ?? [];
}

async function yahooQuotes(symbols: string[], auth: { cookie: string; crumb: string }): Promise<Q[]> {
  const out: Q[] = [];
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.map(encodeURIComponent).join(",")}&crumb=${encodeURIComponent(auth.crumb)}`,
      { headers: { "User-Agent": UA, Accept: "application/json", Cookie: auth.cookie, Referer: "https://finance.yahoo.com/" }, cache: "no-store" }
    );
    if (r.status === 401) throw new Error("unauthorised");
    if (!r.ok) continue;
    const j = await r.json();
    out.push(...(j?.quoteResponse?.result ?? []));
  }
  return out;
}

// Warm-instance cache so flipping between setups doesn't re-download the market
const cache = new Map<Market, { at: number; body: unknown }>();
const TTL = 5 * 60_000;

export async function GET(request: NextRequest) {
  const market: Market = request.nextUrl.searchParams.get("market") === "SG" ? "SG" : "US";
  const hit = cache.get(market);
  if (hit && Date.now() - hit.at < TTL && !request.nextUrl.searchParams.get("force")) return NextResponse.json(hit.body);

  let auth = await getYahooAuth();
  if (!auth) return NextResponse.json({ results: [], error: "Yahoo Finance authentication failed. Try again in a moment." });

  try {
    let quotes: Q[] = market === "US" ? await yahooScreener(market, auth).catch(() => []) : [];
    let coverage: "provider" | "universe" = "provider";
    if (!quotes.length) {
      coverage = "universe";
      const symbols = universeFor(market).map((s) => s.ticker);
      try {
        quotes = await yahooQuotes(symbols, auth);
      } catch {
        resetYahooAuth();
        auth = await getYahooAuth();
        quotes = auth ? await yahooQuotes(symbols, auth) : [];
      }
    }
    const results = quotes.map(toRow).filter((r) => r.ticker && r.price !== null);
    if (!results.length) return NextResponse.json({ results: [], error: "No quotes returned for this market. Try again in a moment." });

    const body = {
      results,
      market,
      coverage,
      universeSize: results.length,
      source: "Yahoo Finance",
      asOf: new Date().toISOString(),
    };
    cache.set(market, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ results: [], error: String(e) });
  }
}
