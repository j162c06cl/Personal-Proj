"use client";

// Interactive candlestick + volume chart built on TradingView Lightweight Charts.
// Touches the DOM on creation, so pages load it with next/dynamic and ssr: false.

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart,
  IChartApi, ISeriesApi, LogicalRange, MouseEventParams, Time, UTCTimestamp,
} from "lightweight-charts";
import { ChartData } from "@/lib/marketData/clean";

/** Bars shown when a series first loads; the rest is a scroll or zoom away */
const INITIAL_BARS = 130;

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Whether the newest bar is in view (the range can end a fraction of a bar short of it) */
function showsLatest(range: LogicalRange, bars: number) {
  return range.to >= bars - 1.5;
}

/** #RRGGBB plus an opacity, for volume bars that sit quietly under the candles */
function withAlpha(hex: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function CandlestickChart({
  data,
  intraday,
  viewKey,
  label,
  onHover,
  className = "h-[460px]",
}: {
  data: ChartData;
  intraday: boolean;
  /** Identifies what is shown (ticker + timeframe). A new key resets the view; the same key
   *  with fresh data (a refresh) keeps the reader's zoom and scroll position. */
  viewKey: string;
  /** Read out by screen readers in place of the canvas */
  label: string;
  /** Index into data.candles under the crosshair, or null when the pointer leaves the chart */
  onHover: (index: number | null) => void;
  /** Sets the height; the chart resizes itself to fill the box */
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const colors = useRef({ up: "#00B341", down: "#F04E23" });
  const shownKey = useRef<string | null>(null);
  const barCount = useRef(0);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const [awayFromLatest, setAwayFromLatest] = useState(false);

  // Create the chart once
  useEffect(() => {
    if (!container.current) return;
    const up = cssVar("--green", "#00B341");
    const down = cssVar("--red", "#F04E23");
    colors.current = { up, down };

    const c = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: cssVar("--bg-page", "#FFFFFF") },
        textColor: cssVar("--text-tertiary", "#A3A3A3"),
        fontFamily: getComputedStyle(container.current).fontFamily,
        fontSize: 11,
        attributionLogo: true, // required credit for TradingView's library
      },
      grid: {
        vertLines: { color: cssVar("--chart-grid", "rgba(0,0,0,0.05)") },
        horzLines: { color: cssVar("--chart-grid", "rgba(0,0,0,0.05)") },
      },
      crosshair: { mode: CrosshairMode.Normal },
      // A vertical swipe over the chart scrolls the page on a phone instead of getting trapped
      handleScroll: { vertTouchDrag: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.25 } },
      // Stop at the oldest and newest bars rather than scrolling into empty space, so zooming
      // all the way out fits the whole history to the width. Bar width is capped so a short
      // history (a new listing) isn't stretched into a few giant candles.
      timeScale: { borderVisible: false, rightOffset: 4, fixLeftEdge: true, fixRightEdge: true, maxBarSpacing: 40 },
    });

    candles.current = c.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    // Volume shares the pane on its own hidden scale, kept to the bottom fifth
    volume.current = c.addSeries(HistogramSeries, {
      priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });
    c.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const onMove = (p: MouseEventParams<Time>) => {
      hoverRef.current(p.time === undefined || p.logical === undefined ? null : Math.round(p.logical));
    };
    // The "Latest" button appears once the newest bar has scrolled out of view
    const onRange = (r: LogicalRange | null) => setAwayFromLatest(!!r && !showsLatest(r, barCount.current));
    c.subscribeCrosshairMove(onMove);
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.current = c;

    return () => {
      c.unsubscribeCrosshairMove(onMove);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      c.remove();
      chart.current = candles.current = volume.current = null;
      shownKey.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c || !candles.current || !volume.current) return;
    const { up, down } = colors.current;
    const n = data.candles.length;
    const last = data.candles[n - 1];
    const t = (i: number) => data.times[i] as UTCTimestamp;

    // A refresh of the same chart keeps the view: it follows new bars if the reader was
    // at the latest bar, and otherwise stays on the dates they were looking at
    const refresh = shownKey.current === viewKey;
    const visible = c.timeScale().getVisibleLogicalRange();
    const wasAtLatest = refresh && !!visible && showsLatest(visible, barCount.current);
    const keptDates = refresh ? c.timeScale().getVisibleRange() : null;

    c.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    candles.current.applyOptions({
      // Sub-dollar stocks (common on SGX) need a third decimal to show any movement
      priceFormat: { type: "price", precision: last && last.close < 1 ? 3 : 2, minMove: last && last.close < 1 ? 0.001 : 0.01 },
    });
    candles.current.setData(data.candles.map((k, i) => ({ time: t(i), open: k.open, high: k.high, low: k.low, close: k.close })));
    // A bar with unknown volume is left blank rather than drawn as zero
    volume.current.setData(data.candles.map((k, i) =>
      k.volume === null
        ? { time: t(i) }
        : { time: t(i), value: k.volume, color: withAlpha(k.close >= k.open ? up : down, 0.35) }
    ));
    barCount.current = n;
    shownKey.current = viewKey;

    if (!refresh) showLatest();
    else if (wasAtLatest) c.timeScale().scrollToRealTime();
    else if (keptDates) c.timeScale().setVisibleRange(keptDates);
  }, [data, viewKey, intraday]); // eslint-disable-line react-hooks/exhaustive-deps

  function showLatest() {
    const n = barCount.current;
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - INITIAL_BARS), to: n + 3 });
  }

  return (
    <div className={`relative w-full ${className}`}>
      <div ref={container} role="img" aria-label={label} className="absolute inset-0" />
      {awayFromLatest && (
        <button
          onClick={showLatest}
          className="absolute bottom-10 right-16 z-10 px-3 py-1 text-[12px] font-semibold bg-white text-[#2D8CFF] border border-[#E5E5E5] rounded-full shadow-sm hover:border-[#2D8CFF]"
        >
          Latest »
        </button>
      )}
    </div>
  );
}
