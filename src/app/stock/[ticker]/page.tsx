"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getChart, getFinancials, getFundamentals, getNews, getQuote } from "@/lib/data";
import { loadPortfolio, loadWatchlists } from "@/lib/store";
import { computeTechnicals, smaOverlay, Technicals } from "@/lib/indicators";
import { ChartData, ChartRange, FinancialHistory as FinHistory, Fundamentals, NewsFeed, PortfolioPosition, QuoteData, Sourced, Watchlist } from "@/lib/types";
import WatchButton, { watchedIn } from "@/components/WatchButton";
import { formatVolume } from "@/lib/formatters";
import { currencySymbol, defaultCurrency, formatBig } from "@/lib/markets";
import { historicalPE, longTermVerdict, researchSummary, swingVerdict } from "@/lib/analysis";
import {
  Call, Rated, Rating, ScoredTab, Signal, overallCall, pegRatio, rateAnalystUpside, rateBeta, rateCross, rateCurrentRatio,
  rateDebtToEquity, rateDrawdown, rateEarningsSoon, rateEvToEbitda, rateForwardPE, rateFreeCashFlow, rateFromHigh,
  rateGrossMargin, rateGrowth, rateMACD, rateNetCash, rateNetMargin, rateOperatingMargin, ratePayout, ratePE, ratePEG,
  ratePEvsHistory, ratePriceToBook, ratePriceToSales, ratePriceVsAverage, rateROE, rateRSI, rateShortInterest, rateTrend,
  rateVolatility, signalOf, signalTone, DEFAULT_BENCHMARKS,
} from "@/lib/ratings";
import FinancialHistory from "@/components/research/FinancialHistory";
import { ResearchSummaryView, Verdicts } from "@/components/research/Verdicts";
import { useMoney, useSettings } from "@/hooks/useSettings";
import SourceTag from "@/components/SourceTag";
import PriceChart, { RANGE_LABELS } from "@/components/research/PriceChart";
import NewsList from "@/components/research/NewsList";
import { STAT_HELP } from "@/lib/statHelp";

// ── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = "overview" | ScoredTab | "news";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "valuation", label: "Valuation" },
  { key: "technical", label: "Technical" },
  { key: "risks", label: "Risks" },
  { key: "news", label: "News" },
];
// How each scored tab reads in the verdict sentence, and whether it takes "look" or "looks"
const TAB_PHRASE: Record<ScoredTab, [string, boolean]> = {
  financials: ["financials", true],
  valuation: ["valuation", false],
  technical: ["technicals", true],
  risks: ["risk profile", false],
};

// ── Formatting helpers ──────────────────────────────────────────────────────

const NA = "—";
const pct = (v: number | null, digits = 1) => (v === null ? NA : `${(v * 100).toFixed(digits)}%`);
const signedPct = (v: number | null, digits = 1) => (v === null ? NA : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const num = (v: number | null, digits = 2) => (v === null ? NA : v.toFixed(digits));

// Event dates arrive as YYYY-MM-DD calendar dates; read them as local midnight, not UTC
const localDate = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s);

function fmtDate(iso: string | null) {
  if (!iso) return NA;
  return localDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const d = localDate(iso); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

function relDays(n: number | null) {
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 0) return `in ${n} days`;
  return `${-n} days ago`;
}

function joinWords(words: string[]) {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// ── Colours: green good, grey neutral, red bad ──────────────────────────────

const TEXT: Record<Rating, string> = { good: "text-[#00A13A]", neutral: "text-[#737373]", bad: "text-[#E8461C]" };
const DOT: Record<Rating, string> = { good: "bg-[#00B341]", neutral: "bg-[#A3A3A3]", bad: "bg-[#F04E23]" };
const CALL_STYLE: Record<Call, string> = {
  Buy: "bg-[#00B341] text-white",
  Hold: "bg-[#737373] text-white",
  Sell: "bg-[#F04E23] text-white",
};

// ── Building blocks ─────────────────────────────────────────────────────────

interface MetricDef {
  label: string;
  value: string;
  /** Coloured good / neutral / bad with a reason; leave out for plain facts */
  rated?: Rated | null;
  /** Grey context line for unrated facts */
  hint?: string;
}
interface Group { title: string; metrics: MetricDef[] }

function Metric({ label, value, rated, hint }: MetricDef) {
  const help = STAT_HELP[label];
  const [open, setOpen] = useState(false);
  const labelCls = "text-[11px] font-semibold text-[#525252] uppercase tracking-wider truncate max-w-full";
  const valueCls = value === NA ? "text-[#A3A3A3]" : rated ? TEXT[rated.rating] : "text-[#0A0A0A]";
  return (
    <div className="min-w-0">
      {help ? (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`${labelCls} block text-left underline decoration-dotted decoration-[#A3A3A3] underline-offset-[3px] hover:text-[#0A0A0A]`}>
          {label}
        </button>
      ) : <p className={labelCls}>{label}</p>}
      <p className={`text-[18px] font-bold tabular-nums mt-0.5 ${valueCls}`}>{value}</p>
      {rated && value !== NA && <p className={`text-[12px] font-medium leading-snug ${TEXT[rated.rating]}`}>{rated.note}</p>}
      {!rated && hint && <p className="text-[12px] text-[#525252] leading-snug">{hint}</p>}
      {open && help && <p className="text-[11px] leading-snug text-[#525252] bg-[#F7F7F8] rounded-lg px-2 py-1.5 mt-1">{help}</p>}
    </div>
  );
}

