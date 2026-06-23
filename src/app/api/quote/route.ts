import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function yahooChart(symbol: string) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
      { headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;
    const price = meta.regularMarketPrice as number;
    const prev = (meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? meta.previousClose) as number | undefined;
    return {
      name: (meta.shortName ?? meta.longName ?? symbol) as string,
      price,
      change: prev ? price - prev : null as number | null,
      changePercent: prev ? ((price - prev) / prev) * 100 : null as number | null,
      weekHigh52: (meta["52WeekHigh"] ?? null) as number | null,
      weekLow52: (meta["52WeekLow"] ?? null) as number | null,
      marketCap: (meta.marketCap ?? null) as number | null,
      volume: (meta.regularMarketVolume ?? null) as number | null,
      avgVolume: (meta.averageDailyVolume10Day ?? meta.averageDailyVolume3Month ?? null) as number | null,
      dayHigh: (meta.regularMarketDayHigh ?? null) as number | null,
      dayLow: (meta.regularMarketDayLow ?? null) as number | null,
      pe: (meta.trailingPE ?? null) as number | null,
      divYield: (meta.dividendYield ?? null) as number | null,
    };
  } catch { return null; }
}

async function stooqQuote(ticker: string) {
  try {
    const s = ticker.toLowerCase();
    const useSuffix = !s.startsWith("^") && !s.includes("=") && !s.includes("-");
    const sym = useSuffix ? `${s}.us` : s;
    const r = await fetch(
      `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&e=csv`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const text = await r.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const parts = lines[1].split(",");
    const open = parseFloat(parts[3]);
    const close = parseFloat(parts[6]);
    if (isNaN(close) || parts[6] === "N/D") return null;
    return {
      name: ticker,
      price: close,
      change: close - open,
      changePercent: ((close - open) / open) * 100,
      weekHigh52: null as number | null,
      weekLow52: null as number | null,
      marketCap: null as number | null,
      volume: null as number | null,
      avgVolume: null as number | null,
      dayHigh: null as number | null,
      dayLow: null as number | null,
      pe: null as number | null,
      divYield: null as number | null,
    };
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const tickers = ticker.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  const results = await Promise.all(
    tickers.map(async (t) => {
      const data = (await yahooChart(t)) ?? (await stooqQuote(t));
      if (!data) return { ticker: t, name: t, price: null, change: null, changePercent: null, weekHigh52: null, weekLow52: null, marketCap: null, volume: null, avgVolume: null, dayHigh: null, dayLow: null, pe: null, divYield: null, error: "Not found" };
      return { ticker: t, name: data.name, price: data.price, change: data.change, changePercent: data.changePercent, weekHigh52: data.weekHigh52, weekLow52: data.weekLow52, marketCap: data.marketCap, volume: data.volume, avgVolume: data.avgVolume, dayHigh: data.dayHigh, dayLow: data.dayLow, pe: data.pe, divYield: data.divYield };
    })
  );

  return NextResponse.json(tickers.length === 1 ? results[0] : results);
}
