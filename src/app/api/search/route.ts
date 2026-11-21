import { NextRequest, NextResponse } from "next/server";
import { SEARCHABLE_EXCHANGES } from "@/lib/markets";
import { MAX_SEARCH_LENGTH } from "@/lib/apiLimits";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const ALLOWED_TYPES = new Set(["EQUITY", "ETF", "MUTUALFUND", "TRUST"]);
// US first, then Singapore and other major international exchanges (see lib/markets.ts)
const ALLOWED_EXCHANGES = SEARCHABLE_EXCHANGES;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });
  if (q.length > MAX_SEARCH_LENGTH) return NextResponse.json({ results: [], error: `Search text can be at most ${MAX_SEARCH_LENGTH} characters.` }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&enableCb=false`;
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ results: [] });
    const j = await r.json();

    const quotes: Record<string, unknown>[] = j?.quotes ?? [];
    const results = quotes
      .filter((q) => {
        const type = String(q.quoteType ?? "");
        const exch = String(q.exchange ?? "");
        return ALLOWED_TYPES.has(type) && ALLOWED_EXCHANGES.has(exch);
      })
      .slice(0, 8)
      .map((q) => ({
        ticker: String(q.symbol ?? ""),
        name: String(q.shortname ?? q.longname ?? q.symbol ?? ""),
        type: String(q.typeDisp ?? q.quoteType ?? ""),
        exchange: String(q.exchDisp ?? q.exchange ?? ""),
        exchangeCode: String(q.exchange ?? ""),
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
