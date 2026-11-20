"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { formatPercent, formatVolume } from "@/lib/formatters";
import { formatBig, formatMoney, MARKETS } from "@/lib/markets";
import SourceTag from "@/components/SourceTag";
import WatchButton from "@/components/WatchButton";
import { SWING_PRESETS, LONG_TERM_PRESETS, Setup, Reason, Signals, evaluate, contextReasons, Holding, normaliseSector } from "@/lib/rules";
import { Extra, FILTERS, Needs, daysUntil, filtersFor, keepFor, optionLabel } from "@/lib/screenerFilters";
import { getChart, getFundamentals, getQuotes, getScreenerData, ScreenerData } from "@/lib/data";
import { rsi } from "@/lib/indicators";
import { knownCategory } from "@/lib/categories";
import { addManyToWatchlist, flattenLists, loadPortfolio, loadScreens, loadWatchlists, newId, saveScreens } from "@/lib/store";
import { useSettings } from "@/hooks/useSettings";
import { Market, PortfolioPosition, SavedScreen, ScreenStrategy, ScreenerRow, Sourced, Watchlist } from "@/lib/types";

// How many candidates get fundamentals or price history looked up when a filter needs them
const LOOKUP_LIMIT = 60;
// How many top results get sector/industry looked up for portfolio context
const CONTEXT_LOOKUPS = 25;
const CONCURRENCY = 6;

type SortKey = "ticker" | "changePercent" | "volume" | "relVolume" | "marketCap" | "pe" | "divYield" | "change52w" | "rsi14" | "change1m" | "earnings" | "roe";

interface Result {
  row: ScreenerRow;
  extra: Extra;
  reasons: Reason[];
}

const STRATEGIES: { id: ScreenStrategy; label: string; hint: string }[] = [
  { id: "long-term", label: "Long-term", hint: "Years: growth, profits, balance sheet and value" },
  { id: "swing", label: "Swing", hint: "Days to weeks: trend, momentum, volume and RSI" },
];

const SORTS: Record<ScreenStrategy, { key: SortKey; label: string }[]> = {
  "long-term": [
    { key: "marketCap", label: "Biggest companies" },
    { key: "change52w", label: "1-year change" },
    { key: "pe", label: "Lowest P/E" },
    { key: "divYield", label: "Dividend yield" },
    { key: "roe", label: "Return on equity" },
    { key: "changePercent", label: "Today's move" },
    { key: "ticker", label: "A–Z" },
  ],
  swing: [
    { key: "changePercent", label: "Today's move" },
    { key: "relVolume", label: "Volume vs average" },
    { key: "change1m", label: "1-month change" },
    { key: "volume", label: "Volume" },
    { key: "rsi14", label: "RSI" },
    { key: "earnings", label: "Earnings soonest" },
    { key: "marketCap", label: "Biggest companies" },
    { key: "ticker", label: "A–Z" },
  ],
};
// Smaller is better for these, so they sort ascending
const ASCENDING = new Set<SortKey>(["ticker", "pe", "earnings"]);

const setupsFor = (s: ScreenStrategy): Setup[] => (s === "swing" ? SWING_PRESETS : LONG_TERM_PRESETS);

function signalsOf(r: ScreenerRow, x: Extra): Signals {
  return { ...r, roe: x.roe ?? null, revenueGrowth: x.revenueGrowth ?? null, profitMargin: x.profitMargin ?? null, debtToEquity: x.debtToEquity ?? null, payoutRatio: x.payoutRatio ?? null };
}

/** Runs async jobs a few at a time so a large lookup doesn't flood the provider */
async function pool<T>(items: T[], n: number, job: (t: T) => Promise<void>, cancelled: () => boolean) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length && !cancelled()) await job(queue.shift()!);
  }));
}

function ChangePill({ v }: { v: number | null | undefined }) {
  const flat = v != null && Math.abs(v) < 0.005;
  const cls = v == null || flat ? "bg-[#F0F0F0] text-[#737373]" : v > 0 ? "bg-[#00B341] text-white" : "bg-[#F04E23] text-white";
  return (
    <span className={`inline-block min-w-[76px] text-center px-2 py-1 rounded-lg text-[13px] font-semibold tabular-nums ${cls}`}>
      {v == null ? "—" : flat ? "0.00%" : formatPercent(v)}
    </span>
  );
}

