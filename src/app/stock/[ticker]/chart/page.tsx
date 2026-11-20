"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCandles, getQuote } from "@/lib/data";
import { CandleSeries, Timeframe, isTimeframe, isValidTicker, timeframeInfo } from "@/lib/marketData/types";
import { toChartData } from "@/lib/marketData/clean";
import { IndicatorId, computeIndicators } from "@/lib/marketData/indicators";
import { QuoteData, Sourced } from "@/lib/types";
import { currencySymbol } from "@/lib/markets";
import SourceTag from "@/components/SourceTag";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TimeframePicker from "@/components/chart/TimeframePicker";
import OhlcvLegend from "@/components/chart/OhlcvLegend";
import IndicatorMenu from "@/components/chart/IndicatorMenu";
import IndicatorLegend from "@/components/chart/IndicatorLegend";
import { DEFAULT_INDICATORS, PANEL_HEIGHT, isIndicatorId, panelCount } from "@/components/chart/indicatorDefs";

const CHART_HEIGHT = "h-[340px] sm:h-[480px]";
/** Height of the price panel; matches CHART_HEIGHT */
const PRICE_HEIGHT = { phone: 340, wide: 480 };

function Skeleton() {
  return <div className={`bg-black/[0.04] rounded-xl animate-pulse ${CHART_HEIGHT}`} />;
}

// The chart library draws on a canvas, so it only loads in the browser
const CandlestickChart = dynamic(() => import("@/components/chart/CandlestickChart"), { ssr: false, loading: Skeleton });

const TIMEFRAME_KEY = "chart_timeframe";
const INDICATORS_KEY = "chart_indicators";

const ZONE_NAMES: Record<string, string> = { "America/New_York": "New York", "Asia/Singapore": "Singapore" };

