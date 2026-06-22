import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require("yahoo-finance2").default;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  try {
    const result = await yahooFinance.search(q, { quotesCount: 6, newsCount: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (result.quotes || []).filter((r: any) => r.symbol).map((r: any) => ({
      ticker: r.symbol,
      name: r.longname || r.shortname || r.symbol,
      type: r.quoteType || "EQUITY",
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
