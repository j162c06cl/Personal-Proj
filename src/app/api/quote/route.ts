import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchStooqQuote(ticker: string) {
  const res = await fetch(
    `https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&e=csv`,
    { headers: { "User-Agent": UA } }
  );
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const parts = lines[1].split(",");
  // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
  const open = parseFloat(parts[3]);
  const close = parseFloat(parts[6]);
  if (isNaN(close) || parts[6] === "N/D") return null;
  return {
    price: close,
    change: close - open,
    changePercent: ((close - open) / open) * 100,
  };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const tickers = ticker.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  const results = await Promise.all(
    tickers.map(async (t) => {
      try {
        const data = await fetchStooqQuote(t);
        if (!data) return { ticker: t, name: t, price: null, change: null, changePercent: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: "Not found" };
        return { ticker: t, name: t, ...data, marketCap: null, peRatio: null, revenue: null, netIncome: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ticker: t, name: t, price: null, change: null, changePercent: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: msg };
      }
    })
  );

  return NextResponse.json(tickers.length === 1 ? results[0] : results);
}
