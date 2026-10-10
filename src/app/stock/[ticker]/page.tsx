"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getChart, getFundamentals, getQuote } from "@/lib/data";
import { loadPortfolio, loadWatchlists } from "@/lib/store";
import { computeTechnicals, smaOverlay, Technicals } from "@/lib/indicators";
import { ChartData, ChartRange, Fundamentals, PortfolioPosition, QuoteData, ResearchMinutes, Sourced } from "@/lib/types";
import { formatLargeNumber, formatVolume } from "@/lib/formatters";
import { useMoney, useSettings } from "@/hooks/useSettings";
import SourceTag from "@/components/SourceTag";
import PriceChart, { RANGE_LABELS } from "@/components/research/PriceChart";

// ── Research modes ──────────────────────────────────────────────────────────

const MODES: { value: ResearchMinutes; label: string; title: string; blurb: string }[] = [
  { value: 5,  label: "5 min",  title: "Quick look", blurb: "Price, trend and the handful of numbers that matter most." },
  { value: 15, label: "15 min", title: "Standard",   blurb: "Adds valuation, profitability, growth, full technicals and analyst targets." },
  { value: 30, label: "30 min", title: "Deep dive",  blurb: "Adds financial health, dividends, ownership and risk, volume, and the business profile." },
];

// ── Formatting helpers ──────────────────────────────────────────────────────

const NA = "—";
const pct = (v: number | null, digits = 1) => (v === null ? NA : `${(v * 100).toFixed(digits)}%`);
const signedPct = (v: number | null, digits = 1) => (v === null ? NA : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const num = (v: number | null, digits = 2) => (v === null ? NA : v.toFixed(digits));
const tone = (v: number | null): Tone => (v === null ? "neutral" : v > 0 ? "good" : v < 0 ? "bad" : "neutral");

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

// ── Building blocks ─────────────────────────────────────────────────────────

type Tone = "good" | "bad" | "warn" | "neutral";
const TONE: Record<Tone, string> = {
  good: "text-[#16A34A]",
  bad: "text-[#DC2626]",
  warn: "text-[#D97706]",
  neutral: "text-[#525252]",
};

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  hintTone?: Tone;
  valueTone?: Tone;
  src: string;
}

function Stat({ label, value, hint, hintTone = "neutral", valueTone, src }: StatProps) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider truncate">{label}</p>
      <p className={`text-[18px] font-bold tabular-nums mt-0.5 ${valueTone ? TONE[valueTone] : "text-[#0A0A0A]"}`}>{value}</p>
      {hint && <p className={`text-[12px] font-medium ${TONE[hintTone]}`}>{hint}</p>}
      <p className="text-[10px] text-[#A3A3A3] mt-0.5 truncate" title={src}>{src}</p>
    </div>
  );
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
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

function StatGroup({ title, stats }: { title: string; stats: StatProps[] }) {
  // Hide groups with no data at all (e.g. ETFs have no margins)
  if (stats.every((s) => s.value === NA)) return null;
  return (
    <div>
      <p className="text-[12px] font-bold text-[#0A0A0A] mb-3">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        {stats.map((s) => <Stat key={s.label} {...s} />)}
      </div>
    </div>
  );
}

function RangeBar({ low, high, value, labels }: { low: number; high: number; value: number; labels: [string, string] }) {
  const pos = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 50;
  return (
    <div>
      <div className="relative h-1.5 bg-[#EBEBEB] rounded-full">
        <div className="absolute h-1.5 rounded-full bg-gradient-to-r from-[#FCA5A5] via-[#D4D4D4] to-[#86EFAC]" style={{ width: "100%" }} />
        <div className="absolute w-3 h-3 -top-[3px] rounded-full bg-[#0A0A0A] border-2 border-white shadow" style={{ left: `calc(${pos}% - 6px)` }} />
      </div>
      <div className="flex justify-between text-[11px] text-[#525252] mt-1.5 tabular-nums">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  );
}

