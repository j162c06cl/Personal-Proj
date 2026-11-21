import { NextRequest, NextResponse } from "next/server";
import { UA } from "@/lib/server/yahoo";
import { normaliseYahoo, YahooChartResult } from "@/lib/server/providers/yahooCandles";
import { forceSnapshot, snapshotChart, snapshotQuote } from "@/lib/server/snapshot";
import { isValidTicker } from "@/lib/marketData/types";
import { barStillForming } from "@/lib/marketData/time";
import { DailyClose, MAX_GAP_DAYS, addDays, closeOnOrAfter, isIsoDate } from "@/lib/historicalPrice";

// The closing price on a past date (or the next trading day), plus the latest price, for any
// listing Yahoo covers. Closes are adjusted for later stock splits, like the rest of the app's
// price history, so they match today's share count. Falls back to the saved snapshot.

interface PriceHistory {
  closes: DailyClose[];
  currentPrice: number | null;
  currency: string | null;
  source: string;
  asOf: string;
  /** The provider doesn't recognise the symbol */
  unknownTicker?: boolean;
}

type ChartWithPrice = YahooChartResult & { meta: YahooChartResult["meta"] & { regularMarketPrice?: number } };

async function fromYahoo(ticker: string, from: string): Promise<PriceHistory | null> {
  // A few days either side, so the window covers weekends and holidays in any time zone
  const p1 = Date.parse(addDays(from, -2) + "T00:00:00Z") / 1000;
  const p2 = Date.parse(addDays(from, MAX_GAP_DAYS + 2) + "T00:00:00Z") / 1000;
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&includePrePost=false`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    const body = r.status < 500 && r.status !== 429 ? await r.json().catch(() => null) : null;
    // Yahoo answers an unknown symbol (Not Found) or a date with no data (Bad Request) with an
    // error of its own: that's a real "no data", unlike an outage or a rate limit
    const code: string | undefined = body?.chart?.error?.code;
    if (code === "Not Found" || code === "Bad Request") {
      return { closes: [], currentPrice: null, currency: null, source: "Yahoo Finance", asOf: new Date().toISOString(), unknownTicker: code === "Not Found" };
    }
    const res: ChartWithPrice | undefined = r.ok ? body?.chart?.result?.[0] : undefined;
    if (!res) return null;

    const tz = res.meta.exchangeTimezoneName ?? "America/New_York";
    const now = Date.now() / 1000;
    const closes = normaliseYahoo(res, true, 86_400)
      // A session still trading has no closing price yet
      .filter((c) => !barStillForming(c.time, 86_400, false, tz, now))
      .map((c) => ({ date: new Date(c.time * 1000).toISOString().slice(0, 10), close: c.close }));
    const price = res.meta.regularMarketPrice;
    return {
      closes,
      currentPrice: typeof price === "number" && Number.isFinite(price) ? price : null,
      currency: res.meta.currency ?? null,
      source: "Yahoo Finance",
      asOf: new Date((res.meta.regularMarketTime ?? now) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Saved daily closes (the last 2 years, showcase stocks only) */
function fromSnapshot(ticker: string): PriceHistory | null {
  const s = snapshotChart(ticker, "2y") as { points?: { t: string; c: number | null }[]; currency?: string; source: string; asOf?: string } | null;
  if (!s?.points?.length) return null;
  const q = snapshotQuote(ticker) as { price?: number | null } | null;
  return {
    closes: s.points.filter((p) => p.c !== null).map((p) => ({ date: p.t, close: p.c! })),
    currentPrice: q?.price ?? null,
    currency: s.currency ?? null,
    source: s.source,
    asOf: s.asOf ?? new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";

  if (!isValidTicker(ticker)) return NextResponse.json({ error: "Enter a valid ticker." }, { status: 400 });
  if (!isIsoDate(from)) return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });
  if (from > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: "The date can't be in the future." }, { status: 400 });

  const live = forceSnapshot ? null : await fromYahoo(ticker, from);
  let history = live;
  let hit = live ? closeOnOrAfter(live.closes, from) : null;
  if (!hit) {
    const saved = fromSnapshot(ticker);
    const savedHit = saved ? closeOnOrAfter(saved.closes, from) : null;
    if (savedHit) { history = saved; hit = savedHit; }
  }

  if (!hit || !history) {
    if (!live) return NextResponse.json({ error: "Price history isn't available right now. Try again later or type the price." }, { status: 502 });
    const error = live.unknownTicker
      ? `Yahoo Finance doesn't recognise ${ticker}. Check the symbol (Singapore listings end in .SI).`
      : `${ticker} has no closing price between ${from} and ${addDays(from, MAX_GAP_DAYS)}. The date may be before it was listed, or that day hasn't closed yet.`;
    return NextResponse.json({ error }, { status: 404 });
  }

  return NextResponse.json({
    ticker,
    date: from,
    actualDate: hit.date,
    closingPrice: hit.close,
    currentPrice: history.currentPrice,
    currency: history.currency,
    source: history.source,
    asOf: history.asOf,
  });
}
