"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCandles, getQuote } from "@/lib/data";
import { CandleSeries, TIMEFRAMES, Timeframe, isTimeframe, isValidTicker, timeframeInfo } from "@/lib/marketData/types";
import { toChartData } from "@/lib/marketData/clean";
import { IndicatorId, computeIndicators } from "@/lib/marketData/indicators";
import { analyseLevels, touchesAt } from "@/lib/marketData/levels";
import { chartTrend } from "@/lib/marketData/trend";
import {
  DEFAULT_SETUP_CONFIG, Detection, SETUP_INFO, SetupCheck, SetupConfig, SetupType, sanitizeSetupConfig, scanSetups, volumeRatios,
} from "@/lib/marketData/setups";
import { barStillForming } from "@/lib/marketData/time";
import { AnchorPoint, ChartAnnotations, NOTE_MAX, barIndexAt, emptyAnnotations } from "@/lib/marketData/annotations";
import { loadChartAnnotations, loadTradePlans, newId, saveChartAnnotations, saveTickerPlans } from "@/lib/store";
import { TradePlan, inferDirection, planFromSetup, planMetrics } from "@/lib/tradePlan";
import TradePlanCard, { PlanDraft, draftNumbers } from "@/components/chart/TradePlanCard";
import { QuoteData, Sourced } from "@/lib/types";
import { currencySymbol } from "@/lib/markets";
import SourceTag from "@/components/SourceTag";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TimeframePicker from "@/components/chart/TimeframePicker";
import OhlcvLegend from "@/components/chart/OhlcvLegend";
import IndicatorMenu from "@/components/chart/IndicatorMenu";
import IndicatorLegend from "@/components/chart/IndicatorLegend";
import { DEFAULT_INDICATORS, PANEL_HEIGHT, isIndicatorId, panelCount } from "@/components/chart/indicatorDefs";
import DrawTools, { drawHint } from "@/components/chart/DrawTools";
import TrendCard from "@/components/chart/TrendCard";
import LevelsCard, { LevelRow } from "@/components/chart/LevelsCard";
import DrawingsCard, { NoteRow, TrendlineRow } from "@/components/chart/DrawingsCard";
import SetupsCard, { SetupSelection, resolveTarget } from "@/components/chart/SetupsCard";
import {
  ChartFocus, ChartHighlight, ChartLevel, ChartNoteMark, ChartPlan, ChartPoint, ChartSetupMark, ChartTrendline, DrawTool, formatBarTime,
} from "@/components/chart/drawing";

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
const DETECTED_KEY = "chart_detected_levels";
const SETUP_RULES_KEY = "chart_setup_rules";

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
  const [touch, setTouch] = useState(false);
  const [showDetected, setShowDetected] = useState(true);
  // The reader's drawings for this ticker, and which ticker they were loaded for
  const [drawings, setDrawings] = useState<ChartAnnotations>(emptyAnnotations);
  const drawingsFor = useRef<string | null>(null);
  const [tool, setTool] = useState<DrawTool | null>(null);
  /** First point of a trendline being drawn */
  const [anchor, setAnchor] = useState<AnchorPoint | null>(null);
  /** Points placed so far with the Plan tool: entry, then stop (the target completes it) */
  const [planClicks, setPlanClicks] = useState<{ entry?: number; stop?: number; startTime?: number }>({});
  /** This ticker's saved trade plans, which ticker they were loaded for, and the one being written */
  const [plans, setPlans] = useState<TradePlan[]>([]);
  const plansFor = useRef<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  /** Saved plan shown on the chart */
  const [shownPlanId, setShownPlanId] = useState<string | null>(null);
  /** Bar a new note is being written for */
  const [noteTime, setNoteTime] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  /** Setup picked to show on the chart */
  const [selectedSetup, setSelectedSetup] = useState<SetupSelection | null>(null);
  /** Bar picked from a setup's candle list */
  const [focusBar, setFocusBar] = useState<ChartFocus | null>(null);
  /** The reader's setup rules (defaults unless changed) */
  const [setupRules, setSetupRules] = useState<SetupConfig>(DEFAULT_SETUP_CONFIG);

  // Remember the last timeframe, indicators and detected-levels choice across visits
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TIMEFRAME_KEY);
      if (isTimeframe(saved)) setTimeframe(saved);
      const ids: unknown = JSON.parse(localStorage.getItem(INDICATORS_KEY) ?? "null");
      if (Array.isArray(ids)) setEnabled(new Set(ids.filter(isIndicatorId)));
      if (localStorage.getItem(DETECTED_KEY) === "off") setShowDetected(false);
      const rules = localStorage.getItem(SETUP_RULES_KEY);
      if (rules) setSetupRules(sanitizeSetupConfig(JSON.parse(rules)));
    } catch {}
  }, []);

  // The price panel is shorter on a phone (matches CHART_HEIGHT); touch screens say "tap"
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let current = true;
    drawingsFor.current = null;
    setDrawings(emptyAnnotations());
    loadChartAnnotations(ticker).then((a) => {
      if (!current) return;
      setDrawings(a);
      drawingsFor.current = ticker;
    });
    return () => { current = false; };
  }, [ticker]);

  // This ticker's saved trade plans; a plan being written belongs to the ticker it was started on
  useEffect(() => {
    let current = true;
    plansFor.current = null;
    setPlans([]);
    setPlanDraft(null);
    setShownPlanId(null);
    loadTradePlans().then((all) => {
      if (!current) return;
      setPlans(all.filter((p) => p.ticker === ticker));
      plansFor.current = ticker;
    });
    return () => { current = false; };
  }, [ticker]);

  // A half-finished drawing or a picked setup doesn't carry over to another chart
  useEffect(() => {
    setTool(null);
    setAnchor(null);
    setPlanClicks({});
    setNoteTime(null);
    setSelectedSetup(null);
    setFocusBar(null);
  }, [ticker, timeframe]);

  // Esc puts the drawing tool away
  useEffect(() => {
    if (!tool && noteTime === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool(null);
      setAnchor(null);
      setPlanClicks({});
      setNoteTime(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, noteTime]);

  /** Changes and saves the drawings; ignored until this ticker's saved drawings have loaded */
  function editDrawings(change: (d: ChartAnnotations) => ChartAnnotations) {
    if (drawingsFor.current !== ticker) return;
    const next = change(drawings);
    setDrawings(next);
    saveChartAnnotations(ticker, next).catch(() => {});
  }

  function chooseTool(next: DrawTool | null) {
    setTool(next);
    setAnchor(null);
    setPlanClicks({});
    if (next) setNoteTime(null);
  }

  /** Replaces this ticker's saved plans; ignored until they have loaded */
  function savePlans(next: TradePlan[]) {
    if (plansFor.current !== ticker) return;
    setPlans(next);
    saveTickerPlans(ticker, next).catch(() => {});
  }

  function chooseSetupRules(next: SetupConfig) {
    setSetupRules(next);
    try { localStorage.setItem(SETUP_RULES_KEY, JSON.stringify(next)); } catch {}
  }

  function chooseShowDetected(on: boolean) {
    setShowDetected(on);
    try { localStorage.setItem(DETECTED_KEY, on ? "on" : "off"); } catch {}
  }

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
  const fmtPrice = (v: number) => `${sym}${v.toFixed(priceDigits)}`;
  const lastClose = candles.length ? candles[candles.length - 1].close : 0;

  // ── Support / resistance, trend and the reader's drawings for the bars on screen ──
  const analysis = useMemo(() => (chartData ? analyseLevels(chartData.candles) : null), [chartData]);
  const trend = useMemo(() => (chartData && analysis ? chartTrend(chartData.candles, analysis.pivots) : null), [chartData, analysis]);

  const levelRows = useMemo<LevelRow[]>(() => {
    if (!analysis) return [];
    const rows: LevelRow[] = [];
    if (showDetected) {
      for (const role of ["support", "resistance"] as const) {
        analysis[role].forEach((l, i) => rows.push({
          id: `detected-${role}-${i}`, price: l.price, role, manual: false, label: "", touches: l.touches, lastIndex: l.lastIndex,
        }));
      }
    }
    for (const l of drawings.levels) {
      const t = touchesAt(analysis, l.price);
      rows.push({ id: l.id, price: l.price, role: l.price < lastClose ? "support" : "resistance", manual: true, label: l.label, ...t });
    }
    return rows;
  }, [analysis, showDetected, drawings.levels, lastClose]);

  const chartLevels = useMemo<ChartLevel[]>(() => levelRows.map((r) => ({
    id: r.id, price: r.price, role: r.role, manual: r.manual,
    title: r.manual ? (r.label ? r.label.slice(0, 16) : "Your level") : `${r.touches} touches`,
  })), [levelRows]);

  // Trendlines and notes belong to the timeframe they were drawn on
  const barsTf = s?.timeframe ?? timeframe;
  const slack = timeframeInfo(barsTf).seconds / 2;
  const drawn = useMemo(() => {
    const times = chartData?.times ?? [];
    const at = (t: number) => barIndexAt(times, t, slack);
    const lines: TrendlineRow[] = [];
    const onChartLines: ChartTrendline[] = [];
    for (const t of drawings.trendlines.filter((x) => x.timeframe === barsTf)) {
      const ia = at(t.a.time), ib = at(t.b.time);
      lines.push({ id: t.id, a: t.a, b: t.b, bars: ia === null || ib === null ? null : ib - ia });
      if (ia !== null && ib !== null && ia !== ib) onChartLines.push({ id: t.id, a: { index: ia, price: t.a.price }, b: { index: ib, price: t.b.price } });
    }
    const notes: NoteRow[] = [];
    const marks: ChartNoteMark[] = [];
    for (const n of drawings.notes.filter((x) => x.timeframe === barsTf).sort((a, b) => a.time - b.time)) {
      const i = at(n.time);
      notes.push({ id: n.id, time: n.time, text: n.text, onChart: i !== null });
      if (i !== null) marks.push({ id: n.id, index: i, text: n.text });
    }
    const elsewhere = TIMEFRAMES.filter((t) => t.value !== barsTf)
      .map((t) => ({
        label: t.label,
        count: drawings.trendlines.filter((x) => x.timeframe === t.value).length + drawings.notes.filter((x) => x.timeframe === t.value).length,
      }))
      .filter((e) => e.count > 0);
    return { lines, onChartLines, notes, marks, elsewhere };
  }, [chartData, drawings.trendlines, drawings.notes, barsTf, slack]);

  // ── Setups: judged on every recent bar, using only the bars up to each one ──
  const setupOpts = useMemo(
    () => ({ config: setupRules, intraday: barsIntraday, timeZone: s?.timeZone }),
    [setupRules, barsIntraday, s?.timeZone]
  );
  const setups = useMemo(
    () => (chartData ? scanSetups(chartData.candles, (v) => `${sym}${v.toFixed(priceDigits)}`, setupOpts) : []),
    [chartData, sym, priceDigits, setupOpts]
  );
  const volRatio = useMemo(() => (chartData ? volumeRatios(chartData.candles, setupOpts) : []), [chartData, setupOpts]);
  // Whether the newest bar is still trading (re-checked with each refresh of the bars)
  const latestForming = useMemo(() => {
    if (!chartData?.candles.length || !s) return false;
    const last = chartData.candles[chartData.candles.length - 1];
    return barStillForming(last.time, timeframeInfo(s.timeframe).seconds, barsIntraday, s.timeZone, Date.now() / 1000);
  }, [chartData, s, barsIntraday]);

  // Arrows under recent setups (grey once invalidated) and under the one picked to show, plus
  // dots on the earlier bars that formed its support or resistance level
  const setupMarks = useMemo<ChartSetupMark[]>(() => {
    const marks: ChartSetupMark[] = [];
    for (const sm of setups) {
      const picked = selectedSetup?.type === sm.type ? resolveTarget(sm, selectedSetup.target) : null;
      const d = picked?.detection ?? (picked ? null : sm.recent);
      if (d) marks.push({ id: `setup-${sm.type}`, index: d.start, text: SETUP_INFO[sm.type].short, kind: "setup", muted: d.status.kind !== "valid" });
      if (picked) {
        for (const e of picked.check.evidence) {
          if (e.role.startsWith("Turned at")) marks.push({ id: `touch-${sm.type}-${e.index}`, index: e.index, text: "", kind: "touch" });
        }
      }
    }
    return marks;
  }, [setups, selectedSetup]);

  const highlight = useMemo<ChartHighlight | null>(() => {
    const sm = selectedSetup && setups.find((x) => x.type === selectedSetup.type);
    if (!sm || !selectedSetup) return null;
    const { check, detection } = resolveTarget(sm, selectedSetup.target);
    return {
      key: `${sm.type}:${detection ? detection.start : "latest"}:${check.index}`,
      from: Math.min(check.range[0], detection?.start ?? check.range[0]),
      to: check.range[1],
      lines: [
        ...check.levels.map((l) => ({ price: l.price, label: l.label, kind: "level" as const })),
        ...(check.invalidation.price !== null ? [{ price: check.invalidation.price, label: "Invalidation", kind: "invalidation" as const }] : []),
      ],
    };
  }, [selectedSetup, setups]);

  // Memoised so hovering (which re-renders the page) doesn't reset the trendline preview
  const anchorPoint = useMemo<ChartPoint | null>(() => {
    const i = anchor && chartData ? barIndexAt(chartData.times, anchor.time, slack) : null;
    return anchor && i !== null ? { index: i, price: anchor.price } : null;
  }, [anchor, chartData, slack]);

  /** A click on the price panel with a drawing tool active */
  function pick(p: ChartPoint) {
    if (!chartData || !s) return;
    const time = chartData.times[p.index];
    const price = Number(p.price.toFixed(priceDigits));
    if (time === undefined || !(price > 0)) return;
    if (tool === "level") {
      editDrawings((d) => ({ ...d, levels: [...d.levels, { id: newId(), price, label: "" }] }));
      setTool(null);
    } else if (tool === "trendline") {
      if (!anchor) { setAnchor({ time, price }); return; }
      if (anchor.time === time) return; // a line needs two different bars
      const end = { time, price };
      const [a, b] = anchor.time < time ? [anchor, end] : [end, anchor];
      editDrawings((d) => ({ ...d, trendlines: [...d.trendlines, { id: newId(), timeframe: s.timeframe, a, b }] }));
      setAnchor(null);
      setTool(null);
    } else if (tool === "note") {
      setNoteTime(time);
      setNoteText("");
      setTool(null);
    } else if (tool === "plan") {
      // Entry, then stop, then target; the zones start at the bar the entry was placed on
      if (planClicks.entry === undefined) { setPlanClicks({ entry: price, startTime: chartData.candles[p.index].time }); return; }
      if (planClicks.stop === undefined) { if (price !== planClicks.entry) setPlanClicks({ ...planClicks, stop: price }); return; }
      if (price === planClicks.entry) return;
      const { entry, stop } = planClicks;
      setPlanDraft({
        id: null, direction: inferDirection(entry, stop, price),
        entry: String(entry), stop: String(stop), target: String(price), shares: "", note: "",
        startTime: planClicks.startTime ?? chartData.candles[p.index].time, source: null, why: [],
      });
      setShownPlanId(null);
      setPlanClicks({});
      setTool(null);
      revealPlanCard();
    }
  }

  // ── Trade plans ──
  const round = (v: number) => Number(v.toFixed(priceDigits));
  const money = (v: number) => `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /** On a phone the plan card sits below the chart; bring it into view */
  function revealPlanCard() {
    requestAnimationFrame(() => document.getElementById("trade-plan")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function newPlan() {
    if (!chartData?.candles.length) return;
    const n = chartData.candles.length;
    setPlanDraft({
      id: null, direction: "long", entry: String(round(lastClose)), stop: "", target: "", shares: "", note: "",
      startTime: chartData.candles[Math.max(0, n - 21)].time, source: null, why: ["Entry: the latest close. Add your stop and target."],
    });
    setShownPlanId(null);
  }

  function planSetup(type: SetupType, check: SetupCheck, detection: Detection | null) {
    if (!chartData || !analysis) return;
    const start = detection?.start ?? check.index;
    const r = planFromSetup({
      lastClose,
      invalidation: check.invalidation.price,
      resistanceAbove: [...analysis.resistance.map((l) => l.price), ...drawings.levels.map((l) => l.price)],
      round,
    });
    setPlanDraft({
      id: null, direction: "long",
      entry: String(r.entry), stop: r.stop === null ? "" : String(r.stop), target: r.target === null ? "" : String(r.target),
      shares: "", note: "", startTime: chartData.candles[start].time,
      source: { setup: type, detected: formatBarTime(chartData.times[start], barsIntraday) }, why: r.why,
    });
    setShownPlanId(null);
    revealPlanCard();
  }

  function savePlan() {
    if (!planDraft || !s) return;
    const nums = draftNumbers(planDraft);
    if (planMetrics(nums).problems.length) return;
    const now = new Date().toISOString();
    const existing = planDraft.id ? plans.find((p) => p.id === planDraft.id) : undefined;
    const plan: TradePlan = {
      id: existing?.id ?? newId(),
      ticker,
      currency: s.currency ?? null,
      direction: nums.direction,
      entry: nums.entry!, stop: nums.stop!, target: nums.target!,
      shares: nums.shares && nums.shares > 0 ? nums.shares : null,
      note: planDraft.note.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      startTime: planDraft.startTime,
      source: planDraft.source,
    };
    savePlans(existing ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan]);
    setPlanDraft(null);
    setShownPlanId(plan.id);
  }

  function editPlan(p: TradePlan) {
    setPlanDraft({
      id: p.id, direction: p.direction, entry: String(p.entry), stop: String(p.stop), target: String(p.target),
      shares: p.shares === null ? "" : String(p.shares), note: p.note, startTime: p.startTime, source: p.source, why: [],
    });
    setShownPlanId(null);
  }

  function deletePlan(id: string) {
    savePlans(plans.filter((p) => p.id !== id));
    if (shownPlanId === id) setShownPlanId(null);
    if (planDraft?.id === id) setPlanDraft(null);
  }

  // What the chart shows: the plan being written, else the plan tool's first clicks, else a saved plan
  const chartPlan = useMemo<ChartPlan | null>(() => {
    if (!chartData?.candles.length) return null;
    const saved = shownPlanId ? plans.find((p) => p.id === shownPlanId) : undefined;
    const src = planDraft
      ? { ...draftNumbers(planDraft), startTime: planDraft.startTime }
      : tool === "plan" && planClicks.entry !== undefined
        ? { direction: "long" as const, entry: planClicks.entry, stop: planClicks.stop ?? null, target: null, startTime: planClicks.startTime ?? 0 }
        : saved ?? null;
    const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
    if (!src || !ok(src.entry)) return null;
    const entry = src.entry;
    const stop = ok(src.stop) ? src.stop : null, target = ok(src.target) ? src.target : null;
    const direction = stop !== null && target !== null ? inferDirection(entry, stop, target) : src.direction;
    const pct = (v: number) => `${v >= entry ? "+" : "−"}${(Math.abs(v - entry) / entry * 100).toFixed(1)}%`;
    const rr = stop !== null && target !== null && stop !== entry ? Math.abs(target - entry) / Math.abs(entry - stop) : null;
    // The zones start at the last bar at or before the plan's start
    const times = chartData.candles;
    let fromIndex = 0;
    for (let i = times.length - 1; i >= 0; i--) if (times[i].time <= src.startTime) { fromIndex = i; break; }
    return {
      direction, entry, stop, target, fromIndex,
      titles: {
        entry: `${direction === "long" ? "Long" : "Short"} entry`,
        stop: stop !== null ? `Stop ${pct(stop)}` : "Stop",
        target: target !== null ? `Target ${pct(target)}${rr !== null ? ` · ${rr.toFixed(1)}R` : ""}` : "Target",
      },
    };
  }, [chartData, planDraft, tool, planClicks, shownPlanId, plans]);

  function saveNote() {
    const text = noteText.trim();
    if (noteTime === null || !text || !s) return;
    editDrawings((d) => ({ ...d, notes: [...d.notes, { id: newId(), timeframe: s.timeframe, time: noteTime, text }] }));
    setNoteTime(null);
    setNoteText("");
  }

  const ready = !!(s && chartData && candles.length);

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

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      {/* ── Chart ── */}
      <section className="min-w-0 border border-[#E5E5E5] rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap mb-2">
          <TimeframePicker value={timeframe} onChange={chooseTimeframe} />
          <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
            {loading && series !== undefined && <span className="text-[12px] text-[#A3A3A3]">Loading {info.label} bars…</span>}
            {ready && <DrawTools tool={tool} onChange={chooseTool} />}
            <IndicatorMenu enabled={enabled} intraday={info.intraday} onToggle={toggleIndicator} />
          </div>
        </div>

        {tool && (
          <p className="mb-2 text-[12px] text-[#0A0A0A] bg-[#F5F5F5] rounded-lg px-3 py-1.5" role="status">
            {drawHint(tool, tool === "plan" ? (planClicks.entry === undefined ? 0 : planClicks.stop === undefined ? 1 : 2) : anchor ? 1 : 0, touch)} <span className="text-[#525252]">{touch ? "Tap the tool again" : "Esc"} to cancel.</span>
          </p>
        )}
        {noteTime !== null && (
          <form
            className="mb-2 flex items-center gap-2 flex-wrap bg-[#F5F5F5] rounded-lg px-3 py-2"
            onSubmit={(e) => { e.preventDefault(); saveNote(); }}
          >
            <label htmlFor="new-note" className="text-[12px] font-semibold text-[#0A0A0A] shrink-0">
              Note for {formatBarTime(noteTime, timeframeInfo(barsTf).intraday)}
            </label>
            <input
              id="new-note" autoFocus maxLength={NOTE_MAX} value={noteText} onChange={(e) => setNoteText(e.target.value)}
              placeholder="What do you see here?"
              className="flex-1 min-w-[160px] px-2 py-1 text-[13px] bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]"
            />
            <button type="submit" disabled={!noteText.trim()} className="px-3 py-1 text-[12px] font-semibold bg-[#2D8CFF] text-white rounded-full disabled:opacity-40">Save</button>
            <button type="button" onClick={() => setNoteTime(null)} className="text-[12px] font-semibold text-[#2D8CFF] hover:underline">Cancel</button>
          </form>
        )}

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
                levels={chartLevels}
                trendlines={drawn.onChartLines}
                notes={drawn.marks}
                anchor={anchorPoint}
                drawing={tool !== null}
                onPick={pick}
                setupMarks={setupMarks}
                highlight={highlight}
                focus={focusBar}
                plan={chartPlan}
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

      {/* ── Beside the chart (below it on narrower screens) ── */}
      {ready && s && chartData && analysis && trend && (
        <aside className="space-y-4 min-w-0" aria-label="Chart analysis">
          <TrendCard trend={trend} times={chartData.times} intraday={barsIntraday} timeframeLabel={timeframeInfo(s.timeframe).label} price={fmtPrice} />
          <SetupsCard
            summaries={setups}
            candles={chartData.candles}
            volRatio={volRatio}
            times={chartData.times}
            intraday={barsIntraday}
            timeframeLabel={timeframeInfo(s.timeframe).label}
            latestForming={latestForming}
            price={fmtPrice}
            config={setupRules}
            onConfigChange={chooseSetupRules}
            selected={selectedSetup}
            onSelect={setSelectedSetup}
            onFocusBar={(index) => setFocusBar({ index, key: Date.now() })}
            onPlan={planSetup}
          />
          <div id="trade-plan" className="scroll-mt-4">
            <TradePlanCard
              ticker={ticker}
              plans={plans}
              draft={planDraft}
              onDraftChange={setPlanDraft}
              onSave={savePlan}
              onNew={newPlan}
              onEdit={editPlan}
              onDelete={deletePlan}
              shownId={shownPlanId}
              onShow={setShownPlanId}
              latest={lastClose}
              price={fmtPrice}
              money={money}
            />
          </div>
          <LevelsCard
            rows={levelRows}
            showDetected={showDetected}
            onShowDetected={chooseShowDetected}
            lastClose={lastClose}
            digits={priceDigits}
            price={fmtPrice}
            times={chartData.times}
            intraday={barsIntraday}
            barsLooked={candles.length - analysis.from}
            onAdd={(price, label) => editDrawings((d) => ({ ...d, levels: [...d.levels, { id: newId(), price, label }] }))}
            onUpdate={(id, price, label) => editDrawings((d) => ({ ...d, levels: d.levels.map((l) => (l.id === id ? { ...l, price, label } : l)) }))}
            onRemove={(id) => editDrawings((d) => ({ ...d, levels: d.levels.filter((l) => l.id !== id) }))}
          />
          <DrawingsCard
            timeframeLabel={timeframeInfo(s.timeframe).label}
            trendlines={drawn.lines}
            notes={drawn.notes}
            elsewhere={drawn.elsewhere}
            intraday={barsIntraday}
            price={fmtPrice}
            onRemoveTrendline={(id) => editDrawings((d) => ({ ...d, trendlines: d.trendlines.filter((t) => t.id !== id) }))}
            onUpdateNote={(id, text) => editDrawings((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, text } : n)) }))}
            onRemoveNote={(id) => editDrawings((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }))}
          />
        </aside>
      )}
      </div>
    </div>
  );
}
