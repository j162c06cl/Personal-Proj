import { NextRequest, NextResponse } from "next/server";
import { UA } from "@/lib/server/yahoo";
import { companyKeywords, dedupeNews, RawNews, relevanceOf } from "@/lib/server/news";
import { forceSnapshot, snapshotNews } from "@/lib/server/snapshot";

// Recent headlines for a ticker from Yahoo Finance search, filtered for relevance
// and de-duplicated. Pass ?name= (company name) to match headlines that use it.

async function search(q: string): Promise<RawNews[]> {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=50&quotesCount=0&enableFuzzyQuery=false`,
    { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }
  );
  if (!r.ok) throw new Error(`Yahoo returned ${r.status}`);
  return (await r.json())?.news ?? [];
}

const MIN_ITEMS = 4;

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  const name = request.nextUrl.searchParams.get("name");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const fallback = () => {
    const saved = snapshotNews(ticker);
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: "News provider unavailable" }, { status: 502 });
  };
  if (forceSnapshot) return fallback();

  try {
    const keywords = companyKeywords(ticker, name);
    // Searching by company name as well as ticker surfaces more stories that are actually about it
    const queries = Array.from(new Set([ticker, ...keywords.filter((k) => k !== ticker.toLowerCase())]));
    const results = await Promise.allSettled(queries.map(search));
    const raw = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!raw.length && results.every((r) => r.status === "rejected")) return fallback();

    const scored = raw.map((n) => ({ ...n, relevance: relevanceOf(n, ticker, keywords) }));
    // Fill in tiers: headlines that name the company are the reliable signal. Yahoo's ticker
    // tags are noisy, so tagged-only and market-wide stories only pad out a thin list.
    let pool = scored.filter((n) => n.relevance === "direct");
    for (const tier of ["related", "broad"] as const) {
      if (new Set(pool.map((n) => n.link)).size >= MIN_ITEMS) break;
      pool = [...pool, ...scored.filter((n) => n.relevance === tier).slice(0, MIN_ITEMS * 2)];
    }
    const unique = new Set(pool.map((n) => n.link)).size;
    const merged = dedupeNews(pool);

    return NextResponse.json({
      ticker,
      items: merged.slice(0, 20),
      fetched: unique,
      duplicatesRemoved: unique - merged.length,
      source: "Yahoo Finance News",
      asOf: new Date().toISOString(),
    });
  } catch {
    return fallback();
  }
}
