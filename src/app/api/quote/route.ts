import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Module-level cache — survives within a warm serverless instance
let _auth: { cookie: string; crumb: string; ts: number } | null = null;

async function getYahooAuth(): Promise<{ cookie: string; crumb: string } | null> {
  if (_auth && Date.now() - _auth.ts < 3_600_000) return _auth;
  try {
    const r1 = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
      cache: "no-store",
    });
    const setCookie = r1.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/A3=([^;]+)/);
    if (!match) return null;
    const cookie = `A3=${match[1]}`;

    const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
      cache: "no-store",
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.startsWith("<") || crumb.length < 2) return null;

    _auth = { cookie, crumb, ts: Date.now() };
    return _auth;
  } catch { return null; }
}

const V7_FIELDS = [
  "shortName", "longName", "regularMarketPrice", "regularMarketChange",
  "regularMarketChangePercent", "regularMarketOpen", "regularMarketDayHigh",
  "regularMarketDayLow", "regularMarketVolume", "averageDailyVolume10Day",
  "averageDailyVolume3Month", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
  "marketCap", "trailingPE", "trailingAnnualDividendYield", "regularMarketTime",
].join(",");

async function yahooV7Batch(symbols: string[], auth: { cookie: string; crumb: string }) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=${V7_FIELDS}&crumb=${encodeURIComponent(auth.crumb)}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: auth.cookie,
        Referer: "https://finance.yahoo.com/",
      },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    const items: Record<string, unknown>[] = j?.quoteResponse?.result ?? [];
    if (!items.length) return null;

    const out: Record<string, ReturnType<typeof extractV7>> = {};
    for (const item of items) {
      const sym = String(item.symbol ?? "").toUpperCase();
      if (sym) out[sym] = extractV7(item);
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

function epochToIso(sec: number | undefined): string {
  return sec ? new Date(sec * 1000).toISOString() : new Date().toISOString();
}

function extractV7(q: Record<string, unknown>) {
  const price = (q.regularMarketPrice as number | null) ?? null;
  const prev = (q.regularMarketPreviousClose as number | null) ?? null;
  const change = (q.regularMarketChange as number | null) ?? (price && prev ? price - prev : null);
  const changePct = (q.regularMarketChangePercent as number | null) ?? (change && prev ? (change / prev) * 100 : null);
  return {
    name: String(q.shortName ?? q.longName ?? ""),
    price,
    open: (q.regularMarketOpen as number | null) ?? null,
    change,
    changePercent: changePct,
    weekHigh52: (q.fiftyTwoWeekHigh as number | null) ?? null,
    weekLow52: (q.fiftyTwoWeekLow as number | null) ?? null,
    marketCap: (q.marketCap as number | null) ?? null,
    volume: (q.regularMarketVolume as number | null) ?? null,
    avgVolume: (q.averageDailyVolume10Day as number | null) ?? (q.averageDailyVolume3Month as number | null) ?? null,
    dayHigh: (q.regularMarketDayHigh as number | null) ?? null,
    dayLow: (q.regularMarketDayLow as number | null) ?? null,
    pe: (q.trailingPE as number | null) ?? null,
    divYield: (q.trailingAnnualDividendYield as number | null) ?? null,
    source: "Yahoo Finance",
    asOf: epochToIso(q.regularMarketTime as number | undefined),
  };
}

async function yahooChart(symbol: string) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice as number;
    const prev = (meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? meta.previousClose) as number | undefined;
    return {
      name: String(meta.shortName ?? meta.longName ?? symbol),
      price,
      open: (meta.regularMarketOpen ?? null) as number | null,
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
      source: "Yahoo Finance (chart)",
      asOf: epochToIso(meta.regularMarketTime as number | undefined),
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
      open: isNaN(open) ? null : open,
      change: close - open,
      changePercent: ((close - open) / open) * 100,
      weekHigh52: null as number | null, weekLow52: null as number | null,
      marketCap: null as number | null, volume: null as number | null,
      avgVolume: null as number | null, dayHigh: null as number | null,
      dayLow: null as number | null, pe: null as number | null,
      divYield: null as number | null,
      source: "Stooq",
      asOf: new Date().toISOString(), // Stooq's own timestamp is exchange-local, so record retrieval time
    };
  } catch { return null; }
}

function toResult(t: string, data: ReturnType<typeof extractV7> | Awaited<ReturnType<typeof yahooChart>> | Awaited<ReturnType<typeof stooqQuote>>) {
  if (!data) return { ticker: t, name: t, price: null, open: null, change: null, changePercent: null, weekHigh52: null, weekLow52: null, marketCap: null, volume: null, avgVolume: null, dayHigh: null, dayLow: null, pe: null, divYield: null, error: "Not found", source: null, asOf: new Date().toISOString() };
  return { ticker: t, name: data.name || t, price: data.price, open: data.open, change: data.change, changePercent: data.changePercent, weekHigh52: data.weekHigh52, weekLow52: data.weekLow52, marketCap: data.marketCap, volume: data.volume, avgVolume: data.avgVolume, dayHigh: data.dayHigh, dayLow: data.dayLow, pe: data.pe, divYield: data.divYield, source: data.source, asOf: data.asOf };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const tickers = ticker.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  // Get Yahoo auth (crumb + cookie) once for the whole batch
  const auth = await getYahooAuth();

  // Batch all tickers via v7 (authenticated)
  const v7Map = auth ? await yahooV7Batch(tickers, auth) : null;

  const results = await Promise.all(
    tickers.map(async (t) => {
      const v7 = v7Map?.[t];
      if (v7 && v7.price !== null) return toResult(t, v7);
      // Fallbacks for any ticker v7 missed
      const data = (await yahooChart(t)) ?? (await stooqQuote(t));
      return toResult(t, data);
    })
  );

  return NextResponse.json(tickers.length === 1 ? results[0] : results);
}