function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="bg-black/[0.04] rounded-xl animate-pulse" style={{ height: h }} />;
}

// ── Interpretations (factual, not advice) ───────────────────────────────────

function rsiHint(v: number | null): [string, Tone] {
  if (v === null) return ["", "neutral"];
  if (v >= 70) return ["Overbought (≥70)", "warn"];
  if (v <= 30) return ["Oversold (≤30)", "warn"];
  return ["Neutral range", "neutral"];
}

function vsAverage(price: number, avg: number | null): [string, Tone] {
  if (avg === null) return ["Not enough history", "neutral"];
  const d = ((price - avg) / avg) * 100;
  return [`Price ${d >= 0 ? "above" : "below"} by ${Math.abs(d).toFixed(1)}%`, d >= 0 ? "good" : "bad"];
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function StockResearchPage({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  const { settings } = useSettings();
  const money = useMoney();

  const [mode, setMode] = useState<ResearchMinutes | null>(null);
  const [range, setRange] = useState<ChartRange>("6mo");
  const [quote, setQuote] = useState<Sourced<QuoteData> | null | undefined>(undefined);
  const [fund, setFund] = useState<Sourced<Fundamentals> | null | undefined>(undefined);
  const [daily, setDaily] = useState<Sourced<ChartData> | null | undefined>(undefined);
  const [weekly, setWeekly] = useState<Sourced<ChartData> | null | undefined>(undefined);
  const [holdings, setHoldings] = useState<PortfolioPosition[]>([]);
  const [inLists, setInLists] = useState<string[]>([]);

  // Default depth comes from the investor profile; the toggle overrides it for this visit
  useEffect(() => {
    if (settings && mode === null) setMode(settings.profile.researchMinutes);
  }, [settings, mode]);

  useEffect(() => {
    getQuote(ticker).then(setQuote);
    getFundamentals(ticker).then(setFund);
    getChart(ticker, "2y").then(setDaily); // one daily series feeds 1M–1Y views and the indicators
    loadPortfolio().then((p) => setHoldings(p.filter((x) => x.ticker === ticker)));
    loadWatchlists().then((ls) => setInLists(ls.filter((l) => l.tickers.includes(ticker)).map((l) => l.name)));
  }, [ticker]);

  useEffect(() => {
    if (range === "5y" && weekly === undefined) getChart(ticker, "5y").then(setWeekly);
  }, [range, weekly, ticker]);

  const m = mode ?? 15;
  const show = (min: ResearchMinutes) => m >= min;
  // 5Y is a deep-dive view; drop back to 1Y if the user switches down
  const effectiveRange: ChartRange = range === "5y" && !show(30) ? "1y" : range;

  const tech: Technicals | null = useMemo(
    () => (daily?.value ? computeTechnicals(daily.value.points.filter((p) => p.c !== null)) : null),
    [daily]
  );

  const chartRows = useMemo(() => {
    if (effectiveRange === "5y") {
      return (weekly?.value.points ?? []).map((p) => ({ ...p, sma50: null, sma200: null }));
    }
    const pts = daily?.value.points ?? [];
    const s50 = smaOverlay(pts, 50);
    const s200 = smaOverlay(pts, 200);
    const months = { "1mo": 1, "3mo": 3, "6mo": 6, "1y": 12, "2y": 24 }[effectiveRange];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cut = cutoff.toISOString().slice(0, 10);
    return pts
      .map((p, i) => ({ ...p, sma50: s50[i], sma200: s200[i] }))
      .filter((p) => p.t >= cut);
  }, [daily, weekly, effectiveRange]);

  const q = quote?.value;
  const f = fund?.value;
  const price = q?.price ?? tech?.last ?? null;
  const up = (q?.changePercent ?? 0) >= 0;
  const name = f?.name ?? q?.name ?? ticker;
  const ccy = f?.currency ?? "USD";
  const sym = ccy === "USD" ? "$" : `${ccy} `;
  const px = (v: number | null) => (v === null ? NA : `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const qSrc = quote ? quote.source : "";
  const fSrc = fund ? fund.source : "";
  const tSrc = daily ? `Calculated from ${daily.source} daily prices` : "";

  const earningsDays = daysUntil(f?.events.earningsDate ?? null);
  const exDivDays = daysUntil(f?.events.exDividendDate ?? null);
  const divDays = daysUntil(f?.events.dividendDate ?? null);
  const upside = f?.analysts.targetMean && price ? (f.analysts.targetMean - price) / price : null;

  // Portfolio context
  const shares = holdings.reduce((s, h) => s + h.quantity, 0);
  const cost = holdings.reduce((s, h) => s + h.quantity * h.purchasePrice, 0);
  const holdingPL = price !== null && shares ? price * shares - cost : null;

  const notFound = quote !== undefined && (!q || q.price === null) && fund === null && daily === null;

  if (notFound) {
    return (
      <div className="max-w-xl mx-auto text-center py-24">
        <h1 className="text-[28px] font-black text-[#0A0A0A]">No data for {ticker}</h1>
        <p className="text-[14px] text-[#525252] mt-2">Check the symbol, or the data providers may be unavailable right now.</p>
        <Link href="/" className="inline-block mt-6 px-4 py-2 bg-[#1F65F0] text-white text-[14px] font-semibold rounded-xl">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto">
      {/* ── Header ── */}
      <button onClick={() => history.back()} className="text-[13px] font-medium text-[#525252] hover:text-[#0A0A0A] mb-4">← Back</button>

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[36px] font-black tracking-tight text-[#0A0A0A] leading-none">{ticker}</h1>
            {f?.exchange && <span className="text-[11px] font-semibold text-[#525252] bg-white border border-[#E5E5E5] px-2 py-1 rounded-lg">{f.exchange}</span>}
            {f?.profile.sector && <span className="text-[11px] font-semibold text-[#525252] bg-white border border-[#E5E5E5] px-2 py-1 rounded-lg">{f.profile.sector}</span>}
          </div>
          <p className="text-[15px] text-[#525252] mt-2 truncate">{name}</p>
          <div className="flex items-baseline gap-3 mt-3 flex-wrap">
            <span className="text-[32px] font-bold tabular-nums text-[#0A0A0A]">{quote === undefined ? "…" : px(price)}</span>
            {q?.change !== null && q?.changePercent !== null && q && (
              <span className={`text-[16px] font-semibold tabular-nums ${up ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                {up ? "+" : ""}{q.change!.toFixed(2)} ({up ? "+" : ""}{q.changePercent!.toFixed(2)}%) today
              </span>
            )}
          </div>
          {quote && <SourceTag className="mt-1" source={quote.source} asOf={quote.asOf} cached={quote.cached} />}
        </div>

        <div className="lg:text-right">
          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-2">Research time</p>
          <div className="inline-flex items-center bg-[#EBEBEB] rounded-xl p-1 gap-0.5">
            {MODES.map((o) => (
              <button
                key={o.value}
                onClick={() => setMode(o.value)}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  m === o.value ? "bg-white text-[#0A0A0A] font-semibold shadow-sm border border-[#E5E5E5]" : "text-[#525252] hover:text-[#0A0A0A]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-[#525252] mt-2 max-w-xs lg:ml-auto">
            <span className="font-semibold text-[#0A0A0A]">{MODES.find((o) => o.value === m)?.title}:</span>{" "}
            {MODES.find((o) => o.value === m)?.blurb}
          </p>
        </div>
      </div>

      {/* ── Your position / watchlists ── */}
      {(shares > 0 || inLists.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {shares > 0 && (
            <span className="text-[13px] bg-[#EBF2FF] text-[#1F65F0] border border-[#C7DAFE] px-3 py-1.5 rounded-xl font-medium">
              You own {shares} share{shares !== 1 ? "s" : ""} · avg cost {px(cost / shares)}
              {holdingPL !== null && (
                <> · <span className={holdingPL >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}>{holdingPL >= 0 ? "+" : ""}{money.fmt(holdingPL)}</span></>
              )}
            </span>
          )}
          {inLists.map((l) => (
            <span key={l} className="text-[13px] bg-white text-[#525252] border border-[#E5E5E5] px-3 py-1.5 rounded-xl font-medium">
              In watchlist: {l}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: chart + deeper sections ── */}
        <div className="lg:col-span-2 space-y-5">
          <Section
            title="Price chart"
            right={
              <div className="flex items-center bg-[#F0F0F0] rounded-lg p-0.5">
                {RANGE_LABELS.filter((r) => r.value !== "5y" || show(30)).map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value)}
                    className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                      effectiveRange === r.value ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#525252] hover:text-[#0A0A0A]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            }
          >
            {daily === undefined || (effectiveRange === "5y" && weekly === undefined) ? (
              <Skeleton h={300} />
            ) : (
              <PriceChart
                rows={chartRows}
                range={effectiveRange}
                showSma={show(15) && effectiveRange !== "5y"}
                showVolume={show(30)}
                currencySymbol={sym}
              />
            )}
            {(effectiveRange === "5y" ? weekly : daily) && (
              <SourceTag
                className="mt-3"
                source={`${(effectiveRange === "5y" ? weekly : daily)!.source} · ${effectiveRange === "5y" ? "weekly" : "daily"} closes`}
                asOf={(effectiveRange === "5y" ? weekly : daily)!.asOf}
                cached={(effectiveRange === "5y" ? weekly : daily)!.cached}
              />
            )}
          </Section>

          {/* Technicals */}
          {show(15) && (
            <Section title="Technical indicators" subtitle="Computed from daily closing prices. Describes the chart, not where it goes next.">
              {!tech ? (
                daily === undefined ? <Skeleton /> : <p className="text-[13px] text-[#A3A3A3]">Not enough price history.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                  <Stat label="20-day avg" value={px(tech.sma20)} hint={vsAverage(tech.last, tech.sma20)[0]} hintTone={vsAverage(tech.last, tech.sma20)[1]} src={tSrc} />
                  <Stat label="50-day avg" value={px(tech.sma50)} hint={vsAverage(tech.last, tech.sma50)[0]} hintTone={vsAverage(tech.last, tech.sma50)[1]} src={tSrc} />
                  <Stat label="200-day avg" value={px(tech.sma200)} hint={vsAverage(tech.last, tech.sma200)[0]} hintTone={vsAverage(tech.last, tech.sma200)[1]} src={tSrc} />
                  <Stat label="RSI (14)" value={num(tech.rsi14, 1)} hint={rsiHint(tech.rsi14)[0]} hintTone={rsiHint(tech.rsi14)[1]} src={tSrc} />
                  <Stat
                    label="MACD"
                    value={num(tech.macd)}
                    hint={tech.macdCross ? `${tech.macdCross.dir === "bullish" ? "Bullish" : "Bearish"} cross ${tech.macdCross.barsAgo === 0 ? "today" : `${tech.macdCross.barsAgo}d ago`}` : tech.macd !== null && tech.macdSignal !== null ? (tech.macd > tech.macdSignal ? "Above signal line" : "Below signal line") : ""}
                    hintTone={tech.macdCross ? (tech.macdCross.dir === "bullish" ? "good" : "bad") : "neutral"}
                    src={tSrc}
                  />
                  <Stat
                    label="Volume vs 50d avg"
                    value={tech.volumeRatio === null ? NA : `${tech.volumeRatio.toFixed(2)}×`}
                    hint={tech.volumeRatio === null ? "" : tech.volumeRatio >= 1.5 ? "Unusually high" : tech.volumeRatio <= 0.6 ? "Unusually low" : "Normal"}
                    hintTone={tech.volumeRatio !== null && (tech.volumeRatio >= 1.5 || tech.volumeRatio <= 0.6) ? "warn" : "neutral"}
                    src={tSrc}
                  />
                  <Stat label="From 52-wk high" value={tech.pctFromHigh52 === null ? NA : `${tech.pctFromHigh52.toFixed(1)}%`} hint={`High ${px(tech.high52)}`} src={tSrc} />
                  <Stat label="Daily range (ATR)" value={tech.atrPct === null ? NA : `${tech.atrPct.toFixed(1)}%`} hint="Typical daily move" src={tSrc} />
                </div>
              )}
            </Section>
          )}

          {/* Fundamentals */}
          {show(15) && (
            <Section title="Fundamentals" subtitle={show(30) ? "Valuation, profitability, growth, balance sheet, dividends and ownership." : "Valuation, profitability and growth."}>
              {fund === undefined ? <Skeleton h={200} /> : !f ? (
                <p className="text-[13px] text-[#A3A3A3]">Fundamentals aren&apos;t available for this symbol.</p>
              ) : (
                <div className="space-y-6">
                  <StatGroup title="Valuation" stats={[
                    { label: "P/E (trailing)", value: num(f.valuation.trailingPE, 1), src: fSrc },
                    { label: "P/E (forward)", value: num(f.valuation.forwardPE, 1), src: fSrc },
                    { label: "Price / sales", value: num(f.valuation.priceToSales, 1), src: fSrc },
                    { label: "Price / book", value: num(f.valuation.priceToBook, 1), src: fSrc },
                    ...(show(30) ? [
                      { label: "Enterprise value", value: formatLargeNumber(f.valuation.enterpriseValue).replace("N/A", NA), src: fSrc },
                      { label: "EV / EBITDA", value: num(f.valuation.evToEbitda, 1), src: fSrc },
                    ] : []),
                  ]} />
                  <StatGroup title="Profitability" stats={[
                    { label: "Gross margin", value: pct(f.profitability.grossMargin), src: fSrc },
                    { label: "Operating margin", value: pct(f.profitability.operatingMargin), src: fSrc },
                    { label: "Net margin", value: pct(f.profitability.profitMargin), src: fSrc },
                    { label: "Return on equity", value: pct(f.profitability.returnOnEquity), src: fSrc },
                  ]} />
                  <StatGroup title="Growth (year over year)" stats={[
                    { label: "Revenue growth", value: signedPct(f.growth.revenueGrowth), valueTone: tone(f.growth.revenueGrowth), src: fSrc },
                    { label: "Earnings growth", value: signedPct(f.growth.earningsGrowth), valueTone: tone(f.growth.earningsGrowth), src: fSrc },
                    { label: "Quarterly EPS growth", value: signedPct(f.growth.earningsQuarterlyGrowth), valueTone: tone(f.growth.earningsQuarterlyGrowth), src: fSrc },
                    { label: "Revenue (TTM)", value: formatLargeNumber(f.growth.totalRevenue).replace("N/A", NA), src: fSrc },
                  ]} />
                  {show(30) && (
                    <>
                      <StatGroup title="Financial health" stats={[
                        { label: "Cash", value: formatLargeNumber(f.health.totalCash).replace("N/A", NA), src: fSrc },
                        { label: "Debt", value: formatLargeNumber(f.health.totalDebt).replace("N/A", NA), src: fSrc },
                        // Yahoo reports debt/equity as a percentage (150 = 1.5×)
                        { label: "Debt / equity", value: f.health.debtToEquity === null ? NA : `${(f.health.debtToEquity / 100).toFixed(2)}×`, src: fSrc },
                        { label: "Current ratio", value: num(f.health.currentRatio), hint: f.health.currentRatio !== null && f.health.currentRatio < 1 ? "Short-term liabilities exceed assets" : undefined, hintTone: "warn", src: fSrc },
                        { label: "Free cash flow", value: formatLargeNumber(f.health.freeCashflow).replace("N/A", NA), valueTone: tone(f.health.freeCashflow), src: fSrc },
                      ]} />
                      <StatGroup title="Dividend" stats={[
                        { label: "Yield", value: pct(f.dividend.yield, 2), src: fSrc },
                        { label: "Annual dividend", value: f.dividend.rate === null ? NA : px(f.dividend.rate), src: fSrc },
                        { label: "Payout ratio", value: pct(f.dividend.payoutRatio), hint: f.dividend.payoutRatio !== null && f.dividend.payoutRatio > 0.8 ? "Pays out most earnings" : undefined, hintTone: "warn", src: fSrc },
                      ]} />
                      <StatGroup title="Ownership & risk" stats={[
                        { label: "Beta", value: num(f.risk.beta), hint: f.risk.beta === null ? undefined : f.risk.beta > 1.3 ? "More volatile than market" : f.risk.beta < 0.7 ? "Less volatile than market" : "Moves roughly with market", src: fSrc },
                        { label: "Short % of float", value: pct(f.risk.shortPercentOfFloat), hint: f.risk.shortPercentOfFloat !== null && f.risk.shortPercentOfFloat > 0.1 ? "Heavily shorted" : undefined, hintTone: "warn", src: fSrc },
                        { label: "Institutions", value: pct(f.risk.heldByInstitutions), src: fSrc },
                        { label: "Insiders", value: pct(f.risk.heldByInsiders), src: fSrc },
                      ]} />
                    </>
                  )}
                  <SourceTag source={fund!.source} asOf={fund!.asOf} cached={fund!.cached} />
                </div>
              )}
            </Section>
          )}

          {/* Company profile */}
          {show(30) && f?.profile.summary && (
            <Section title={`About ${name}`}>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[#525252] mb-3">
                {f.profile.industry && <span><span className="font-semibold text-[#0A0A0A]">Industry:</span> {f.profile.industry}</span>}
                {f.profile.employees && <span><span className="font-semibold text-[#0A0A0A]">Employees:</span> {f.profile.employees.toLocaleString()}</span>}
                {f.profile.country && <span><span className="font-semibold text-[#0A0A0A]">HQ:</span> {f.profile.country}</span>}
                {f.profile.website && <a href={f.profile.website} target="_blank" rel="noreferrer" className="text-[#1F65F0] hover:underline">{f.profile.website.replace(/^https?:\/\//, "")}</a>}
              </div>
              <p className="text-[14px] leading-relaxed text-[#262626]">{f.profile.summary}</p>
              <SourceTag className="mt-3" source={fund!.source} asOf={fund!.asOf} cached={fund!.cached} />
            </Section>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">
          <Section title="At a glance">
            {quote === undefined || daily === undefined ? <Skeleton h={220} /> : (
              <div className="space-y-5">
                {tech && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Trend</p>
                      <span className={`text-[13px] font-bold ${tech.trend === "Uptrend" ? "text-[#16A34A]" : tech.trend === "Downtrend" ? "text-[#DC2626]" : "text-[#D97706]"}`}>
                        {tech.trend === "Uptrend" ? "▲ " : tech.trend === "Downtrend" ? "▼ " : "◆ "}{tech.trend}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#525252]">
                      {tech.trend === "Uptrend" && "Price is above its 50-day average, which is above the 200-day."}
                      {tech.trend === "Downtrend" && "Price is below its 50-day average, which is below the 200-day."}
                      {tech.trend === "Mixed" && "Moving averages don't agree on a direction."}
                    </p>
                    <p className="text-[10px] text-[#A3A3A3] mt-0.5">{tSrc}</p>
                  </div>
                )}
                {(q?.weekLow52 ?? tech?.low52) !== null && (q?.weekHigh52 ?? tech?.high52) !== null && price !== null && (
                  <div>
                    <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-2">52-week range</p>
                    <RangeBar
                      low={(q?.weekLow52 ?? tech?.low52)!}
                      high={(q?.weekHigh52 ?? tech?.high52)!}
                      value={price}
                      labels={[px((q?.weekLow52 ?? tech?.low52)!), px((q?.weekHigh52 ?? tech?.high52)!)]}
                    />
                    <p className="text-[10px] text-[#A3A3A3] mt-0.5">{q?.weekLow52 != null ? qSrc : tSrc}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  {(q?.marketCap ?? f?.valuation.marketCap ?? null) !== null && (
                    <Stat label="Market cap" value={formatLargeNumber(q?.marketCap ?? f?.valuation.marketCap ?? null)} src={q?.marketCap != null ? qSrc : fSrc} />
                  )}
                  <Stat label="P/E" value={num(q?.pe ?? f?.valuation.trailingPE ?? null, 1)} src={q?.pe != null ? qSrc : fSrc} />
                  {tech && <Stat label="RSI (14)" value={num(tech.rsi14, 1)} hint={rsiHint(tech.rsi14)[0]} hintTone={rsiHint(tech.rsi14)[1]} src={tSrc} />}
                  <Stat
                    label="Volume"
                    value={formatVolume(q?.volume ?? null)}
                    hint={q?.volume && q?.avgVolume ? `${(q.volume / q.avgVolume).toFixed(1)}× average` : undefined}
                    hintTone={q?.volume && q?.avgVolume && q.volume / q.avgVolume >= 1.5 ? "warn" : "neutral"}
                    src={qSrc}
                  />
                  {f && f.dividend.yield !== null && <Stat label="Dividend yield" value={pct(f.dividend.yield, 2)} src={fSrc} />}
                  {f && f.risk.beta !== null && <Stat label="Beta" value={num(f.risk.beta)} src={fSrc} />}
                </div>
              </div>
            )}
          </Section>

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
                    detail: show(15)
                      ? [
                          f.events.epsEstimate !== null && `EPS est. ${px(f.events.epsEstimate)}`,
                          f.events.revenueEstimate !== null && `Revenue est. ${formatLargeNumber(f.events.revenueEstimate)}`,
                        ].filter(Boolean).join(" · ")
                      : "",
                  },
                  show(15) && f.events.exDividendDate && {
                    key: "exdiv",
                    title: "Ex-dividend date",
                    date: f.events.exDividendDate,
                    days: exDivDays,
                    badge: null,
                    detail: "Own shares before this date to receive the next dividend.",
                  },
                  show(15) && f.events.dividendDate && {
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
                <SourceTag source={fund!.source} asOf={fund!.asOf} cached={fund!.cached} />
              </div>
            )}
          </Section>

          {show(15) && f && f.analysts.targetMean !== null && price !== null && (
            <Section title="Analyst targets" subtitle={f.analysts.count ? `${f.analysts.count} analysts` : undefined}>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Mean target</p>
                  <p className="text-[22px] font-bold tabular-nums text-[#0A0A0A]">{px(f.analysts.targetMean)}</p>
                </div>
                {upside !== null && (
                  <p className={`text-[15px] font-bold ${upside >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                    {upside >= 0 ? "+" : ""}{(upside * 100).toFixed(1)}% vs price
                  </p>
                )}
              </div>
              {f.analysts.recommendation && (
                <p className="text-[13px] text-[#525252] mt-1">
                  Consensus: <span className="font-semibold text-[#0A0A0A] capitalize">{f.analysts.recommendation.replace(/_/g, " ")}</span>
                </p>
              )}
              {show(30) && f.analysts.targetLow !== null && f.analysts.targetHigh !== null && (
                <div className="mt-4">
                  <RangeBar
                    low={f.analysts.targetLow}
                    high={f.analysts.targetHigh}
                    value={price}
                    labels={[`Low ${px(f.analysts.targetLow)}`, `High ${px(f.analysts.targetHigh)}`]}
                  />
                  <p className="text-[11px] text-[#525252] mt-1">Dot shows today&apos;s price within the analysts&apos; range.</p>
                </div>
              )}
              <SourceTag className="mt-3" source={fund!.source} asOf={fund!.asOf} cached={fund!.cached} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
