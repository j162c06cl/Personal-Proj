import { NextResponse } from "next/server";
import { UA } from "@/lib/server/yahoo";
import { dedupeNews, RawNews } from "@/lib/server/news";
import { forceSnapshot, snapshotNews } from "@/lib/server/snapshot";

// What the market is talking about: Yahoo's trending US tickers, plus recent headlines
// about those tickers and the market as a whole, de-duplicated.

const MARKET_QUERIES = ["stock market", "stocks to watch"];
const NEWS_TICKERS = 5;

// Plain US listings only: skips crypto (BTC-USD), futures (GC=F), indices (^GSPC) and junk entries
const isListedSymbol = (s: string) => /^[A-Z]{1,5}(-[A-Z])?$/.test(s);

async function yahooJson(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Yahoo returned ${r.status}`);
  return r.json();
}

const searchNews = async (q: string): Promise<RawNews[]> =>
  (await yahooJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=12&quotesCount=0&enableFuzzyQuery=false`))?.news ?? [];

/** Saved headlines from the snapshot, newest first, when Yahoo is unreachable */
function fallback() {
  const tickers = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"];
  const items = tickers
    .flatMap((t) => ((snapshotNews(t) as { items?: { publishedAt: string }[] } | null)?.items ?? []).map((i) => ({ ...i, tickers: [t] })))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 12);
  if (!items.length) return NextResponse.json({ error: "Trending data unavailable" }, { status: 502 });
  return NextResponse.json({ tickers: [], news: items, source: "Saved snapshot (Yahoo Finance News)", asOf: new Date().toISOString() });
}

export async function GET() {
  if (forceSnapshot) return fallback();
  try {
    const trending: string[] = ((await yahooJson("https://query1.finance.yahoo.com/v1/finance/trending/US?count=25"))
      ?.finance?.result?.[0]?.quotes ?? [])
      .map((q: { symbol?: string }) => String(q.symbol ?? ""))
      .filter(isListedSymbol)
      .slice(0, 12);

    const results = await Promise.allSettled([...trending.slice(0, NEWS_TICKERS), ...MARKET_QUERIES].map(searchNews));
    const raw = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!raw.length && !trending.length) return fallback();

    // Keep only the last two days so "trending" stays current
    const cutoff = Date.now() / 1000 - 2 * 86_400;
    const recent = raw.filter((n) => (n.providerPublishTime ?? 0) >= cutoff);
    const merged = dedupeNews((recent.length >= 5 ? recent : raw).map((n) => ({ ...n, relevance: "broad" as const })));
    const tagsByLink = new Map(raw.map((n) => [n.link, (n.relatedTickers ?? []).filter(isListedSymbol).slice(0, 3)]));

    return NextResponse.json({
      tickers: trending,
      news: merged.slice(0, 12).map((n) => ({ ...n, tickers: tagsByLink.get(n.link) ?? [] })),
      source: "Yahoo Finance",
      asOf: new Date().toISOString(),
    });
  } catch {
    return fallback();
  }
}
