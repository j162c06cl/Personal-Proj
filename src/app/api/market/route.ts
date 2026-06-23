import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const INDICES = [
  { symbol: "^GSPC",   label: "S&P 500",      stooq: "^spx",   format: "index" },
  { symbol: "^IXIC",   label: "Nasdaq",        stooq: "^ndq",   format: "index" },
  { symbol: "^DJI",    label: "Dow Jones",     stooq: "^dji",   format: "index" },
  { symbol: "^VIX",    label: "VIX",           stooq: "^vix",   format: "decimal" },
  { symbol: "^TNX",    label: "10Y Treasury",  stooq: null,     format: "percent" },
  { symbol: "BTC-USD", label: "Bitcoin",       stooq: "btcusd", format: "currency" },
  { symbol: "GC=F",    label: "Gold",          stooq: "xauusd", format: "currency" },
  { symbol: "CL=F",    label: "Crude Oil",     stooq: null,     format: "currency" },
];

const SECTORS = [
  { symbol: "XLK",  label: "Technology" },
  { symbol: "XLF",  label: "Financials" },
  { symbol: "XLV",  label: "Healthcare" },
  { symbol: "XLI",  label: "Industrials" },
  { symbol: "XLY",  label: "Consumer Disc." },
  { symbol: "XLP",  label: "Consumer Staples" },
  { symbol: "XLE",  label: "Energy" },
  { symbol: "XLU",  label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLC",  label: "Communication" },
  { symbol: "XLB",  label: "Materials" },
];

async function yahooChart(symbol: string) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;
    const price = meta.regularMarketPrice as number;
    const prev = (meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? meta.previousClose) as number | undefined;
    return {
      price,
      change: prev ? price - prev : null as number | null,
      changePercent: prev ? ((price - prev) / prev) * 100 : null as number | null,
    };
  } catch { return null; }
}

async function stooqFetch(sym: string) {
  try {
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
      price: close,
      change: close - open,
      changePercent: ((close - open) / open) * 100,
    };
  } catch { return null; }
}

export async function GET() {
  const [indices, sectors] = await Promise.all([
    Promise.all(
      INDICES.map(async (idx) => {
        let data = await yahooChart(idx.symbol);
        if (!data && idx.stooq) data = await stooqFetch(idx.stooq);
        return {
          symbol: idx.symbol,
          label: idx.label,
          format: idx.format,
          ...(data ?? { price: null, change: null, changePercent: null }),
        };
      })
    ),
    Promise.all(
      SECTORS.map(async (sec) => {
        let data = await yahooChart(sec.symbol);
        if (!data) data = await stooqFetch(`${sec.symbol.toLowerCase()}.us`);
        return {
          symbol: sec.symbol,
          label: sec.label,
          ...(data ?? { price: null, change: null, changePercent: null }),
        };
      })
    ),
  ]);

  return NextResponse.json({ indices, sectors, lastUpdated: new Date().toISOString() });
}