export default function ChartPage({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [series, setSeries] = useState<Sourced<CandleSeries> | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Sourced<QuoteData> | null | undefined>(undefined);
  const [hover, setHover] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [enabled, setEnabled] = useState<ReadonlySet<IndicatorId>>(() => new Set(DEFAULT_INDICATORS));
  const [phone, setPhone] = useState(false);

  // Remember the last timeframe and indicators across visits
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TIMEFRAME_KEY);
      if (isTimeframe(saved)) setTimeframe(saved);
      const ids: unknown = JSON.parse(localStorage.getItem(INDICATORS_KEY) ?? "null");
      if (Array.isArray(ids)) setEnabled(new Set(ids.filter(isIndicatorId)));
    } catch {}
  }, []);

  // The price panel is shorter on a phone (matches CHART_HEIGHT)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function chooseTimeframe(tf: Timeframe) {
    setTimeframe(tf);
    try { localStorage.setItem(TIMEFRAME_KEY, tf); } catch {}
  }

  function toggleIndicator(id: IndicatorId) {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabled(next);
    try { localStorage.setItem(INDICATORS_KEY, JSON.stringify(Array.from(next))); } catch {}
  }

  useEffect(() => {
    getQuote(ticker).then(setQuote);
  }, [ticker]);

  // What should be on screen right now, so a late response for something else is ignored
  const wanted = useRef("");
  wanted.current = `${ticker}:${timeframe}`;

  // Keep the previous chart on screen while the next timeframe loads
  useEffect(() => {
    let current = true;
    setLoading(true);
    getCandles(ticker, timeframe, { force: retry > 0 }).then((s) => {
      if (!current) return;
      setSeries(s);
      setHover(null);
      setLoading(false);
    });
    return () => { current = false; };
  }, [ticker, timeframe, retry]);

  const onScreen = useRef<Sourced<CandleSeries> | null | undefined>(undefined);
  onScreen.current = series;

  // Refresh the bars and price every minute while the tab is visible. The data layer serves
  // daily bars from its 15-minute cache, so this mostly updates intraday charts, except that
  // saved snapshot data (shown after a live request failed) skips the cache so live data
  // returns as soon as the provider recovers. A failed refresh keeps what's on screen.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const key = `${ticker}:${timeframe}`;
      const showingSaved = !!onScreen.current?.source.includes("Saved snapshot");
      getCandles(ticker, timeframe, { force: showingSaved }).then((s) => {
        if (s && wanted.current === key) setSeries(s);
      });
      getQuote(ticker).then((q) => {
        if (q && wanted.current.startsWith(`${ticker}:`)) setQuote(q);
      });
    }, 60_000);
    return () => clearInterval(id);
  }, [ticker, timeframe]);

  function openTicker(t: string) {
    const next = t.trim().toUpperCase();
    if (isValidTicker(next) && next !== ticker) router.push(`/stock/${encodeURIComponent(next)}/chart`);
    setSearch("");
  }

  const s = series?.value;
  const chartData = useMemo(
    () => (s ? toChartData(s.candles, timeframeInfo(s.timeframe).intraday, s.timeZone) : null),
    [s]
  );
  const candles = chartData?.candles ?? [];
  const shown = candles.length ? Math.min(Math.max(hover ?? candles.length - 1, 0), candles.length - 1) : -1;
  const barsIntraday = s ? timeframeInfo(s.timeframe).intraday : false;
  const indicators = useMemo(
    () => (chartData && s ? computeIndicators(chartData.candles, enabled, timeframeInfo(s.timeframe).intraday, s.timeZone) : {}),
    [chartData, s, enabled]
  );
  const chartHeight = (phone ? PRICE_HEIGHT.phone : PRICE_HEIGHT.wide) + panelCount(enabled) * PANEL_HEIGHT;
  const priceDigits = candles.length && candles[candles.length - 1].close < 1 ? 3 : 2;
  const q = quote?.value;
  const sym = currencySymbol(s?.currency ?? q?.currency);
  const name = s?.name ?? q?.name ?? null;
  const info = timeframeInfo(timeframe);
  const up = (q?.change ?? 0) >= 0;

  return (
    <div className="max-w-[1280px] mx-auto">
      <Link href={`/stock/${encodeURIComponent(ticker)}`} className="text-[13px] font-semibold text-[#2D8CFF] hover:underline">
        ← {ticker} research
      </Link>

      {/* ── Header: ticker, latest price, search ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mt-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-[#0A0A0A] leading-tight">
            {ticker}
            {name && <span className="ml-2 text-[16px] font-medium text-[#525252] align-middle">{name}</span>}
          </h1>
          {q?.price != null && (
            <p className="flex items-baseline gap-2 flex-wrap mt-1">
              <span className="text-[22px] font-semibold tabular-nums text-[#0A0A0A]">{sym}{q.price.toFixed(q.price < 1 ? 3 : 2)}</span>
              {q.change != null && q.changePercent != null && (
                <span className={`text-[14px] font-semibold tabular-nums ${up ? "text-[#00B341]" : "text-[#F04E23]"}`}>
                  {up ? "▲" : "▼"} {sym}{Math.abs(q.change).toFixed(2)} ({Math.abs(q.changePercent).toFixed(2)}%)
                  <span className="font-normal text-[#525252]"> today</span>
                </span>
              )}
            </p>
          )}
          {quote && <SourceTag className="mt-1" source={quote.source} asOf={quote.asOf} cached={quote.cached} />}
        </div>
        <div className="w-full sm:w-64">
          <TickerAutocomplete
            value={search}
            onChange={setSearch}
            onSelect={(t) => openTicker(t)}
            onKeyDown={(e) => { if (e.key === "Enter" && search) openTicker(search); }}
            placeholder="Chart another ticker…"
            inputClassName="w-full px-3 py-2 text-[14px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#2D8CFF]"
          />
        </div>
      </div>

      {/* ── Chart ── */}
      <section className="mt-5 border border-[#E5E5E5] rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <TimeframePicker value={timeframe} onChange={chooseTimeframe} />
          <div className="flex items-center gap-3 ml-auto">
            {loading && series !== undefined && <span className="text-[12px] text-[#A3A3A3]">Loading {info.label} bars…</span>}
            <IndicatorMenu enabled={enabled} intraday={info.intraday} onToggle={toggleIndicator} />
          </div>
        </div>

        {series === undefined ? (
          <Skeleton />
        ) : !s || !chartData || !candles.length ? (
          <div className={`flex flex-col items-center justify-center text-center gap-2 px-6 ${CHART_HEIGHT}`}>
            <p className="text-[15px] font-semibold text-[#0A0A0A]">Couldn&apos;t load {info.label} bars for {ticker}</p>
            <p className="text-[13px] text-[#525252] max-w-md">
              {info.intraday
                ? "Yahoo Finance may be limiting requests right now. Intraday bars have no saved copy to fall back on."
                : "Check the symbol, or the data provider may be unavailable right now."}
            </p>
            <button onClick={() => setRetry((n) => n + 1)} disabled={loading}
              className="mt-2 px-4 py-1.5 text-[13px] font-semibold bg-[#2D8CFF] text-white rounded-full hover:bg-[#1A73E0] disabled:opacity-50">
              {loading ? "Trying…" : "Try again"}
            </button>
          </div>
        ) : (
          <>
            {/* Dimmed while the next timeframe loads, so the old bars aren't mistaken for the new ones */}
            <div className={`transition-opacity ${loading ? "opacity-40" : ""}`} aria-busy={loading}>
              <div className="mb-2 space-y-0.5">
                <OhlcvLegend candle={candles[shown]} prev={candles[shown - 1] ?? null} timeframe={s.timeframe} timeZone={s.timeZone} symbol={sym} />
                <IndicatorLegend values={indicators} enabled={enabled} index={shown} intraday={barsIntraday} priceDigits={priceDigits} symbol={sym} />
              </div>
              <CandlestickChart
                data={chartData}
                indicators={indicators}
                intraday={barsIntraday}
                viewKey={`${s.ticker}:${s.timeframe}`}
                label={`${timeframeInfo(s.timeframe).label} candlestick chart of ${s.ticker} with volume`}
                onHover={setHover}
                height={chartHeight}
              />
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-3 text-[11px] text-[#A3A3A3]">
              <SourceTag source={`${series.source} · ${timeframeInfo(s.timeframe).label} bars`} asOf={series.asOf} cached={series.cached} />
              <span>{s.coverage}</span>
              {enabled.size > 0 && <span>Indicators calculated in the app from these bars</span>}
              {timeframeInfo(s.timeframe).intraday && (
                <span>{chartData.clock === "UTC" ? "Times in UTC" : `Times in ${ZONE_NAMES[s.timeZone] ?? s.timeZone} exchange time`}</span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
