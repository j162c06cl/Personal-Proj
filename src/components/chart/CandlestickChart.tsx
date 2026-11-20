"use client";

// Interactive candlestick + volume chart built on TradingView Lightweight Charts, with
// indicator lines over the price and optional RSI / MACD panels below it.
// Touches the DOM on creation, so pages load it with next/dynamic and ssr: false.

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  IChartApi, ISeriesApi, LogicalRange, MouseEventParams, SeriesType, Time, UTCTimestamp,
} from "lightweight-charts";
import { ChartData } from "@/lib/marketData/clean";
import { IndicatorValues, Series } from "@/lib/marketData/indicators";
import { MACD_SIGNAL_COLOR, PANEL_HEIGHT, indicatorDef } from "./indicatorDefs";

/** Bars shown when a series first loads; the rest is a scroll or zoom away */
const INITIAL_BARS = 130;

/** Indicators drawn over the price (or, for average volume, over the volume bars) */
const OVERLAYS = ["sma20", "sma50", "sma200", "ema9", "ema21", "vwap", "avgVolume"] as const;
const PANEL_SERIES = ["rsi", "macdHist", "macdLine", "macdSignal"] as const;

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const colorOf = (c: [string, string]) => cssVar(c[0], c[1]);

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
  indicators,
  intraday,
  viewKey,
  label,
  onHover,
  height,
}: {
  data: ChartData;
  /** Indicator values aligned with data.candles; only the switched-on ones are present */
  indicators: IndicatorValues;
  intraday: boolean;
  /** Identifies what is shown (ticker + timeframe). A new key resets the view; the same key
   *  with fresh data (a refresh) keeps the reader's zoom and scroll position. */
  viewKey: string;
  /** Read out by screen readers in place of the canvas */
  label: string;
  /** Index into data.candles under the crosshair, or null when the pointer leaves the chart */
  onHover: (index: number | null) => void;
  /** Total height in pixels, including PANEL_HEIGHT for each RSI / MACD panel */
  height: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const extra = useRef(new Map<string, ISeriesApi<SeriesType>>());
  const panelSet = useRef("");
  const paneLayout = useRef("");
  const colors = useRef({ up: "#00B341", down: "#F04E23" });
  const shownKey = useRef<string | null>(null);
  const barCount = useRef(0);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const panels = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0);

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
        panes: { separatorColor: cssVar("--border", "#E5E5E5") },
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
    // Volume shares the price panel on its own hidden scale, kept to the bottom fifth
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
    const series = extra.current;

    return () => {
      c.unsubscribeCrosshairMove(onMove);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      c.remove();
      chart.current = candles.current = volume.current = null;
      series.clear();
      panelSet.current = paneLayout.current = "";
      shownKey.current = null;
    };
  }, []);

  // Candles and volume
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

  // Indicators
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const map = extra.current;
    const t = (i: number) => data.times[i] as UTCTimestamp;
    const points = (s: Series) => s.map((v, i) => (v === null ? { time: t(i) } : { time: t(i), value: v }));
    const remove = (key: string) => {
      const s = map.get(key);
      if (s) { c.removeSeries(s); map.delete(key); }
    };
    const quiet = { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false } as const;

    // Lines over the price; average volume sits on the volume bars' scale
    for (const key of OVERLAYS) {
      const s = indicators[key];
      if (!s) { remove(key); continue; }
      let api = map.get(key);
      if (!api) {
        api = key === "avgVolume"
          ? c.addSeries(LineSeries, { ...quiet, color: colorOf(indicatorDef(key).color), lineWidth: 1, priceScaleId: "volume", priceFormat: { type: "volume" } })
          : c.addSeries(LineSeries, { ...quiet, color: colorOf(indicatorDef(key).color), lineWidth: 2, lineStyle: key === "vwap" ? LineStyle.Dashed : LineStyle.Solid });
        map.set(key, api);
      }
      if (key === "vwap") {
        // VWAP restarts each session. The library colours a segment by the point it starts
        // from, so making each session's last point transparent hides the jump to the next.
        const day = (i: number) => Math.floor(data.times[i] / 86_400);
        api.setData(s.map((v, i) =>
          v === null ? { time: t(i) }
          : i < s.length - 1 && day(i + 1) !== day(i) ? { time: t(i), value: v, color: "transparent" }
          : { time: t(i), value: v }));
      } else {
        api.setData(points(s));
      }
    }

    // RSI and MACD panels are rebuilt in order when either is switched on or off, so their
    // positions never depend on which one was added first
    const wanted = [indicators.rsi && "rsi", indicators.macd && "macd"].filter(Boolean).join(",");
    if (wanted !== panelSet.current) {
      PANEL_SERIES.forEach(remove);
      let pane = 1;
      if (indicators.rsi) {
        const rsi = c.addSeries(LineSeries, {
          color: colorOf(indicatorDef("rsi").color), lineWidth: 2, priceLineVisible: false,
          priceFormat: { type: "price", precision: 1, minMove: 0.1 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, pane++);
        for (const level of [70, 30]) {
          rsi.createPriceLine({ price: level, color: cssVar("--text-tertiary", "#A3A3A3"), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
        }
        map.set("rsi", rsi);
      }
      if (indicators.macd) {
        const fmt = { type: "price", precision: 2, minMove: 0.01 } as const;
        map.set("macdHist", c.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false, priceFormat: fmt }, pane));
        map.set("macdLine", c.addSeries(LineSeries, { ...quiet, color: colorOf(indicatorDef("macd").color), lineWidth: 2, priceFormat: fmt }, pane));
        map.set("macdSignal", c.addSeries(LineSeries, { ...quiet, color: colorOf(MACD_SIGNAL_COLOR), lineWidth: 2, priceFormat: fmt }, pane));
      }
      panelSet.current = wanted;
    }

    if (indicators.rsi) map.get("rsi")!.setData(points(indicators.rsi));
    if (indicators.macd) {
      const { up, down } = colors.current;
      map.get("macdHist")!.setData(indicators.macd.histogram.map((v, i) =>
        v === null ? { time: t(i) } : { time: t(i), value: v, color: withAlpha(v >= 0 ? up : down, 0.45) }));
      map.get("macdLine")!.setData(points(indicators.macd.line));
      map.get("macdSignal")!.setData(points(indicators.macd.signal));
    }

    // Each panel gets PANEL_HEIGHT and the price panel the rest. Only re-applied when the
    // panels or height change, so a refresh doesn't undo a divider the reader has dragged.
    const layout = `${wanted}|${height}`;
    if (layout !== paneLayout.current) {
      const panes = c.panes();
      panes.forEach((p, i) => p.setStretchFactor(i === 0 ? Math.max(height - PANEL_HEIGHT * (panes.length - 1), 1) : PANEL_HEIGHT));
      paneLayout.current = layout;
    }
  }, [indicators, data, height]);

  function showLatest() {
    const n = barCount.current;
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - INITIAL_BARS), to: n + 3 });
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={container} role="img" aria-label={label} className="absolute inset-0" />
      {awayFromLatest && (
        <button
          onClick={showLatest}
          // Sits at the bottom of the price panel, above any RSI / MACD panels
          style={{ bottom: 40 + panels * PANEL_HEIGHT }}
          className="absolute right-16 z-10 px-3 py-1 text-[12px] font-semibold bg-white text-[#2D8CFF] border border-[#E5E5E5] rounded-full shadow-sm hover:border-[#2D8CFF]"
        >
          Latest »
        </button>
      )}
    </div>
  );
}
