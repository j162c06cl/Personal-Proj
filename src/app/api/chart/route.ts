import { NextRequest, NextResponse } from "next/server";
import { UA } from "@/lib/server/yahoo";
import { readTicker } from "@/lib/apiLimits";
import { forceSnapshot, snapshotChart } from "@/lib/server/snapshot";

// Price history (OHLCV) for the research page chart and technical indicators.
const RANGES: Record<string, string> = {
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1d",
  "1y": "1d",
  "2y": "1d",
  "5y": "1wk",
};

async function liveChart(ticker: string, range: string) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${RANGES[range]}&includePrePost=false`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    if (!ts.length) return null;

    const points = ts
      .map((t, i) => ({
        t: new Date(t * 1000).toISOString().slice(0, 10),
        o: q.open?.[i] ?? null,
        h: q.high?.[i] ?? null,
        l: q.low?.[i] ?? null,
        c: q.close?.[i] ?? null,
        v: q.volume?.[i] ?? null,
      }))
      .filter((p) => p.c !== null);

    return {
      ticker,
      range,
      interval: RANGES[range],
      currency: res.meta?.currency ?? "USD",
      points,
      source: "Yahoo Finance",
      asOf: res.meta?.regularMarketTime ? new Date(res.meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ticker = readTicker(request.nextUrl.searchParams.get("ticker"));
  const range = request.nextUrl.searchParams.get("range") ?? "1y";
  if (!ticker) return NextResponse.json({ error: "A valid ticker is required" }, { status: 400 });
  if (!RANGES[range]) return NextResponse.json({ error: "unsupported range" }, { status: 400 });

  const data = (forceSnapshot ? null : await liveChart(ticker, range)) ?? snapshotChart(ticker, range);
  return data
    ? NextResponse.json(data)
    : NextResponse.json({ error: "No price history available" }, { status: forceSnapshot ? 404 : 502 });
}
