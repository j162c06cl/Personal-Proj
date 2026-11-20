"use client";

// Interactive candlestick + volume chart built on TradingView Lightweight Charts, with
// indicator lines over the price, optional RSI / MACD panels below it, support and resistance
// lines, and the reader's own levels, trendlines and notes.
// Touches the DOM on creation, so pages load it with next/dynamic and ssr: false.

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, LogicalRange, MouseEventParams, SeriesType, Time, UTCTimestamp,
} from "lightweight-charts";
import { ChartData } from "@/lib/marketData/clean";
import { IndicatorValues, Series } from "@/lib/marketData/indicators";
import { MACD_SIGNAL_COLOR, PANEL_HEIGHT, indicatorDef } from "./indicatorDefs";
import {
  ChartHighlight, ChartLevel, ChartNoteMark, ChartPoint, ChartSetupMark, ChartTrendline, DRAW_COLOR, NOTE_COLOR, SETUP_COLOR,
} from "./drawing";

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

/** Drawings don't stretch the price scale: a line drawn far off doesn't squash the candles */
const NO_AUTOSCALE = { autoscaleInfoProvider: () => null } as const;
const shorten = (text: string, max = 24) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default function CandlestickChart({
  data,
  indicators,
  intraday,
  viewKey,
  label,
  onHover,
  height,
  levels,
  trendlines,
  notes,
  anchor,
  drawing,
  onPick,
  setupMarks,
  highlight,
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
  /** Horizontal lines: detected support / resistance and the reader's own levels */
  levels: ChartLevel[];
  trendlines: ChartTrendline[];
  notes: ChartNoteMark[];
  /** First point of a trendline being drawn; a preview follows the pointer from it */
  anchor: ChartPoint | null;
  /** A drawing tool is active: clicks on the price panel go to onPick */
  drawing: boolean;
  onPick: (point: ChartPoint) => void;
  /** Recent setups, as labelled arrows under their bars */
  setupMarks: ChartSetupMark[];
  /** The setup picked to show: shaded bars plus its key prices */
  highlight: ChartHighlight | null;
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
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const timesRef = useRef<number[]>([]);
  const priceLines = useRef<IPriceLine[]>([]);
  const lineSeries = useRef<ISeriesApi<"Line">[]>([]);
  const draft = useRef<ISeriesApi<"Line"> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const shade = useRef<ISeriesApi<"Histogram"> | null>(null);
  const highlightLines = useRef<IPriceLine[]>([]);
  const focusedKey = useRef<string | null>(null);
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

    // Shading behind a picked setup's bars: full-height columns on their own hidden scale,
    // added before the candles so it's drawn underneath them
    shade.current = c.addSeries(HistogramSeries, {
      priceScaleId: "shade", lastValueVisible: false, priceLineVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
    });
    c.priceScale("shade").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });

    candles.current = c.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    // Volume shares the price panel on its own hidden scale, kept to the bottom fifth
    volume.current = c.addSeries(HistogramSeries, {
      priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });
    c.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    markers.current = createSeriesMarkers(candles.current, []);

    /** Bar and price under the pointer on the price panel */
    const pointAt = (p: MouseEventParams<Time>): ChartPoint | null => {
      if (!p.point || p.logical === undefined || (p.paneIndex ?? 0) !== 0 || !barCount.current) return null;
      const price = candles.current?.coordinateToPrice(p.point.y);
      if (price === null || price === undefined || !(price > 0)) return null;
      return { index: Math.min(Math.max(Math.round(p.logical), 0), barCount.current - 1), price };
    };
    // Changing a series' data makes the library report the crosshair again, so the preview is
    // only redrawn when its end moves, and never from inside its own redraw
    let previewEnd = "";
    let redrawing = false;
    const onMove = (p: MouseEventParams<Time>) => {
      hoverRef.current(p.time === undefined || p.logical === undefined ? null : Math.round(p.logical));
      // While a trendline is being drawn, a dashed preview runs from its first point to the pointer
      const from = anchorRef.current;
      const to = from && pointAt(p);
      if (!from || !to || !draft.current || redrawing) return;
      const end = `${from.index}:${from.price}>${to.index}:${to.price}`;
      if (end === previewEnd) return;
      previewEnd = end;
      redrawing = true;
      try { setLine(draft.current, from, to); } finally { redrawing = false; }
    };
    // Drawing clicks are read from pointer events rather than the library's click event, which
    // drops a second click made within half a second of the first (quickly drawn trendlines).
    // A press that moves more than a few pixels is a drag to scroll, not a click.
    const el = container.current;
    let press: { id: number; x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { press = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      const start = press;
      press = null;
      if (!drawingRef.current || !start || start.id !== e.pointerId || !barCount.current) return;
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 6) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < 0 || y > c.panes()[0].getHeight()) return; // only the price panel
      const logical = c.timeScale().coordinateToLogical(x);
      const price = candles.current?.coordinateToPrice(y);
      if (logical === null || price === null || price === undefined || !(price > 0)) return;
      pickRef.current({ index: Math.min(Math.max(Math.round(logical), 0), barCount.current - 1), price });
    };
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointerup", onUp, true);
    // The "Latest" button appears once the newest bar has scrolled out of view
    const onRange = (r: LogicalRange | null) => setAwayFromLatest(!!r && !showsLatest(r, barCount.current));
    c.subscribeCrosshairMove(onMove);
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.current = c;
    const series = extra.current;

    return () => {
      c.unsubscribeCrosshairMove(onMove);
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointerup", onUp, true);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      c.remove();
      chart.current = candles.current = volume.current = draft.current = null;
      markers.current = null;
      series.clear();
      priceLines.current = [];
      highlightLines.current = [];
      shade.current = null;
      focusedKey.current = null;
      lineSeries.current = [];
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
    timesRef.current = data.times;
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

  // Support / resistance and the reader's levels, as horizontal lines across the price panel.
  // Detected levels are dashed and thin; the reader's own are solid.
  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    priceLines.current.forEach((l) => s.removePriceLine(l));
    const { up, down } = colors.current;
    priceLines.current = levels.map((l) => {
      const color = l.role === "support" ? up : down;
      return s.createPriceLine({
        price: l.price,
        color: l.manual ? color : withAlpha(color, 0.75),
        lineWidth: l.manual ? 2 : 1,
        lineStyle: l.manual ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.title,
      });
    });
  }, [levels, data]);

  // Trendlines, each a two-point line between the bars it was drawn on
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    lineSeries.current.forEach((s) => c.removeSeries(s));
    lineSeries.current = trendlines.map((t) => {
      const s = c.addSeries(LineSeries, {
        color: colorOf(DRAW_COLOR), lineWidth: 2, lastValueVisible: false, priceLineVisible: false,
        crosshairMarkerVisible: false, pointMarkersVisible: true, pointMarkersRadius: 3, ...NO_AUTOSCALE,
      });
      setLine(s, t.a, t.b);
      return s;
    });
  }, [trendlines, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview while a trendline is being drawn
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (anchor && !draft.current) {
      draft.current = c.addSeries(LineSeries, {
        color: colorOf(DRAW_COLOR), lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: false,
        priceLineVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true, ...NO_AUTOSCALE,
      });
    } else if (!anchor && draft.current) {
      c.removeSeries(draft.current);
      draft.current = null;
    }
    if (anchor && draft.current) setLine(draft.current, anchor, anchor);
  }, [anchor, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notes as dots above their bars, recent setups as arrows below theirs
  useEffect(() => {
    const noteColor = colorOf(NOTE_COLOR);
    const setupColor = colorOf(SETUP_COLOR);
    const t = (i: number) => data.times[i] as UTCTimestamp;
    markers.current?.setMarkers(
      [
        ...notes.map((n) => ({ order: n.index, marker: { id: n.id, time: t(n.index), position: "aboveBar" as const, shape: "circle" as const, color: noteColor, text: shorten(n.text) } })),
        ...setupMarks.map((m) => ({ order: m.index, marker: { id: m.id, time: t(m.index), position: "belowBar" as const, shape: "arrowUp" as const, color: setupColor, text: m.text } })),
      ]
        .filter((m) => m.order >= 0 && m.order < data.times.length)
        .sort((a, b) => a.order - b.order)
        .map((m) => m.marker)
    );
  }, [notes, setupMarks, data]);

  // A picked setup: shade its bars, draw its key prices, and bring it into view once
  useEffect(() => {
    const c = chart.current, s = candles.current, sh = shade.current;
    if (!c || !s || !sh) return;
    highlightLines.current.forEach((l) => s.removePriceLine(l));
    highlightLines.current = [];
    const n = data.times.length;
    if (!highlight || highlight.from > n - 1) {
      sh.setData([]);
      focusedKey.current = null;
      return;
    }
    const from = Math.max(0, highlight.from), to = Math.min(n - 1, highlight.to);
    const fill = withAlpha(colorOf(SETUP_COLOR), 0.1);
    sh.setData(Array.from({ length: to - from + 1 }, (_, k) => ({ time: data.times[from + k] as UTCTimestamp, value: 1, color: fill })));
    const setupColor = colorOf(SETUP_COLOR), { down } = colors.current;
    highlightLines.current = highlight.lines.map((l) => s.createPriceLine({
      price: l.price,
      color: l.kind === "invalidation" ? down : setupColor,
      lineWidth: 1,
      lineStyle: l.kind === "invalidation" ? LineStyle.Dotted : LineStyle.Solid,
      axisLabelVisible: true,
      title: l.label,
    }));
    if (focusedKey.current !== highlight.key) {
      focusedKey.current = highlight.key;
      const view = c.timeScale().getVisibleLogicalRange();
      if (view && (from < view.from || to > view.to)) {
        // Keep the zoom, and centre the setup's bars
        const width = Math.max(view.to - view.from, to - from + 20);
        const mid = (from + to) / 2;
        c.timeScale().setVisibleLogicalRange({ from: mid - width / 2, to: mid + width / 2 });
      }
    }
  }, [highlight, data]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Points a line from one bar to another; the library needs them in time order */
  function setLine(s: ISeriesApi<"Line">, a: ChartPoint, b: ChartPoint) {
    const t = (i: number) => timesRef.current[i] as UTCTimestamp;
    const [p, q] = a.index <= b.index ? [a, b] : [b, a];
    s.setData(p.index === q.index ? [{ time: t(p.index), value: p.price }] : [{ time: t(p.index), value: p.price }, { time: t(q.index), value: q.price }]);
  }

  function showLatest() {
    const n = barCount.current;
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - INITIAL_BARS), to: n + 3 });
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={container} role="img" aria-label={label} className="absolute inset-0" style={drawing ? { cursor: "crosshair" } : undefined} />
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
