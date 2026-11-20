// Candle provider backed by Yahoo Finance's unofficial chart endpoint.
// Free and keyless, covers US and Singapore listings, but is for personal use only
// and can rate-limit or block without notice.

import { aggregateCandles, addVolume } from "@/lib/marketData/aggregate";
import { tradingDateStart } from "@/lib/marketData/time";
import { Candle, CandleProvider, Timeframe, timeframeInfo } from "@/lib/marketData/types";
import { UA } from "@/lib/server/yahoo";

/** What we request from Yahoo for each timeframe. Yahoo has no 4-hour interval, so 4H is built from 1H. */
const REQUESTS: Record<Timeframe, { interval: string; range: string; coverage: string }> = {
  "1d": { interval: "1d", range: "5y", coverage: "Daily bars for the last 5 years" },
  "4h": { interval: "60m", range: "2y", coverage: "Built from 1-hour bars, last 2 years · the last bar of each session is shorter" },
  "1h": { interval: "60m", range: "1y", coverage: "Last 12 months · regular trading hours only" },
  "15m": { interval: "15m", range: "60d", coverage: "Yahoo only provides the last 60 days at this timeframe · regular hours only" },
  "5m": { interval: "5m", range: "60d", coverage: "Yahoo only provides the last 60 days at this timeframe · regular hours only" },
};

type Num = number | null | undefined;

export interface YahooChartResult {
  meta: {
    currency?: string;
    exchangeTimezoneName?: string;
    regularMarketTime?: number;
    longName?: string;
    shortName?: string;
  };
  timestamp?: number[];
  indicators: { quote: { open?: Num[]; high?: Num[]; low?: Num[]; close?: Num[]; volume?: Num[] }[] };
}

const finite = (x: Num): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Turns Yahoo's parallel arrays into clean candles.
 *
 * - Bars with any missing price are dropped rather than guessed.
 * - Daily bars are keyed to the exchange-local trading date.
 * - Yahoo appends the latest trade as an extra bar: off the bar grid during the session
 *   (e.g. 08:02:28 after an 08:00 bar), or as a zero-volume tick at the close. Both
 *   belong to the bar before, so they're folded into it rather than drawn as a candle.
 */
export function normaliseYahoo(res: YahooChartResult, daily: boolean, intervalSeconds: number): Candle[] {
  const tz = res.meta.exchangeTimezoneName ?? "America/New_York";
  const ts = res.timestamp ?? [];
  const q = res.indicators.quote[0] ?? {};

  const raw: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (!finite(o) || !finite(h) || !finite(l) || !finite(c)) continue;
    raw.push({
      time: daily ? tradingDateStart(ts[i], tz) : ts[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: finite(v) ? v : null,
    });
  }
  // Folding below compares each bar with its neighbours, so it needs time order
  raw.sort((a, b) => a.time - b.time);

  const out: Candle[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const prev = out[out.length - 1];
    const next = raw[i + 1];
    const sameDayAsPrev = prev && tradingDateStart(prev.time, tz) === tradingDateStart(c.time, tz);
    const lastOfDay = !next || tradingDateStart(next.time, tz) !== tradingDateStart(c.time, tz);
    const closingTick = c.volume === 0 && c.open === c.close && c.high === c.close && c.low === c.close;

    const fold = daily
      ? prev && prev.time === c.time // a repeated trading date: the later one is the newer data
      : sameDayAsPrev && (c.time - prev.time < intervalSeconds || (lastOfDay && closingTick));

    if (fold && prev) {
      prev.high = Math.max(prev.high, c.high);
      prev.low = Math.min(prev.low, c.low);
      prev.close = c.close;
      prev.volume = daily ? c.volume : addVolume(prev.volume, c.volume);
    } else {
      out.push(c);
    }
  }
  return out;
}

async function fetchChart(ticker: string, interval: string, range: string): Promise<YahooChartResult | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includePrePost=false`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export const yahooCandles: CandleProvider = {
  name: "Yahoo Finance",

  supports: (tf) => tf in REQUESTS,

  async getCandles(ticker, timeframe) {
    const req = REQUESTS[timeframe];
    const res = await fetchChart(ticker, req.interval, req.range);
    if (!res) return null;

    const tz = res.meta.exchangeTimezoneName ?? "America/New_York";
    // 4H is requested as 1-hour bars, so it's cleaned at the 1-hour spacing before grouping
    const barSeconds = timeframe === "4h" ? 3_600 : timeframeInfo(timeframe).seconds;
    let candles = normaliseYahoo(res, timeframe === "1d", barSeconds);
    if (timeframe === "4h") candles = aggregateCandles(candles, timeframeInfo("4h").seconds, tz);
    if (!candles.length) return null;

    return {
      ticker,
      name: res.meta.longName ?? res.meta.shortName ?? null,
      timeframe,
      currency: res.meta.currency ?? "USD",
      timeZone: tz,
      candles,
      coverage: req.coverage,
      asOf: res.meta.regularMarketTime ? new Date(res.meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
    };
  },
};