function SignalCounts({ s }: { s: Signal }) {
  return (
    <span className="text-[12px] tabular-nums whitespace-nowrap">
      <span className="text-[#00B341] font-semibold">{s.good} good</span>
      <span className="text-[#A3A3A3]"> · </span>
      <span className="text-[#737373] font-semibold">{s.neutral} neutral</span>
      <span className="text-[#A3A3A3]"> · </span>
      <span className="text-[#F04E23] font-semibold">{s.bad} bad</span>
    </span>
  );
}

function GroupCard({ group }: { group: Group }) {
  // Hide groups with no data at all (e.g. ETFs have no margins)
  if (group.metrics.every((m) => m.value === NA)) return null;
  const s = signalOf(group.metrics.map((m) => m.rated));
  const rated = s.good + s.neutral + s.bad;
  return (
    <Section title={group.title} right={rated > 0 ? <SignalCounts s={s} /> : undefined}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
        {group.metrics.map((m) => <Metric key={m.label} {...m} />)}
      </div>
    </Section>
  );
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-[#0A0A0A]">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#525252] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function RangeBar({ low, high, value, labels }: { low: number; high: number; value: number; labels: [string, string] }) {
  const pos = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 50;
  return (
    <div>
      <div className="relative h-1.5 bg-[#EBEBEB] rounded-full">
        <div className="absolute h-1.5 rounded-full bg-gradient-to-r from-[#FFC9B8] via-[#D4D4D4] to-[#6FD48F]" style={{ width: "100%" }} />
        <div className="absolute w-3 h-3 -top-[3px] rounded-full bg-[#2D8CFF] border-2 border-white shadow" style={{ left: `calc(${pos}% - 6px)` }} />
      </div>
      <div className="flex justify-between text-[11px] text-[#525252] mt-1.5 tabular-nums">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  );
}

const RANGE_WORDS: Partial<Record<ChartRange, string>> = { "1mo": "month", "3mo": "3 months", "6mo": "6 months", "1y": "year", "5y": "5 years" };

/** Accent-coloured text buttons with the chosen one filled */
function RangePills({ range, onChange }: { range: ChartRange; onChange: (r: ChartRange) => void }) {
  const on = "bg-[#2D8CFF] text-white";
  const off = "text-[#2D8CFF] hover:bg-[#EAF4FF]";
  return (
    <div className="flex items-center gap-1">
      {RANGE_LABELS.map((r) => (
        <button key={r.value} onClick={() => onChange(r.value)}
          className={`px-3 py-1 rounded-full text-[13px] font-bold transition-colors ${range === r.value ? on : off}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="bg-black/[0.04] rounded-xl animate-pulse" style={{ height: h }} />;
}

// ── Page ────────────────────────────────────────────────────────────────────

/** Next passes route params as a promise; use() reads it (the page suspends until it resolves) */
export default function StockResearchPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = decodeURIComponent(use(params).ticker).toUpperCase();
  const { settings } = useSettings();
  const money = useMoney();

  const [tab, setTabState] = useState<TabKey>("overview");
  const [range, setRange] = useState<ChartRange>("6mo");
  const [strategyOverride, setStrategy] = useState<"long-term" | "swing" | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [quote, setQuote] = useState<Sourced<QuoteData> | null | undefined>(undefined);
  const [fund, setFund] = useState<Sourced<Fundamentals> | null | undefined>(undefined);
  const [daily, setDaily] = useState<Sourced<ChartData> | null | undefined>(undefined);
  const [weekly, setWeekly] = useState<Sourced<ChartData> | null | undefined>(undefined);
  const [news, setNews] = useState<Sourced<NewsFeed> | null | undefined>(undefined);
  const [fin, setFin] = useState<Sourced<FinHistory> | null | undefined>(undefined);
  const [holdings, setHoldings] = useState<PortfolioPosition[]>([]);
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [showFullSummary, setShowFullSummary] = useState(false);

  // The open tab lives in the URL hash so refresh and back keep it
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (TABS.some((t) => t.key === h)) setTabState(h as TabKey);
  }, []);
  const setTab = (t: TabKey) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
  };

  useEffect(() => {
    getQuote(ticker).then(setQuote);
    getFundamentals(ticker).then(setFund);
    getChart(ticker, "2y").then(setDaily); // one daily series feeds 1M–2Y views and the indicators
    getChart(ticker, "5y").then(setWeekly); // the 5Y view, and year-end prices for historical P/E
    getFinancials(ticker).then(setFin);
    loadPortfolio().then((p) => setHoldings(p.filter((x) => x.ticker === ticker)));
    loadWatchlists().then(setLists);
  }, [ticker]);

  const { lists: onLists, item: watchItem } = watchedIn(lists, ticker);

  // News waits for the company name so headlines like "Nvidia beats…" are matched too
  const companyName = fund?.value.name ?? quote?.value.name;
  const namesReady = fund !== undefined && quote !== undefined;
  useEffect(() => {
    if (namesReady) getNews(ticker, companyName).then(setNews);
  }, [ticker, namesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const tech: Technicals | null = useMemo(
    () => (daily?.value ? computeTechnicals(daily.value.points.filter((p) => p.c !== null)) : null),
    [daily]
  );

  const chartRows = useMemo(() => {
    if (range === "5y") {
      return (weekly?.value.points ?? []).map((p) => ({ ...p, sma50: null, sma200: null }));
    }
    const pts = daily?.value.points ?? [];
    const s50 = smaOverlay(pts, 50);
    const s200 = smaOverlay(pts, 200);
    const months = { "1mo": 1, "3mo": 3, "6mo": 6, "1y": 12, "2y": 24 }[range];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cut = cutoff.toISOString().slice(0, 10);
    return pts
      .map((p, i) => ({ ...p, sma50: s50[i], sma200: s200[i] }))
      .filter((p) => p.t >= cut);
  }, [daily, weekly, range]);

  const q = quote?.value;
  const f = fund?.value;
  const price = q?.price ?? tech?.last ?? null;
  const up = (q?.changePercent ?? 0) >= 0;
  const name = f?.name ?? q?.name ?? ticker;
  const ccy = f?.currency ?? q?.currency ?? defaultCurrency(ticker);
  const sym = currencySymbol(ccy);
  const formatLargeNumber = (v: number | null) => formatBig(v, ccy).replace("N/A", NA);
  const exchange = f?.exchange || q?.exchange || null;
  const px = (v: number | null) => (v === null ? NA : `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  // Historical P/E divides a trading-currency price by reporting-currency EPS, so only when they match
  const sameCcy = !fin?.value.currency || fin.value.currency === ccy;

  // The stock's own watchlist strategy, then the investor profile, unless switched here
  const defaultStrategy: "long-term" | "swing" =
    watchItem?.intent === "swing" || watchItem?.intent === "long-term" ? watchItem.intent : settings?.profile.strategy === "swing" ? "swing" : "long-term";
  const strategy = strategyOverride ?? defaultStrategy;
  const bm = settings?.benchmarks ?? DEFAULT_BENCHMARKS;

  const analysis = useMemo(() => {
    if (quote === undefined || fund === undefined || daily === undefined || fin === undefined) return null;
    const input = {
      price,
      currency: ccy,
      fund: fund ?? null,
      fin: fin ?? null,
      tech,
      techSource: daily ? { label: `Calculated from ${daily.source} daily prices`, date: daily.asOf } : null,
      longPrices: sameCcy ? weekly?.value.points : undefined,
      news: news ?? null,
      baseCurrency: settings?.baseCurrency,
    };
    const long = longTermVerdict(input);
    const swing = swingVerdict(input);
    return { long, swing, summary: researchSummary(input, long, swing) };
  }, [quote, fund, daily, fin, weekly, news, tech, price, ccy, sameCcy, settings?.baseCurrency]);

  // Average P/E at the last 4 fiscal year-ends, for "cheap or dear versus itself"
  const peHistoryAvg = useMemo(() => {
    if (!fin || !weekly || !sameCcy) return null;
    const h = historicalPE(fin.value.years, weekly.value.points).slice(-4);
    return h.length >= 2 ? h.reduce((a, b) => a + b.pe, 0) / h.length : null;
  }, [fin, weekly, sameCcy]);

  const earningsDays = daysUntil(f?.events.earningsDate ?? null);
  const exDivDays = daysUntil(f?.events.exDividendDate ?? null);
  const divDays = daysUntil(f?.events.dividendDate ?? null);
  const upside = f?.analysts.targetMean && price ? (f.analysts.targetMean - price) / price : null;
  const pe = q?.pe ?? f?.valuation.trailingPE ?? null;
  const roe = f?.profitability.returnOnEquity ?? null;
  const revGrowth = f?.growth.revenueGrowth ?? null;
  const fromPrice = (v: number | null) => (v === null || price === null ? undefined : `${Math.abs(((v - price) / price) * 100).toFixed(1)}% ${v >= price ? "above" : "below"} price`);

  // ── Each tab's numbers, defined once so the colours and the call always agree ──

  const groups: Record<ScoredTab, Group[]> = {
    financials: f ? [
      { title: "Growth (year over year)", metrics: [
        { label: "Revenue growth", value: signedPct(revGrowth), rated: rateGrowth(revGrowth, bm) },
        { label: "Earnings growth", value: signedPct(f.growth.earningsGrowth), rated: rateGrowth(f.growth.earningsGrowth, bm) },
        { label: "Quarterly EPS growth", value: signedPct(f.growth.earningsQuarterlyGrowth), rated: rateGrowth(f.growth.earningsQuarterlyGrowth, bm) },
        { label: "Revenue (TTM)", value: formatLargeNumber(f.growth.totalRevenue) },
      ] },
      { title: "Profitability", metrics: [
        { label: "Gross margin", value: pct(f.profitability.grossMargin), rated: rateGrossMargin(f.profitability.grossMargin, bm) },
        { label: "Operating margin", value: pct(f.profitability.operatingMargin), rated: rateOperatingMargin(f.profitability.operatingMargin, bm) },
        { label: "Net margin", value: pct(f.profitability.profitMargin), rated: rateNetMargin(f.profitability.profitMargin, bm) },
        { label: "Return on equity", value: pct(roe), rated: rateROE(roe, bm) },
      ] },
      { title: "Financial health", metrics: [
        {
          label: "Cash vs debt",
          value: f.health.totalCash === null || f.health.totalDebt === null ? NA
            : `${f.health.totalCash >= f.health.totalDebt ? "+" : "−"}${formatLargeNumber(Math.abs(f.health.totalCash - f.health.totalDebt))}`,
          rated: rateNetCash(f.health.totalCash, f.health.totalDebt),
        },
        // Yahoo reports debt/equity as a percentage (150 = 1.5×)
        { label: "Debt / equity", value: f.health.debtToEquity === null ? NA : `${(f.health.debtToEquity / 100).toFixed(2)}×`, rated: rateDebtToEquity(f.health.debtToEquity === null ? null : f.health.debtToEquity / 100, bm) },
        { label: "Current ratio", value: num(f.health.currentRatio), rated: rateCurrentRatio(f.health.currentRatio, bm) },
        { label: "Free cash flow", value: formatLargeNumber(f.health.freeCashflow), rated: rateFreeCashFlow(f.health.freeCashflow) },
      ] },
    ] : [],

    valuation: f ? [
      { title: "Price multiples", metrics: [
        { label: "P/E (trailing)", value: num(pe, 1), rated: ratePE(pe, bm) },
        { label: "P/E (forward)", value: num(f.valuation.forwardPE, 1), rated: rateForwardPE(f.valuation.forwardPE, bm) },
        { label: "PEG ratio", value: num(pegRatio(pe, f.growth.earningsGrowth)), rated: ratePEG(pegRatio(pe, f.growth.earningsGrowth), bm) },
        { label: "P/E vs 4-yr avg", value: peHistoryAvg === null || pe === null ? NA : `${pe.toFixed(1)} vs ${peHistoryAvg.toFixed(1)}`, rated: ratePEvsHistory(pe, peHistoryAvg, bm) },
        { label: "Price / sales", value: num(f.valuation.priceToSales, 1), rated: ratePriceToSales(f.valuation.priceToSales, bm) },
        { label: "Price / book", value: num(f.valuation.priceToBook, 1), rated: ratePriceToBook(f.valuation.priceToBook, bm) },
        { label: "EV / EBITDA", value: num(f.valuation.evToEbitda, 1), rated: rateEvToEbitda(f.valuation.evToEbitda, bm) },
        { label: "Enterprise value", value: formatLargeNumber(f.valuation.enterpriseValue) },
      ] },
      { title: "Analyst targets", metrics: [
        { label: "Mean target", value: px(f.analysts.targetMean), rated: rateAnalystUpside(upside, bm) },
        { label: "Upside to target", value: signedPct(upside), rated: null, hint: f.analysts.count ? `${f.analysts.count} analysts` : undefined },
        { label: "Consensus", value: f.analysts.recommendation ? f.analysts.recommendation.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : NA },
        { label: "Target range", value: f.analysts.targetLow !== null && f.analysts.targetHigh !== null ? `${px(f.analysts.targetLow)}–${px(f.analysts.targetHigh)}` : NA },
      ] },
    ] : [],

    technical: tech ? [
      { title: "Trend & moving averages", metrics: [
        { label: "Trend", value: tech.trend, rated: rateTrend(tech.trend) },
        { label: "20-day EMA", value: px(tech.ema20), rated: ratePriceVsAverage(tech.last, tech.ema20) },
        { label: "50-day EMA", value: px(tech.ema50), rated: ratePriceVsAverage(tech.last, tech.ema50) },
        { label: "200-day avg", value: px(tech.sma200), rated: ratePriceVsAverage(tech.last, tech.sma200) },
        { label: "50 vs 200-day", value: tech.sma50 === null || tech.sma200 === null ? NA : tech.sma50 > tech.sma200 ? "Golden cross" : "Death cross", rated: rateCross(tech.sma50, tech.sma200) },
      ] },
      { title: "Momentum", metrics: [
        { label: "RSI (14)", value: num(tech.rsi14, 1), rated: rateRSI(tech.rsi14, bm) },
        { label: "MACD", value: num(tech.macd), rated: rateMACD(tech.macd, tech.macdSignal, tech.macdCross) },
        {
          label: "Volume vs 50d avg",
          value: tech.volumeRatio === null ? NA : `${tech.volumeRatio.toFixed(2)}×`,
          hint: tech.volumeRatio === null ? undefined : tech.volumeRatio >= 1.5 ? "Unusually high" : tech.volumeRatio <= 0.6 ? "Unusually low" : "Normal",
        },
        { label: "Daily range (ATR)", value: tech.atrPct === null ? NA : `${tech.atrPct.toFixed(1)}%`, hint: "Typical daily move" },
      ] },
      { title: "Support & resistance", metrics: [
        { label: "Support (3-mo low)", value: px(tech.support3m), hint: fromPrice(tech.support3m) },
        { label: "Resistance (3-mo high)", value: px(tech.resistance3m), hint: fromPrice(tech.resistance3m) },
        { label: "From 52-wk high", value: tech.pctFromHigh52 === null ? NA : `${tech.pctFromHigh52.toFixed(1)}%`, rated: rateFromHigh(tech.pctFromHigh52, bm) },
        { label: "From 52-wk low", value: tech.low52Pct === null ? NA : `+${tech.low52Pct.toFixed(1)}%`, hint: `Low ${px(tech.low52)}` },
      ] },
    ] : [],

    risks: [
      { title: "Market risk", metrics: [
        { label: "Beta", value: num(f?.risk.beta ?? null), rated: rateBeta(f?.risk.beta ?? null, bm) },
        { label: "Volatility (1y)", value: tech?.volatility1y == null ? NA : `${tech.volatility1y.toFixed(0)}%`, rated: rateVolatility(tech?.volatility1y ?? null, bm) },
        { label: "Max drawdown (1y)", value: tech?.maxDrawdown1y == null ? NA : `${tech.maxDrawdown1y.toFixed(1)}%`, rated: rateDrawdown(tech?.maxDrawdown1y ?? null, bm) },
        { label: "Short % of float", value: pct(f?.risk.shortPercentOfFloat ?? null), rated: rateShortInterest(f?.risk.shortPercentOfFloat ?? null, bm) },
      ] },
      { title: "Dividend & events", metrics: [
        { label: "Dividend yield", value: pct(f?.dividend.yield ?? null, 2) },
        { label: "Payout ratio", value: pct(f?.dividend.payoutRatio ?? null), rated: ratePayout(f?.dividend.payoutRatio ?? null, bm) },
        {
          label: "Next earnings",
          value: f?.events.earningsDate ? localDate(f.events.earningsDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : NA,
          rated: rateEarningsSoon(earningsDays),
          hint: relDays(earningsDays) || undefined,
        },
        { label: "Insiders own", value: pct(f?.risk.heldByInsiders ?? null), hint: f?.risk.heldByInstitutions != null ? `Institutions ${pct(f.risk.heldByInstitutions)}` : undefined },
      ] },
    ],
  };

  const signals = Object.fromEntries(
    (Object.keys(groups) as ScoredTab[]).map((k) => [k, signalOf(groups[k].flatMap((g) => g.metrics.map((m) => m.rated)))])
  ) as Record<ScoredTab, Signal>;
  const verdict = overallCall(signals, strategy, bm);
  const loadingCall = quote === undefined || fund === undefined || daily === undefined || fin === undefined || weekly === undefined;

  const verdictSentence = (() => {
    const tabs = Object.keys(TAB_PHRASE) as ScoredTab[];
    const strong = tabs.filter((t) => signalTone(signals[t], bm) === "good");
    const weak = tabs.filter((t) => signalTone(signals[t], bm) === "bad");
    const clause = (ts: ScoredTab[], word: string) =>
      `${joinWords(ts.map((t) => TAB_PHRASE[t][0]))} ${ts.length === 1 && !TAB_PHRASE[ts[0]][1] ? "looks" : "look"} ${word}`;
    const parts = [strong.length ? clause(strong, "strong") : "", weak.length ? clause(weak, "weak") : ""].filter(Boolean);
    const text = parts.length ? parts.join("; ") : "signals are mixed across the board";
    return text.charAt(0).toUpperCase() + text.slice(1) + ".";
  })();

  // Portfolio context
  const shares = holdings.reduce((s, h) => s + h.quantity, 0);
  const cost = holdings.reduce((s, h) => s + h.quantity * h.purchasePrice, 0);
  const holdingPL = price !== null && shares ? price * shares - cost : null;

  // Change over the chart's range, for the "past 6 months" line
  const periodPct = chartRows.length > 1 ? ((chartRows[chartRows.length - 1].c - chartRows[0].c) / chartRows[0].c) * 100 : null;
  const periodUp = periodPct === null ? up : periodPct >= 0;

  const notFound = quote !== undefined && (!q || q.price === null) && fund === null && daily === null;

  if (notFound) {
    return (
      <div className="max-w-xl mx-auto text-center py-24">
        <h1 className="text-[28px] font-semibold text-[#0A0A0A]">No data for {ticker}</h1>
        <p className="text-[14px] text-[#525252] mt-2">Check the symbol, or the data providers may be unavailable right now.</p>
        <Link href="/" className="inline-block mt-6 px-4 py-2 bg-[#2D8CFF] text-white text-[14px] font-semibold rounded-full">Back to dashboard</Link>
      </div>
    );
  }

  const chart = (showSma: boolean) => (
    <Section
      title="Price chart"
      right={
        <RangePills range={range} onChange={setRange} />
      }
    >
      {daily === undefined || (range === "5y" && weekly === undefined) ? (
        <Skeleton h={300} />
      ) : (
        <PriceChart rows={chartRows} range={range} showSma={showSma && range !== "5y"} showVolume={showSma} currencySymbol={sym} />
      )}
      {(range === "5y" ? weekly : daily) && (
        <SourceTag
          className="mt-3"
          source={`${(range === "5y" ? weekly : daily)!.source} · ${range === "5y" ? "weekly" : "daily"} closes`}
          asOf={(range === "5y" ? weekly : daily)!.asOf}
          cached={(range === "5y" ? weekly : daily)!.cached}
        />
      )}
    </Section>
  );

  const groupCards = (key: ScoredTab, loading: boolean, empty: string) =>
    loading ? <Skeleton h={220} /> : groups[key].length === 0 ? (
      <Section title={TABS.find((t) => t.key === key)!.label}><p className="text-[13px] text-[#A3A3A3]">{empty}</p></Section>
    ) : groups[key].map((g) => <GroupCard key={g.title} group={g} />);

  const sourceLine = (s: Sourced<unknown> | null | undefined) =>
    s ? <SourceTag source={s.source} asOf={s.asOf} cached={s.cached} /> : null;

  // ── Tab contents ──────────────────────────────────────────────────────────

  const callCard = (
    <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">The numbers say</p>
        <div className="inline-flex items-center rounded-full p-0.5 gap-0.5" role="group" aria-label="Judge as">
          {(["long-term", "swing"] as const).map((st) => (
            <button key={st} onClick={() => setStrategy(st)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium ${strategy === st ? "bg-[#2D8CFF] text-white font-semibold" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"}`}>
              {st === "long-term" ? "Long-term" : "Swing trade"}
            </button>
          ))}
        </div>
      </div>

      {loadingCall ? <div className="mt-4"><Skeleton h={160} /></div> : (
        <>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {verdict ? (
              <span className={`text-[28px] font-semibold tracking-tight px-5 py-1.5 rounded-2xl ${CALL_STYLE[verdict.call]}`}>{verdict.call.toUpperCase()}</span>
            ) : (
              <span className="text-[16px] font-bold px-4 py-2 rounded-2xl bg-[#F0F0F0] text-[#737373]">Not enough data</span>
            )}
            <p className="text-[14px] text-[#0A0A0A] font-medium flex-1 min-w-[200px]">
              {verdict ? verdictSentence : "Too few numbers are available to make a call on this symbol."}
            </p>
          </div>

          <div className="mt-5 divide-y divide-[#F0F0F0]">
            {(Object.keys(TAB_PHRASE) as ScoredTab[]).map((k) => {
              const s = signals[k];
              const n = s.good + s.neutral + s.bad;
              const t = signalTone(s, bm);
              return (
                <button key={k} onClick={() => setTab(k)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-[#FAFAFA] -mx-2 px-2 rounded-lg">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t ? DOT[t] : "bg-[#E5E5E5]"}`} aria-hidden />
                  <span className="text-[13px] font-semibold text-[#0A0A0A] w-24 shrink-0">{TABS.find((x) => x.key === k)!.label}</span>
                  <span className="flex-1 h-2 rounded-full overflow-hidden bg-[#F0F0F0] hidden sm:flex" aria-hidden>
                    {n > 0 && <>
                      <span className="bg-[#00B341]" style={{ width: `${(s.good / n) * 100}%` }} />
                      <span className="bg-[#D4D4D4]" style={{ width: `${(s.neutral / n) * 100}%` }} />
                      <span className="bg-[#F04E23]" style={{ width: `${(s.bad / n) * 100}%` }} />
                    </>}
                  </span>
                  {n > 0 ? <SignalCounts s={s} /> : <span className="text-[12px] text-[#A3A3A3]">No data</span>}
                  <span className="text-[#A3A3A3] text-[12px]">›</span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-[#737373] mt-4">
            Each tab&apos;s numbers are rated green, grey or red against your benchmarks, then weighted for a {strategy === "long-term" ? "long-term investor (business and valuation count most)" : "swing trader (the chart counts most)"}.
            A summary of the data, not financial advice.{" "}
            <Link href="/settings/benchmarks" className="font-semibold text-[#2D8CFF] hover:underline">Change the benchmarks</Link>
          </p>
          {analysis && (
            <div className="mt-3">
              <button onClick={() => setShowChecklist((v) => !v)} className="text-[12px] font-semibold text-[#2D8CFF] hover:underline">
                {showChecklist ? "Hide the strategy checklist" : "See the strategy checklist"}
              </button>
              {showChecklist && <div className="mt-3"><Verdicts long={analysis.long} swing={analysis.swing} primary={strategy} /></div>}
            </div>
          )}
        </>
      )}
    </section>
  );

  const eventsCard = (
    <Section title="Upcoming events">
      {fund === undefined ? <Skeleton h={120} /> : !f ? (
        <p className="text-[13px] text-[#A3A3A3]">No event data for this symbol.</p>
      ) : (
        <div className="space-y-4">
          {[
            f.events.earningsDate && {
              key: "earn",
              title: "Earnings report",
              date: f.events.earningsDate,
              days: earningsDays,
              badge: f.events.earningsIsEstimate ? "Estimated" : "Confirmed",
              detail: [
                f.events.epsEstimate !== null && `EPS est. ${px(f.events.epsEstimate)}`,
                f.events.revenueEstimate !== null && `Revenue est. ${formatLargeNumber(f.events.revenueEstimate)}`,
              ].filter(Boolean).join(" · "),
            },
            f.events.exDividendDate && {
              key: "exdiv",
              title: "Ex-dividend date",
              date: f.events.exDividendDate,
              days: exDivDays,
              badge: null,
              detail: "Own shares before this date to receive the next dividend.",
            },
            f.events.dividendDate && {
              key: "div",
              title: "Dividend payment",
              date: f.events.dividendDate,
              days: divDays,
              badge: null,
              detail: f.dividend.rate !== null ? `${px(f.dividend.rate)} per share annually` : "",
            },
          ]
            .filter((e): e is { key: string; title: string; date: string; days: number | null; badge: string | null; detail: string } => !!e)
            .map((e) => (
              <div key={e.key} className="flex items-start gap-3">
                <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[56px] border ${e.days !== null && e.days >= 0 && e.days <= 14 ? "bg-[#FFF7ED] border-[#FED7AA]" : "bg-[#F7F7F8] border-[#E5E5E5]"}`}>
                  <p className="text-[11px] font-bold text-[#0A0A0A]">{localDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  <p className="text-[10px] text-[#525252]">{e.days !== null && e.days >= 0 ? `${e.days}d` : "past"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#0A0A0A]">
                    {e.title}
                    {e.badge && <span className="ml-2 text-[10px] font-semibold text-[#525252] bg-[#F0F0F0] px-1.5 py-0.5 rounded">{e.badge}</span>}
                  </p>
                  <p className="text-[12px] text-[#525252]">{fmtDate(e.date)} · {relDays(e.days)}</p>
                  {e.detail && <p className="text-[12px] text-[#525252] mt-0.5">{e.detail}</p>}
                </div>
              </div>
            ))}
          {!f.events.earningsDate && !f.events.exDividendDate && (
            <p className="text-[13px] text-[#A3A3A3]">No scheduled events found.</p>
          )}
          {sourceLine(fund)}
        </div>
      )}
    </Section>
  );

  const aboutCard = (
    <Section title={`About ${name}`}>
      {fund === undefined ? <Skeleton h={120} /> : (
        <>
          {f?.profile.summary ? (
            <>
              <p className={`text-[14px] leading-relaxed text-[#262626] ${showFullSummary ? "" : "line-clamp-4"}`}>{f.profile.summary}</p>
              <button onClick={() => setShowFullSummary((v) => !v)} className="text-[12px] font-semibold text-[#2D8CFF] mt-1">{showFullSummary ? "Show less" : "Read more"}</button>
            </>
          ) : <p className="text-[13px] text-[#A3A3A3]">No business description available.</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#525252] mt-3">
            {f?.profile.industry && <span><span className="font-semibold text-[#0A0A0A]">Industry:</span> {f.profile.industry}</span>}
            {f?.profile.country && <span><span className="font-semibold text-[#0A0A0A]">HQ:</span> {f.profile.country}</span>}
            {f?.profile.employees && <span><span className="font-semibold text-[#0A0A0A]">Employees:</span> {f.profile.employees.toLocaleString()}</span>}
            {f?.profile.website && <a href={f.profile.website} target="_blank" rel="noreferrer" className="text-[#2D8CFF] hover:underline">{f.profile.website.replace(/^https?:\/\//, "")}</a>}
          </div>
          {fund && <div className="mt-2">{sourceLine(fund)}</div>}
        </>
      )}
    </Section>
  );

  const tabContent: Record<TabKey, React.ReactNode> = {
    overview: (
      <div className="space-y-5">
        {callCard}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Section title="Strengths & weaknesses">
              {analysis ? <ResearchSummaryView summary={analysis.summary} groups={["strengths", "weaknesses"]} limit={3} /> : <Skeleton h={160} />}
            </Section>
          </div>
          <div className="space-y-5">
            {eventsCard}
            {aboutCard}
          </div>
        </div>
      </div>
    ),

    financials: (
      <div className="space-y-5">
        {groupCards("financials", fund === undefined, "Fundamentals aren't available for this symbol.")}
        {f && <div>{sourceLine(fund)}</div>}
        <Section title="Financial history" subtitle="Reported annual figures.">
          {fin === undefined ? <Skeleton h={240} /> : !fin ? (
            <p className="text-[13px] text-[#A3A3A3]">No reported financials for this symbol (funds and some foreign listings don&apos;t have them).</p>
          ) : (
            <>
              <FinancialHistory
                years={fin.value.years}
                currency={fin.value.currency}
                prices={sameCcy ? weekly?.value.points : undefined}
                pe={f?.valuation.trailingPE ?? null}
              />
              {!sameCcy && (
                <p className="text-[11px] text-[#92400E] mt-2">Reports in {fin.value.currency} but trades in {ccy}, so historical P/E isn&apos;t shown.</p>
              )}
              <div className="mt-3">{sourceLine(fin)}</div>
            </>
          )}
        </Section>
      </div>
    ),

    valuation: (
      <div className="space-y-5">
        {groupCards("valuation", fund === undefined, "Valuation data isn't available for this symbol.")}
        {f && f.analysts.targetLow !== null && f.analysts.targetHigh !== null && price !== null && (
          <Section title="Today's price within the analysts' range">
            <RangeBar
              low={f.analysts.targetLow}
              high={f.analysts.targetHigh}
              value={price}
              labels={[`Low ${px(f.analysts.targetLow)}`, `High ${px(f.analysts.targetHigh)}`]}
            />
          </Section>
        )}
        {f && <div>{sourceLine(fund)}</div>}
      </div>
    ),

    technical: (
      <div className="space-y-5">
        {chart(true)}
        {groupCards("technical", daily === undefined, "Not enough price history to compute indicators.")}
        {tech && (
          <Section title="Returns" subtitle="Price change only, dividends excluded.">
            <div className="grid grid-cols-5 gap-2">
              {([["1M", tech.returns.m1], ["3M", tech.returns.m3], ["6M", tech.returns.m6], ["YTD", tech.returns.ytd], ["1Y", tech.returns.y1]] as const).map(([label, v]) => (
                <div key={label} className="rounded-xl bg-[#F7F7F8] px-2 py-2 text-center">
                  <p className="text-[11px] font-semibold text-[#525252]">{label}</p>
                  <p className={`text-[15px] font-bold tabular-nums ${v === null ? "text-[#A3A3A3]" : v > 0 ? "text-[#00B341]" : v < 0 ? "text-[#F04E23]" : "text-[#737373]"}`}>
                    {v === null ? NA : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}
        {daily && <p className="text-[10px] text-[#A3A3A3]">Calculated from {daily.source} daily prices</p>}
      </div>
    ),

    risks: (
      <div className="space-y-5">
        {groupCards("risks", fund === undefined || daily === undefined, "")}
        <Section title="Risks & weaknesses flagged">
          {analysis ? <ResearchSummaryView summary={analysis.summary} groups={["risks", "weaknesses"]} /> : <Skeleton h={160} />}
        </Section>
      </div>
    ),

    news: (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Section title="Latest news">
            {news === undefined ? <Skeleton h={160} /> : !news ? (
              <p className="text-[13px] text-[#A3A3A3]">News is unavailable right now.</p>
            ) : (
              <NewsList feed={news} limit={12} />
            )}
          </Section>
        </div>
        <div>
          <Section title="Catalysts" subtitle="Upcoming events and positive headlines that could move the price.">
            {analysis ? <ResearchSummaryView summary={analysis.summary} groups={["catalysts"]} /> : <Skeleton h={120} />}
          </Section>
        </div>
      </div>
    ),
  };

  const headline: MetricDef[] = [
    { label: "P/E", value: num(pe, 1), rated: ratePE(pe, bm) },
    { label: "Revenue growth", value: signedPct(revGrowth), rated: rateGrowth(revGrowth, bm) },
    { label: "Return on equity", value: pct(roe), rated: rateROE(roe, bm) },
    { label: "Trend", value: tech?.trend ?? NA, rated: rateTrend(tech?.trend ?? null) },
  ];

  return (
    <div className="max-w-[1280px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => window.history.back()} aria-label="Back" className="-ml-2 p-2 rounded-full text-[#2D8CFF] hover:bg-[#EAF4FF] transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 18l-6-6 6-6" /></svg>
        </button>
        {verdict && !loadingCall && (
          <button onClick={() => setTab("overview")} title={`${verdict.call} for a ${strategy === "long-term" ? "long-term investor" : "swing trader"}`}
            className={`shrink-0 text-[13px] font-bold tracking-wide px-4 py-1.5 rounded-full ${CALL_STYLE[verdict.call]}`}>
            {verdict.call.toUpperCase()}
          </button>
        )}
      </div>

      <section className="mb-4">
        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[13px]">
          <span className="font-semibold text-[#0A0A0A] tracking-wide">{ticker}</span>
          {exchange && <span className="text-[#737373]" title="Listing exchange and trading currency">{exchange} · {ccy}</span>}
          {f?.profile.sector && <span className="text-[#737373]">· {f.profile.sector}</span>}
          {settings && settings.baseCurrency !== ccy && (
            <span className="text-[11px] font-semibold text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full">Priced in {ccy}, your base is {settings.baseCurrency}</span>
          )}
        </div>
        <h1 className="text-[30px] sm:text-[36px] font-medium tracking-tight text-[#0A0A0A] leading-tight mt-1 truncate">{name}</h1>
        <p className="text-[30px] sm:text-[36px] font-medium tracking-tight tabular-nums text-[#0A0A0A] leading-tight">{quote === undefined ? "…" : px(price)}</p>
        {q && q.change !== null && q.changePercent !== null && (
          <p className="flex items-center gap-1.5 text-[14px] mt-1">
            <span className={`font-semibold tabular-nums ${up ? "text-[#00B341]" : "text-[#F04E23]"}`}>
              {up ? "▲" : "▼"} {sym}{Math.abs(q.change).toFixed(2)} ({Math.abs(q.changePercent).toFixed(2)}%)
            </span>
            <span className="text-[#525252]">Today</span>
          </p>
        )}
        {quote && <SourceTag className="mt-1" source={quote.source} asOf={quote.asOf} cached={quote.cached} />}

        <div className="mt-3">
          {daily === undefined || (range === "5y" && weekly === undefined) ? (
            <Skeleton h={240} />
          ) : (
            <PriceChart rows={chartRows} range={range} showSma={false} showVolume={false} currencySymbol={sym} minimal />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <RangePills range={range} onChange={setRange} />
          <span className="flex items-center gap-3 text-[13px]">
            {periodPct !== null && (
              <span>
                <span className={`font-semibold tabular-nums ${periodUp ? "text-[#00B341]" : "text-[#F04E23]"}`}>{periodUp ? "▲" : "▼"} {Math.abs(periodPct).toFixed(2)}%</span>
                <span className="text-[#525252]"> past {RANGE_WORDS[range]}</span>
              </span>
            )}
            <Link href={`/stock/${encodeURIComponent(ticker)}/chart`} className="font-semibold text-[#2D8CFF] hover:underline">
              Full chart →
            </Link>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 border-t border-[#F0F0F0] mt-4 pt-4">
          {headline.map((m) => <Metric key={m.label} {...m} />)}
        </div>

        {/* Your position, then your plan */}
        <div className="space-y-2 border-t border-[#F0F0F0] mt-4 pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            {shares > 0 && (
              <span className="text-[13px] bg-[#F7F7F8] text-[#0A0A0A] border border-[#E5E5E5] px-3 py-1.5 rounded-full font-medium">
                You own {shares} share{shares !== 1 ? "s" : ""} · avg cost {px(cost / shares)}
                {holdingPL !== null && (
                  <> · <span className={holdingPL >= 0 ? "text-[#00B341]" : "text-[#F04E23]"}>{holdingPL >= 0 ? "+" : ""}{money.fmt(holdingPL)}</span></>
                )}
              </span>
            )}
            <WatchButton
              ticker={ticker}
              lists={lists}
              defaultIntent={strategy}
              meta={{ exchange: exchange ?? undefined, currency: ccy, addedPrice: price ?? undefined }}
              onSaved={setLists}
            />
          </div>
          {watchItem && (watchItem.targetPrice != null || watchItem.invalidation != null || watchItem.thesis || watchItem.note) && (
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap bg-[#FAFAFA] border border-[#E5E5E5] rounded-xl px-3 py-2">
              <span className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Your note</span>
              {watchItem.targetPrice != null && (
                <span className="text-[12px] text-[#525252]">Target <span className="font-semibold text-[#0A0A0A]">{px(watchItem.targetPrice)}</span></span>
              )}
              {watchItem.invalidation != null && (
                <span className="text-[12px] text-[#525252]" title="The price at which your idea is wrong and you'd exit">Exit if below <span className="font-semibold text-[#0A0A0A]">{px(watchItem.invalidation)}</span></span>
              )}
              {(watchItem.thesis || watchItem.note) && (
                <span className="text-[13px] text-[#525252] italic truncate max-w-md" title={watchItem.thesis || watchItem.note}>&ldquo;{watchItem.thesis || watchItem.note}&rdquo;</span>
              )}
              {onLists.length > 0 && (
                <Link href="/watchlist" className="text-[12px] font-semibold text-[#2D8CFF] hover:underline ml-auto">Edit →</Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Tabs ── */}
      <div className="sticky top-14 lg:top-16 z-40 bg-white/95 backdrop-blur -mx-4 px-4 sm:mx-0 sm:px-0 py-2 mb-4 border-b border-[#F0F0F0]">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          {TABS.map((t) => {
            const tone = t.key !== "overview" && t.key !== "news" && !loadingCall ? signalTone(signals[t.key as ScoredTab], bm) : null;
            const active = tab === t.key;
            return (
              <button key={t.key} role="tab" aria-selected={active} onClick={() => setTab(t.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[14px] font-semibold transition-colors ${
                  active ? "bg-[#2D8CFF] text-white" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"
                }`}>
                {tone && <span className={`w-2 h-2 rounded-full ${DOT[tone]} ${active ? "ring-2 ring-white" : ""}`} aria-hidden />}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">{tabContent[tab]}</div>
    </div>
  );
}