/** A few key numbers for the strategy, as quiet text under each result */
function keyStats(r: Result, strategy: ScreenStrategy): string[] {
  const { row, extra } = r;
  const out: string[] = [];
  if (strategy === "long-term") {
    if (row.marketCap != null) out.push(`Cap ${formatBig(row.marketCap, row.currency)}`);
    if (row.pe != null) out.push(`P/E ${row.pe.toFixed(1)}`);
    if (row.divYield) out.push(`Div ${(row.divYield * 100).toFixed(1)}%`);
    if (extra.roe != null) out.push(`ROE ${(extra.roe * 100).toFixed(0)}%`);
  } else {
    if (row.relVolume != null) out.push(`Vol ${row.relVolume.toFixed(1)}× avg`);
    else if (row.volume != null) out.push(`Vol ${formatVolume(row.volume)}`);
    if (extra.rsi14 != null) out.push(`RSI ${extra.rsi14.toFixed(0)}`);
    if (extra.change1m != null) out.push(`1M ${formatPercent(extra.change1m)}`);
    const d = daysUntil(row.earningsDate);
    if (d !== null && d >= 0 && d <= 30) out.push(`Earnings ${d === 0 ? "today" : `in ${d}d`}`);
  }
  return out;
}

export default function ScreenerPage() {
  const { settings } = useSettings();
  const [strategy, setStrategy] = useState<ScreenStrategy>("long-term");
  const [market, setMarket] = useState<Market>("US");
  const [setupId, setSetupId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [screens, setScreens] = useState<SavedScreen[]>([]);
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [data, setData] = useState<Sourced<ScreenerData> | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [extra, setExtra] = useState<Record<string, Extra & { fund?: boolean; chart?: boolean }>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<"new" | "rename" | null>(null);
  const [saveName, setSaveName] = useState("");
  const [shown, setShown] = useState(30);
  // Portfolio context for "why am I seeing this?" and the watchlists to add to
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [bulkList, setBulkList] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // Restore the last strategy and market
  useEffect(() => {
    try {
      const s = localStorage.getItem("screener_strategy");
      if (s === "swing" || s === "long-term") setStrategy(s);
      const m = localStorage.getItem("screener_market");
      if (m === "US" || m === "SG") setMarket(m);
    } catch {}
    loadScreens().then(setScreens);
    loadWatchlists().then((ls) => { setLists(ls); setBulkList(ls[0]?.id ?? ""); });
    loadPortfolio().then(async (ps) => {
      setPositions(ps);
      const tickers = Array.from(new Set(ps.map((p) => p.ticker)));
      const [quotes, funds] = await Promise.all([getQuotes(tickers), Promise.all(tickers.map((t) => getFundamentals(t)))]);
      setHoldings(tickers.map((t, i) => ({
        ticker: t,
        sector: funds[i]?.value.profile.sector ?? ps.find((p) => p.ticker === t)?.sector ?? null,
        industry: funds[i]?.value.profile.industry ?? null,
        value: ps.filter((p) => p.ticker === t).reduce((s, p) => s + p.quantity * (quotes[t]?.value.price ?? p.purchasePrice), 0),
      })));
    });
  }, []);

  useEffect(() => { try { localStorage.setItem("screener_strategy", strategy); localStorage.setItem("screener_market", market); } catch {} }, [strategy, market]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const d = await getScreenerData(market, { force });
    setData(d);
    setLoading(false);
  }, [market]);

  useEffect(() => { load(); }, [load]);

  // Fresh results start at the top of the list
  useEffect(() => { setShown(30); setExpanded(null); }, [strategy, market, setupId, filters]);

  // The filter sheet closes on Escape
  useEffect(() => {
    if (!sheetOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sheetOpen]);

  function chooseStrategy(s: ScreenStrategy) {
    if (s === strategy) return;
    setStrategy(s);
    setSetupId(null);
    setFilters((f) => keepFor(s, f));
    setActiveScreen(null);
    setSortKey(null);
  }

  function chooseMarket(m: Market) {
    if (m === market) return;
    setMarket(m);
    setExtra({});
    inflight.current.clear();
  }

  function setFilter(key: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
  }

  function loadScreen(s: SavedScreen) {
    if (activeScreen === s.id) { setActiveScreen(null); return; }
    setStrategy(s.strategy);
    setMarket(s.market);
    setSetupId(s.setup);
    setFilters(keepFor(s.strategy, s.filters));
    setActiveScreen(s.id);
  }

  function persist(next: SavedScreen[]) {
    setScreens(next);
    saveScreens(next);
  }

  const active = screens.find((s) => s.id === activeScreen) ?? null;
  const dirty = !!active && (active.market !== market || active.setup !== setupId || active.strategy !== strategy
    || JSON.stringify(Object.entries(active.filters).sort()) !== JSON.stringify(Object.entries(filters).sort()));

  function saveScreen() {
    const name = saveName.trim();
    if (!name) return;
    if (saveMode === "rename" && active) {
      persist(screens.map((s) => (s.id === active.id ? { ...s, name, updatedAt: new Date().toISOString() } : s)));
    } else {
      const s: SavedScreen = { id: newId(), name, strategy, market, setup: setupId, filters, updatedAt: new Date().toISOString() };
      persist([...screens, s]);
      setActiveScreen(s.id);
    }
    setSaveMode(null);
  }

  function updateActive() {
    if (!active) return;
    persist(screens.map((s) => (s.id === active.id ? { ...s, strategy, market, setup: setupId, filters, updatedAt: new Date().toISOString() } : s)));
  }

  function deleteActive() {
    if (!active || !window.confirm(`Delete the saved screen "${active.name}"?`)) return;
    persist(screens.filter((s) => s.id !== active.id));
    setActiveScreen(null);
  }

  // ── Screening ──────────────────────────────────────────────────────────────

  const setup = setupsFor(strategy).find((s) => s.id === setupId) ?? null;
  const activeFilters = useMemo(() => FILTERS.filter((f) => filters[f.key] && f.strategies.includes(strategy)), [filters, strategy]);

  const extraFor = useCallback((t: string): Extra => {
    const known = knownCategory(t);
    const x = extra[t] ?? {};
    return { ...x, sector: x.sector ?? (known && known !== "ETFs" ? known : null) };
  }, [extra]);

  // Stage 1: everything that can be decided from the quote alone
  const quoteStage = useMemo(() => {
    if (!data) return [];
    const quoteFilters = activeFilters.filter((f) => !f.needs || (f.key === "sector"));
    return data.value.results.filter((r) => quoteFilters.every((f) => {
      if (f.key === "sector") {
        const s = extraFor(r.ticker).sector;
        return s === undefined || s === null ? true : f.test(r, { sector: s }, filters[f.key]); // unknown sectors get looked up
      }
      return f.test(r, {}, filters[f.key]);
    }))
      // Setups that don't need fundamentals or charts can run now
      .filter((r) => !setup || setup.needsFundamentals || evaluate(setup, signalsOf(r, {})).pass);
  }, [data, activeFilters, filters, setup, extraFor]);

  // What the remaining checks need looked up
  const needs = useMemo(() => {
    const n = new Set<Needs>();
    if (setup?.needsFundamentals) n.add("fundamentals");
    for (const f of activeFilters) if (f.needs && f.key !== "sector") n.add(f.needs);
    if (filters.sector && quoteStage.some((r) => !extraFor(r.ticker).sector)) n.add("fundamentals");
    return n;
  }, [setup, activeFilters, filters.sector, quoteStage, extraFor]);

  // Candidates for lookups: the largest companies first
  const lookupSet = useMemo(() => {
    if (!needs.size) return [];
    return [...quoteStage].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, LOOKUP_LIMIT);
  }, [quoteStage, needs]);

  // Look up each candidate once; results arrive one by one and refine the list as they land
  const inflight = useRef(new Set<string>());
  const mounted = useRef(true);
  // Set on every mount: React's dev mode mounts twice, and a stale false would drop every lookup
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const lookupKey = `${Array.from(needs).sort().join("+")}|${lookupSet.map((r) => r.ticker).join(",")}`;
  useEffect(() => {
    const wantFund = needs.has("fundamentals");
    const wantChart = needs.has("chart");
    const todo = lookupSet.filter((r) => {
      const x = extra[r.ticker];
      const key = `${r.ticker}:${wantFund && !x?.fund ? "f" : ""}${wantChart && !x?.chart ? "c" : ""}`;
      if (key.endsWith(":") || inflight.current.has(key)) return false;
      inflight.current.add(key);
      return true;
    });
    if (!todo.length) return;
    pool(todo, CONCURRENCY, async (r) => {
      const had = extra[r.ticker];
      const patch: Extra & { fund?: boolean; chart?: boolean } = {};
      if (wantFund && !had?.fund) {
        const f = (await getFundamentals(r.ticker))?.value;
        Object.assign(patch, {
          fund: true,
          sector: normaliseSector(f?.profile.sector) ?? null,
          industry: f?.profile.industry ?? null,
          roe: f?.profitability.returnOnEquity ?? null,
          revenueGrowth: f?.growth.revenueGrowth ?? null,
          profitMargin: f?.profitability.profitMargin ?? null,
          debtToEquity: f?.health.debtToEquity != null ? f.health.debtToEquity / 100 : null,
          payoutRatio: f?.dividend.payoutRatio ?? null,
        });
      }
      if (wantChart && !had?.chart) {
        const pts = (await getChart(r.ticker, "6mo"))?.value.points ?? [];
        const closes = pts.map((p) => p.c);
        const lastRsi = closes.length > 15 ? rsi(closes).at(-1) ?? null : null;
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        const cut = monthAgo.toISOString().slice(0, 10);
        const base = [...pts].reverse().find((p) => p.t <= cut);
        Object.assign(patch, {
          chart: true,
          rsi14: lastRsi,
          change1m: base && closes.length ? ((closes[closes.length - 1] - base.c) / base.c) * 100 : null,
        });
      }
      if (mounted.current) setExtra((prev) => ({ ...prev, [r.ticker]: { ...prev[r.ticker], ...patch } }));
    }, () => !mounted.current);
  }, [lookupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = lookupSet.filter((r) => (needs.has("fundamentals") && !extra[r.ticker]?.fund) || (needs.has("chart") && !extra[r.ticker]?.chart)).length;

  // Stage 2: the full rules, with reasons
  const results: Result[] = useMemo(() => {
    const candidates = needs.size ? lookupSet : quoteStage;
    const out: Result[] = [];
    for (const r of candidates) {
      const x = extraFor(r.ticker);
      let reasons: Reason[] = [];
      if (setup) {
        const res = evaluate(setup, signalsOf(r, x));
        if (!res.pass) continue;
        reasons = res.reasons;
      }
      if (!activeFilters.every((f) => f.test(r, x, filters[f.key]))) continue;
      reasons = [...reasons, ...activeFilters.map((f) => ({ text: f.describe(r, x, filters[f.key]), tone: "neutral" as const, kind: "signal" as const }))];
      out.push({ row: r, extra: x, reasons });
    }
    return out;
  }, [needs, lookupSet, quoteStage, setup, activeFilters, filters, extraFor]);

  const sorts = SORTS[strategy];
  const sk: SortKey = sortKey && sorts.some((s) => s.key === sortKey) ? sortKey : setup?.sort === "changePercent" || strategy === "swing" ? "changePercent" : "marketCap";
  const displayed = useMemo(() => {
    const val = (r: Result): number | string | null => {
      switch (sk) {
        case "ticker": return r.row.ticker;
        case "rsi14": return r.extra.rsi14 ?? null;
        case "change1m": return r.extra.change1m ?? null;
        case "roe": return r.extra.roe ?? null;
        case "earnings": { const d = daysUntil(r.row.earningsDate); return d !== null && d >= 0 ? d : null; }
        case "pe": return r.row.pe != null && r.row.pe > 0 ? r.row.pe : null;
        default: return r.row[sk] ?? null;
      }
    };
    const asc = ASCENDING.has(sk);
    return [...results].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const d = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return asc ? d : -d;
    });
  }, [results, sk]);

  // Sector and industry for the top results, for portfolio-context reasons
  useEffect(() => {
    const missing = displayed.slice(0, CONTEXT_LOOKUPS).map((r) => r.row.ticker).filter((t) => !extra[t]?.fund && extra[t]?.industry === undefined);
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(async (t) => [t, (await getFundamentals(t))?.value.profile] as const)).then((pairs) => {
      if (cancelled) return;
      setExtra((prev) => {
        const next = { ...prev };
        for (const [t, p] of pairs) next[t] = { ...next[t], sector: next[t]?.sector ?? normaliseSector(p?.sector) ?? null, industry: p?.industry ?? null };
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [displayed]); // eslint-disable-line react-hooks/exhaustive-deps

  const watchlist = useMemo(() => flattenLists(lists ?? []), [lists]);
  const contextFor = useCallback((t: string): Reason[] => contextReasons({
    ticker: t,
    sector: extra[t]?.sector ?? null,
    industry: extra[t]?.industry ?? null,
    holdings,
    positions,
    watchlist,
    watchedSectors: settings?.profile.sectors ?? [],
  }), [extra, holdings, positions, watchlist, settings]);

  async function addAllToList() {
    if (!bulkList || !displayed.length) return;
    const target = lists?.find((l) => l.id === bulkList);
    const before = target?.items.length ?? 0;
    const next = await addManyToWatchlist(bulkList, displayed.map((r) => ({
      ticker: r.row.ticker,
      intent: strategy,
      tag: "watching",
      note: `${setup ? `${setup.name}: ` : "Screener: "}${r.reasons.map((x) => x.text).join("; ")}`,
      exchange: r.row.exchange ?? undefined,
      currency: r.row.currency ?? undefined,
      addedPrice: r.row.price ?? undefined,
    })));
    setLists(next);
    const added = (next.find((l) => l.id === bulkList)?.items.length ?? 0) - before;
    setBulkMsg(`Added ${added} to ${target?.name ?? "list"}${added < displayed.length ? ` (${displayed.length - added} were already on it)` : ""}.`);
    setTimeout(() => setBulkMsg(null), 5000);
  }

  const marketDef = MARKETS.find((m) => m.id === market)!;
  const strategyScreens = screens.filter((s) => s.strategy === strategy);
  const pillOn = "bg-[#2D8CFF] text-white";
  const pillOff = "text-[#2D8CFF] hover:bg-[#EAF4FF]";
  const showLabel = strategy === "swing" || sk === "changePercent" ? "Today" : "1 year";
  const ideas = [{ id: null as string | null, name: "All stocks", summary: `Every ${marketDef.label} stock in the screen. Narrow it down with filters.` }, ...setupsFor(strategy)];

  return (
    <div className="max-w-5xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-[32px] font-semibold tracking-tight text-[#0A0A0A]">Screener</h1>
        <button onClick={() => load(true)} disabled={loading} title="Refresh" aria-label="Refresh"
          className="p-2 text-[#2D8CFF] hover:bg-[#EAF4FF] rounded-full disabled:opacity-50 transition-colors">
          <svg className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* ── Strategy + market ── */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex gap-1" role="group" aria-label="Strategy">
          {STRATEGIES.map((s) => (
            <button key={s.id} onClick={() => chooseStrategy(s.id)} aria-pressed={strategy === s.id} title={s.hint}
              className={`px-4 py-1.5 rounded-full text-[14px] font-semibold transition-colors ${strategy === s.id ? pillOn : pillOff}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5" role="group" aria-label="Market">
          {MARKETS.map((m) => (
            <button key={m.id} onClick={() => chooseMarket(m.id)} aria-pressed={market === m.id}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${market === m.id ? "bg-[#0A0A0A] text-white" : "text-[#737373] hover:bg-[#F7F7F8]"}`}>
              {m.id}
            </button>
          ))}
        </div>
      </div>

      {/* ── Ideas: the setups, then saved screens ── */}
      <p className="text-[18px] font-semibold text-[#0A0A0A] mb-2">Ideas</p>
      <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-2.5 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-4">
        {ideas.map((p) => {
          const on = !activeScreen && setupId === p.id;
          return (
            <button key={p.id ?? "all"} onClick={() => { setSetupId(p.id); setActiveScreen(null); }} aria-pressed={on}
              className={`shrink-0 w-[168px] sm:w-auto text-left rounded-2xl border px-3.5 py-3 transition-colors ${on ? "border-[#2D8CFF] bg-[#F4F9FF]" : "border-[#E5E5E5] bg-white hover:border-[#A3A3A3]"}`}>
              <span className={`block text-[14px] font-semibold ${on ? "text-[#2D8CFF]" : "text-[#0A0A0A]"}`}>{p.name}</span>
              <span className="block text-[12px] text-[#737373] mt-1 leading-snug line-clamp-3">{p.summary}</span>
            </button>
          );
        })}
        {strategyScreens.map((s) => {
          const on = activeScreen === s.id;
          const parts = [s.setup ? setupsFor(s.strategy).find((x) => x.id === s.setup)?.name : null, Object.keys(s.filters).length ? `${Object.keys(s.filters).length} filter${Object.keys(s.filters).length > 1 ? "s" : ""}` : null, s.market !== "US" ? s.market : null].filter(Boolean);
          return (
            <button key={s.id} onClick={() => loadScreen(s)} aria-pressed={on}
              className={`shrink-0 w-[168px] sm:w-auto text-left rounded-2xl border px-3.5 py-3 transition-colors ${on ? "border-[#2D8CFF] bg-[#F4F9FF]" : "border-[#E5E5E5] bg-white hover:border-[#A3A3A3]"}`}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#A3A3A3]">Saved</span>
              <span className={`block text-[14px] font-semibold truncate ${on ? "text-[#2D8CFF]" : "text-[#0A0A0A]"}`}>{s.name}</span>
              <span className="block text-[12px] text-[#737373] mt-1 leading-snug">{parts.join(" · ") || "No filters"}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters: one button, then what's applied ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0 mb-2">
        <button onClick={() => setSheetOpen(true)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[14px] font-semibold border transition-colors ${activeFilters.length ? "border-[#2D8CFF] text-[#2D8CFF] bg-[#F4F9FF]" : "border-[#E5E5E5] text-[#0A0A0A] hover:border-[#A3A3A3]"}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filters{activeFilters.length ? ` · ${activeFilters.length}` : ""}
        </button>
        {activeFilters.map((f) => (
          <span key={f.key} className="shrink-0 inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full text-[13px] font-semibold bg-[#EAF4FF] text-[#0B5CB5]">
            {f.label}: {optionLabel(f.key, filters[f.key])}
            <button onClick={() => setFilter(f.key, "")} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#2D8CFF]/15" aria-label={`Clear ${f.label}`}>×</button>
          </span>
        ))}
        {!active && (setupId || activeFilters.length > 0) && (
          <button onClick={() => { setSaveMode("new"); setSaveName(""); }}
            className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold text-[#2D8CFF] hover:bg-[#EAF4FF]">
            Save screen
          </button>
        )}
      </div>

      {/* A saved screen in use */}
      {active && (
        <div className="flex items-center gap-1 flex-wrap text-[13px] mb-2">
          <span className="text-[#737373] mr-1">Using <span className="font-semibold text-[#0A0A0A]">{active.name}</span></span>
          {dirty && <button onClick={updateActive} className="px-2.5 py-1 rounded-full font-semibold text-white bg-[#2D8CFF] hover:bg-[#1A73E0]">Save changes</button>}
          <button onClick={() => { setSaveMode("new"); setSaveName(`${active.name} (copy)`); }} className="px-2.5 py-1 rounded-full font-semibold text-[#2D8CFF] hover:bg-[#EAF4FF]">Save as new</button>
          <button onClick={() => { setSaveMode("rename"); setSaveName(active.name); }} className="px-2.5 py-1 rounded-full font-semibold text-[#2D8CFF] hover:bg-[#EAF4FF]">Rename</button>
          <button onClick={deleteActive} className="px-2.5 py-1 rounded-full font-semibold text-[#F04E23] hover:bg-[#FFF0EB]">Delete</button>
        </div>
      )}

      {data?.value.coverage === "universe" && (
        <p className="text-[12px] text-[#737373] mb-2">
          {market === "US"
            ? `Yahoo's market-wide screener isn't responding, so this screens ${data.value.results.length} large US companies instead.`
            : `Screening ${data.value.results.length} large Singapore Exchange listings.`}
        </p>
      )}

      {/* ── Results ── */}
      <div className="flex items-center justify-between gap-2 py-2 mt-2 border-b border-[#F0F0F0] text-[13px]">
        <span className="text-[#737373]">
          {data === undefined || (loading && !data) ? "Loading…" : !data ? "" : (
            <>
              <span className="font-semibold text-[#0A0A0A]">{displayed.length}</span> stock{displayed.length !== 1 ? "s" : ""}
              {pending > 0 && <span className="text-[#2D8CFF]" title={`Looking up ${pending} more`}> · checking…</span>}
            </>
          )}
        </span>
        <span className="flex items-center gap-3">
          <label className="flex items-center gap-1">
            <span className="sr-only">Sort by</span>
            <select value={sk} onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-transparent font-semibold text-[#525252] focus:outline-none cursor-pointer text-right">
              {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <span className="font-semibold text-[#A3A3A3] w-[76px] text-center">{showLabel}</span>
        </span>
      </div>

      {data === undefined || (loading && !data) ? (
        <p className="py-16 text-center text-[14px] text-[#737373]">Fetching {marketDef.label} stocks…</p>
      ) : !data ? (
        <div className="py-16 text-center">
          <p className="text-[15px] font-semibold text-[#0A0A0A]">The screener isn&apos;t available right now</p>
          <button onClick={() => load(true)} className="mt-3 text-[14px] font-semibold text-white bg-[#2D8CFF] hover:bg-[#1A73E0] px-4 py-2 rounded-full">Try again</button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-16 text-center">
          {pending > 0 ? (
            <p className="text-[14px] text-[#737373]">Checking candidates… {pending} left to look up.</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#0A0A0A]">No matches</p>
              <p className="text-[14px] text-[#737373] mt-1">
                {setup && strategy === "swing" ? "Clean setups are rare on any given day. Try another idea, or check again after the next session." : "Try another idea, or loosen a filter."}
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[#F0F0F0]">
            {displayed.slice(0, shown).map((r) => {
              const ctx = contextFor(r.row.ticker);
              const isOpen = expanded === r.row.ticker;
              const stats = keyStats(r, strategy);
              const pill = showLabel === "Today" ? r.row.changePercent : r.row.change52w;
              const firstReason = r.reasons[0]?.text;
              const why = r.reasons.length + ctx.length;
              return (
                <li key={r.row.ticker} className={isOpen ? "bg-[#F4F9FF] -mx-2 px-2 rounded-xl" : ""}>
                  <button onClick={() => setExpanded(isOpen ? null : r.row.ticker)} aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[16px] font-semibold text-[#0A0A0A] shrink-0">{r.row.ticker}</span>
                        <span className="text-[13px] text-[#737373] truncate">{r.row.name}</span>
                      </span>
                      {firstReason ? (
                        <span className="block text-[13px] text-[#007A2B] truncate">✓ {firstReason}{why > 1 ? <span className="text-[#2D8CFF] font-semibold"> · +{why - 1} more</span> : null}</span>
                      ) : stats.length > 0 && (
                        <span className="block text-[13px] text-[#737373] truncate">{stats.join(" · ")}</span>
                      )}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[15px] font-semibold text-[#0A0A0A] tabular-nums mb-0.5">{formatMoney(r.row.price, r.row.currency)}</span>
                      <ChangePill v={pill} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="pb-4 -mt-1 space-y-3">
                      {stats.length > 0 && <p className="text-[13px] text-[#525252]">{stats.join(" · ")}</p>}
                      <div>
                        <p className="text-[12px] font-semibold text-[#525252] mb-1">{setup ? `Why it fits ${setup.name}` : r.reasons.length ? "Why it matched" : "Why it's here"}</p>
                        {r.reasons.length ? (
                          <ul className="space-y-0.5">{r.reasons.map((x) => <li key={x.text} className="text-[14px] text-[#262626]">✓ {x.text}</li>)}</ul>
                        ) : <p className="text-[14px] text-[#737373]">No idea or filters chosen. It&apos;s one of the {marketDef.label} stocks being screened.</p>}
                      </div>
                      {ctx.length > 0 && (
                        <div>
                          <p className="text-[12px] font-semibold text-[#525252] mb-1">For your portfolio</p>
                          <ul className="space-y-0.5">{ctx.map((x) => (
                            <li key={x.text} className={`text-[14px] ${x.tone === "warn" ? "text-[#B45309]" : x.tone === "good" ? "text-[#007A2B]" : "text-[#262626]"}`}>{x.tone === "warn" ? "⚠" : "•"} {x.text}</li>
                          ))}</ul>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Link href={`/stock/${encodeURIComponent(r.row.ticker)}`} className="px-4 py-1.5 text-[13px] font-semibold text-white bg-[#2D8CFF] hover:bg-[#1A73E0] rounded-full">
                          Open {r.row.ticker}
                        </Link>
                        <WatchButton
                          ticker={r.row.ticker}
                          lists={lists}
                          defaultIntent={strategy}
                          defaultNote={`${setup ? `${setup.name}: ` : ""}${r.reasons.map((x) => x.text).join("; ")}`}
                          meta={{ exchange: r.row.exchange ?? undefined, currency: r.row.currency ?? undefined, addedPrice: r.row.price ?? undefined }}
                          onSaved={setLists}
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {displayed.length > shown && (
            <button onClick={() => setShown((n) => n + 30)} className="w-full mt-2 py-2.5 text-[14px] font-semibold text-[#2D8CFF] hover:bg-[#EAF4FF] rounded-full">
              Show more ({displayed.length - shown} left)
            </button>
          )}

          {/* Add every result to a list */}
          {lists && (
            <div className="flex items-center gap-2 flex-wrap mt-4 text-[13px]">
              <button onClick={addAllToList} className="font-semibold text-[#2D8CFF] hover:underline">+ Add all {displayed.length} to</button>
              <select value={bulkList} onChange={(e) => setBulkList(e.target.value)} aria-label="Watchlist to add results to"
                className="px-2 py-1 bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]">
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {bulkMsg && <span className="text-[#007A2B]">✓ {bulkMsg}</span>}
            </div>
          )}
        </>
      )}

      {data && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <SourceTag source={`Quotes: ${data.source}`} asOf={data.asOf} cached={data.cached} />
          {needs.size > 0 && <span className="text-[11px] text-[#A3A3A3]">Some checks are looked up for the {LOOKUP_LIMIT} largest candidates · prices in each listing&apos;s own currency</span>}
        </div>
      )}

      {/* ── Filter sheet ── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSheetOpen(false)} />
          <div role="dialog" aria-label="Filters"
            className="relative bg-white w-full sm:max-w-lg max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#F0F0F0]">
              <button onClick={() => setFilters({})} disabled={!activeFilters.length} className="text-[14px] font-semibold text-[#2D8CFF] disabled:text-[#C8C8C8]">Clear</button>
              <p className="text-[16px] font-semibold text-[#0A0A0A]">{strategy === "swing" ? "Swing" : "Long-term"} filters</p>
              <button onClick={() => setSheetOpen(false)} className="text-[14px] font-semibold text-[#2D8CFF]">Done</button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-5">
              {filtersFor(strategy).map((f) => (
                <div key={f.key}>
                  <p className="text-[14px] font-semibold text-[#0A0A0A] mb-2">
                    {f.label}
                    {f.needs && f.key !== "sector" && <span className="ml-1.5 text-[11px] font-normal text-[#A3A3A3]">checked for the {LOOKUP_LIMIT} largest</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[{ label: "Any", value: "" }, ...f.options].map((o) => {
                      const on = (filters[f.key] ?? "") === o.value;
                      return (
                        <button key={o.value || "any"} onClick={() => setFilter(f.key, o.value)} aria-pressed={on}
                          className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${on ? "bg-[#2D8CFF] text-white border-[#2D8CFF]" : "bg-white text-[#404040] border-[#E5E5E5] hover:border-[#A3A3A3]"}`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-[#F0F0F0] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setSheetOpen(false)} className="w-full py-3 rounded-full text-[15px] font-semibold text-white bg-[#2D8CFF] hover:bg-[#1A73E0]">
                {pending > 0 ? "Show results" : `Show ${displayed.length} stock${displayed.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save / rename ── */}
      {saveMode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-[18px] font-semibold text-[#0A0A0A] mb-1">{saveMode === "rename" ? "Rename screen" : "Save screen"}</h2>
            <p className="text-[13px] text-[#737373] mb-4">
              {strategy === "swing" ? "Swing" : "Long-term"} · {marketDef.label}{setup ? ` · ${setup.name}` : ""}{activeFilters.length ? ` · ${activeFilters.length} filter${activeFilters.length > 1 ? "s" : ""}` : ""}
            </p>
            <input autoFocus type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveScreen(); if (e.key === "Escape") setSaveMode(null); }}
              placeholder="e.g. SG dividend payers"
              className="w-full bg-[#F7F7F8] border border-transparent rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:bg-white focus:border-[#2D8CFF] mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setSaveMode(null)} className="flex-1 py-2.5 text-[14px] font-semibold text-[#2D8CFF] rounded-full hover:bg-[#EAF4FF]">Cancel</button>
              <button onClick={saveScreen} disabled={!saveName.trim()} className="flex-1 py-2.5 text-[14px] font-semibold text-white bg-[#2D8CFF] hover:bg-[#1A73E0] rounded-full disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
