import { NextRequest, NextResponse } from "next/server";
import { candleProvider } from "@/lib/server/providers";
import { forceSnapshot, snapshotChart } from "@/lib/server/snapshot";
import { Candle, CandleSeries, isTimeframe, isValidTicker, timeframeInfo } from "@/lib/marketData/types";
import { cleanCandles } from "@/lib/marketData/clean";

// OHLCV bars for the interactive chart, from whichever provider lib/server/providers picks.

interface SnapshotPoint { t: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }

/** Daily bars from the saved snapshot. Bars missing a price are skipped rather than filled in. */
function snapshotCandles(ticker: string): (CandleSeries & { source: string; asOf: string }) | null {
  const s = snapshotChart(ticker, "2y") as { currency?: string; points?: SnapshotPoint[]; source: string; asOf?: string } | null;
  if (!s?.points?.length) return null;
  const candles = cleanCandles(
    s.points
      .filter((p) => p.o !== null && p.h !== null && p.l !== null && p.c !== null)
      .map((p): Candle => ({ time: Date.parse(p.t + "T00:00:00Z") / 1000, open: p.o!, high: p.h!, low: p.l!, close: p.c!, volume: p.v }))
  );
  if (!candles.length) return null;
  return {
    ticker,
    name: null,
    timeframe: "1d",
    currency: s.currency ?? "USD",
    timeZone: ticker.endsWith(".SI") ? "Asia/Singapore" : "America/New_York",
    candles,
    coverage: "Saved daily bars, last 2 years",
    source: s.source,
    asOf: s.asOf ?? new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const tf = request.nextUrl.searchParams.get("timeframe");

  if (!isValidTicker(ticker)) return NextResponse.json({ error: "A valid ticker is required" }, { status: 400 });
  if (!isTimeframe(tf)) return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  if (!candleProvider.supports(tf)) {
    return NextResponse.json({ error: `${candleProvider.name} doesn't provide ${timeframeInfo(tf).label} bars` }, { status: 400 });
  }

  // Every provider's bars pass through the same cleaning, so the chart can rely on order and completeness
  const live = forceSnapshot ? null : await candleProvider.getCandles(ticker, tf);
  const liveCandles = live ? cleanCandles(live.candles) : [];
  if (live && liveCandles.length) return NextResponse.json({ ...live, candles: liveCandles, source: candleProvider.name });

  // Only daily history is saved, so intraday has no fallback
  const saved = tf === "1d" ? snapshotCandles(ticker) : null;
  if (saved) return NextResponse.json(saved);

  return NextResponse.json(
    { error: timeframeInfo(tf).intraday ? "Intraday bars aren't available right now" : "No price history available" },
    { status: forceSnapshot ? 404 : 502 }
  );
}
