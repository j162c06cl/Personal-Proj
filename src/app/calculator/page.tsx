"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { formatPercent, formatVolume } from "@/lib/formatters";
import { formatBig, formatMoney, MARKETS } from "@/lib/markets";
import TickerLink from "@/components/TickerLink";
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

type SortDir = "asc" | "desc";
type SortKey = "ticker" | "price" | "changePercent" | "volume" | "relVolume" | "marketCap" | "pe" | "forwardPE" | "divYield" | "change52w" | "rsi14" | "change1m" | "earnings" | "roe";

interface Column { key: SortKey; label: string; title?: string; render: (r: Result) => React.ReactNode }

interface Result {
  row: ScreenerRow;
  extra: Extra;
  reasons: Reason[];
}

const STRATEGIES: { id: ScreenStrategy; title: string; blurb: string; icon: string }[] = [
  {
    id: "swing",
    title: "Swing trading",
    blurb: "Days to weeks. Judged on trend, momentum, volume, RSI and upcoming earnings.",
    icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  },
  {
    id: "long-term",
    title: "Long-term investing",
    blurb: "Years. Judged on growth, profitability, balance sheet, valuation and the long trend.",
    icon: "M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6",
  },
];

const setupsFor = (s: ScreenStrategy): Setup[] => (s === "swing" ? SWING_PRESETS : LONG_TERM_PRESETS);

const TONE_CLS: Record<Reason["tone"], string> = {
  good: "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]",
  warn: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]",
  neutral: "bg-[#F7F7F8] text-[#404040] border-[#E5E5E5]",
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-[#A3A3A3]">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function Chg({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="text-[#A3A3A3]">—</span>;
  return <span className={`font-semibold tabular-nums ${v >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{formatPercent(v)}</span>;
}

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

export default function ScreenerPage() {
  const { settings } = useSettings();
  const [strategy, setStrategy] = useState<ScreenStrategy | null>(null);
  const [market, setMarket] = useState<Market>("US");
  const [setupId, setSetupId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [screens, setScreens] = useState<SavedScreen[]>([]);
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [data, setData] = useState<Sourced<ScreenerData> | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [extra, setExtra] = useState<Record<string, Extra & { fund?: boolean; chart?: boolean }>>({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<"new" | "rename" | null>(null);
  const [saveName, setSaveName] = useState("");
  // Portfolio context for "why am I seeing this?" and the watchlists to add to
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [bulkList, setBulkList] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // Restore the last strategy and market; the investor still sees the choice first
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

  useEffect(() => { try { if (strategy) localStorage.setItem("screener_strategy", strategy); localStorage.setItem("screener_market", market); } catch {} }, [strategy, market]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const d = await getScreenerData(market, { force });
    setData(d);
    setLoading(false);
  }, [market]);

  useEffect(() => { if (strategy) load(); }, [strategy, load]);

  function chooseStrategy(s: ScreenStrategy) {
    if (s === strategy) return;
    setStrategy(s);
    setSetupId(null);
    setFilters((f) => keepFor(s, f));
    setActiveScreen(null);
    setSortKey(null);
    setExpanded(null);
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
    if (!name || !strategy) return;
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
    if (!active || !strategy) return;
    persist(screens.map((s) => (s.id === active.id ? { ...s, strategy, market, setup: setupId, filters, updatedAt: new Date().toISOString() } : s)));
  }

  function deleteActive() {
    if (!active) return;
    persist(screens.filter((s) => s.id !== active.id));
    setActiveScreen(null);
  }

  // ── Screening ──────────────────────────────────────────────────────────────

  const setup = strategy ? setupsFor(strategy).find((s) => s.id === setupId) ?? null : null;
  const activeFilters = useMemo(() => FILTERS.filter((f) => filters[f.key] && strategy && f.strategies.includes(strategy)), [filters, strategy]);

  const extraFor = useCallback((t: string): Extra => {
    const known = knownCategory(t);
    const x = extra[t] ?? {};
    return { ...x, sector: x.sector ?? (known && known !== "ETFs" ? known : null) };
  }, [extra]);

  // Stage 1: everything that can be decided from the quote alone
  const quoteStage = useMemo(() => {
    if (!data || !strategy) return [];
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
  }, [data, strategy, activeFilters, filters, setup, extraFor]);

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
  useEffect(() => () => { mounted.current = false; }, []);
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
    if (!strategy) return [];
    const pool = needs.size ? lookupSet : quoteStage;
    const out: Result[] = [];
    for (const r of pool) {
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
  }, [strategy, needs, lookupSet, quoteStage, setup, activeFilters, filters, extraFor]);

  const defaultSort: SortKey = setup?.sort === "changePercent" ? "changePercent" : "marketCap";
  const sk = sortKey ?? defaultSort;
  const displayed = useMemo(() => {
    const q = search.trim().toUpperCase();
    const list = q ? results.filter((r) => r.row.ticker.includes(q) || r.row.name.toUpperCase().includes(q)) : results;
    const val = (r: Result): number | string | null => {
      switch (sk) {
        case "ticker": return r.row.ticker;
        case "rsi14": return r.extra.rsi14 ?? null;
        case "change1m": return r.extra.change1m ?? null;
        case "roe": return r.extra.roe ?? null;
        case "earnings": return daysUntil(r.row.earningsDate) ?? null;
        default: return r.row[sk] ?? null;
      }
    };
    const dir = sortKey ? sortDir : "desc";
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const d = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? d : -d;
    });
  }, [results, search, sk, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sk) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ticker" || key === "earnings" ? "asc" : "desc"); }
  }

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
    if (!bulkList || !strategy || !displayed.length) return;
    const target = lists?.find((l) => l.id === bulkList);
    const before = target?.items.length ?? 0;
    const next = await addManyToWatchlist(bulkList, displayed.map((r) => ({
      ticker: r.row.ticker,
      intent: strategy,
      tag: strategy === "swing" && setup ? "setup-ready" : "researching",
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

  // ── Columns ────────────────────────────────────────────────────────────────

  const money = (r: Result, v: number | null) => formatMoney(v, r.row.currency);
  const columns: Column[] = strategy === "swing"
    ? [
        { key: "price", label: "Price", render: (r) => money(r, r.row.price) },
        { key: "changePercent", label: "Today", render: (r) => <Chg v={r.row.changePercent} /> },
        { key: "change1m", label: "1 month", title: "Looked up for the largest candidates when a filter needs it", render: (r) => r.extra.change1m != null ? <Chg v={r.extra.change1m} /> : <span className="text-[#A3A3A3]">—</span> },
        { key: "relVolume", label: "Rel vol", title: "Latest volume ÷ 3-month average", render: (r) => r.row.relVolume != null ? <span className={r.row.relVolume >= 1.5 ? "text-[#16A34A] font-semibold" : "text-[#525252]"}>{r.row.relVolume.toFixed(2)}×</span> : "—" },
        { key: "volume", label: "Volume", render: (r) => formatVolume(r.row.volume) },
        { key: "rsi14", label: "RSI", title: "RSI(14), calculated from daily closes", render: (r) => r.extra.rsi14 != null ? <span className={r.extra.rsi14 >= 70 || r.extra.rsi14 <= 30 ? "text-[#D97706] font-semibold" : ""}>{r.extra.rsi14.toFixed(0)}</span> : <span className="text-[#A3A3A3]">—</span> },
        {
          key: "earnings", label: "Earnings", render: (r) => {
            const d = daysUntil(r.row.earningsDate);
            if (d === null || d < 0) return <span className="text-[#A3A3A3]">—</span>;
            return <span className={d <= 14 ? "text-[#D97706] font-semibold" : "text-[#525252]"} title={r.row.earningsDate!}>{d === 0 ? "today" : `${d}d`}</span>;
          },
        },
      ]
    : [
        { key: "price", label: "Price", render: (r) => money(r, r.row.price) },
        { key: "marketCap", label: "Mkt cap", render: (r) => formatBig(r.row.marketCap, r.row.currency) },
        { key: "pe", label: "P/E", render: (r) => (r.row.pe != null ? r.row.pe.toFixed(1) : "—") },
        { key: "forwardPE", label: "Fwd P/E", render: (r) => (r.row.forwardPE != null ? r.row.forwardPE.toFixed(1) : "—") },
        { key: "divYield", label: "Div %", render: (r) => (r.row.divYield ? `${(r.row.divYield * 100).toFixed(2)}%` : "—") },
        { key: "roe", label: "ROE", title: "Return on equity, looked up when a filter or setup needs it", render: (r) => (r.extra.roe != null ? `${(r.extra.roe * 100).toFixed(0)}%` : <span className="text-[#A3A3A3]">—</span>) },
        { key: "change52w", label: "52 wk", render: (r) => <Chg v={r.row.change52w} /> },
      ];

  const thCls = (key: SortKey) =>
    `px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer select-none transition-colors ${
      sk === key ? "text-[#1F65F0] bg-[#EBF2FF]" : "text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8]"
    }`;

  const marketDef = MARKETS.find((m) => m.id === market)!;
  const strategyScreens = screens.filter((s) => !strategy || s.strategy === strategy);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Stock Screener</h1>
          <p className="text-[14px] text-[#525252] mt-0.5">Choose how you invest first. Each strategy has its own setups, filters and rules.</p>
        </div>
        {strategy && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="inline-flex items-center bg-[#EBEBEB] rounded-xl p-1 gap-0.5" role="group" aria-label="Market">
              {MARKETS.map((m) => (
                <button key={m.id} onClick={() => { setMarket(m.id); setExtra({}); inflight.current.clear(); }}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${market === m.id ? "bg-white text-[#0A0A0A] font-semibold shadow-sm" : "text-[#525252] hover:text-[#0A0A0A]"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={() => load(true)} disabled={loading}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8] px-4 py-2 rounded-xl disabled:opacity-60 transition-colors">
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {/* ── Step 1: strategy ── */}
      <section className="mb-4">
        <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-2">1 · Your strategy</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {STRATEGIES.map((s) => {
            const on = strategy === s.id;
            return (
              <button key={s.id} onClick={() => chooseStrategy(s.id)} aria-pressed={on}
                className={`text-left rounded-2xl border px-4 py-3.5 transition-all ${on ? "border-[#1F65F0] bg-[#F5F8FF] shadow-[0_0_0_3px_rgba(31,101,240,0.10)]" : "border-[#E5E5E5] bg-white hover:border-[#A3A3A3]"}`}>
                <span className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? "bg-[#1F65F0] text-white" : "bg-[#F0F0F0] text-[#525252]"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} /></svg>
                  </span>
                  <span className={`text-[16px] font-bold ${on ? "text-[#1F65F0]" : "text-[#0A0A0A]"}`}>{s.title}</span>
                </span>
                <span className="block text-[13px] text-[#525252] mt-1.5">{s.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      {!strategy ? (
        <div className="bg-white rounded-2xl border border-dashed border-[#D4D4D4] py-16 text-center">
          <p className="text-[14px] font-semibold text-[#0A0A0A]">Pick a strategy to see its setups and filters.</p>
          <p className="text-[13px] text-[#525252] mt-1">A good swing trade and a good long-term holding are judged by different rules, so the screener keeps them apart.</p>
        </div>
      ) : (
        <>
          {/* ── Step 2: setup + saved screens ── */}
          <section className="bg-white rounded-2xl border border-[#E5E5E5] mb-4 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">2 · {strategy === "swing" ? "Swing" : "Long-term"} setup <span className="normal-case tracking-normal font-normal text-[#A3A3A3]">· optional</span></p>
              <span className="text-[12px] text-[#A3A3A3] hidden sm:inline">Every result lists the exact rules it passed</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {[{ id: null as string | null, name: "Filters only", summary: `No setup: ${marketDef.label} stocks matching the filters below.` }, ...setupsFor(strategy)].map((p) => {
                const on = setupId === p.id;
                return (
                  <button key={p.id ?? "none"} onClick={() => setSetupId(p.id)} aria-pressed={on}
                    className={`text-left rounded-xl border px-3.5 py-3 transition-all ${on ? "border-[#1F65F0] bg-[#F5F8FF] shadow-[0_0_0_3px_rgba(31,101,240,0.10)]" : "border-[#E5E5E5] hover:border-[#A3A3A3] bg-white"}`}>
                    <span className={`text-[14px] font-bold ${on ? "text-[#1F65F0]" : "text-[#0A0A0A]"}`}>{p.name}</span>
                    <span className="block text-[12px] text-[#525252] mt-1 leading-snug">{p.summary}</span>
                  </button>
                );
              })}
            </div>

            {/* Saved screens */}
            <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-[#F0F0F0]">
              <span className="text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-wider shrink-0">Saved screens</span>
              {strategyScreens.length === 0 && <span className="text-[12px] text-[#A3A3A3]">None yet for {strategy === "swing" ? "swing trading" : "long-term investing"}</span>}
              {strategyScreens.map((s) => (
                <button key={s.id} onClick={() => loadScreen(s)} title={`${MARKETS.find((m) => m.id === s.market)?.label} · saved ${new Date(s.updatedAt).toLocaleDateString()}`}
                  className={`px-3 py-1 rounded-full text-[12px] font-semibold border transition-all ${activeScreen === s.id ? "bg-[#1F65F0] text-white border-[#1F65F0]" : "bg-[#F7F7F8] text-[#525252] border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"}`}>
                  {s.name}{s.market !== "US" ? ` · ${s.market}` : ""}
                </button>
              ))}
              <span className="flex-1" />
              {active ? (
                <span className="flex items-center gap-1.5 flex-wrap">
                  {dirty && <button onClick={updateActive} className="px-3 py-1 rounded-full text-[12px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8]">Save changes to &ldquo;{active.name}&rdquo;</button>}
                  <button onClick={() => { setSaveMode("new"); setSaveName(`${active.name} (copy)`); }} className="px-3 py-1 rounded-full text-[12px] font-semibold text-[#525252] border border-[#E5E5E5] hover:border-[#0A0A0A]">Save as new</button>
                  <button onClick={() => { setSaveMode("rename"); setSaveName(active.name); }} className="px-3 py-1 rounded-full text-[12px] font-semibold text-[#525252] border border-[#E5E5E5] hover:border-[#0A0A0A]">Rename</button>
                  <button onClick={deleteActive} className="px-3 py-1 rounded-full text-[12px] font-semibold text-[#DC2626] border border-[#E5E5E5] hover:border-[#DC2626]">Delete</button>
                </span>
              ) : (
                <button onClick={() => { setSaveMode("new"); setSaveName(""); }} disabled={!setupId && !activeFilters.length}
                  title={!setupId && !activeFilters.length ? "Pick a setup or set some filters first" : "Save this screen"}
                  className="px-3 py-1 rounded-full text-[12px] font-semibold text-[#525252] border border-dashed border-[#D4D4D4] hover:border-[#1F65F0] hover:text-[#1F65F0] disabled:opacity-40">
                  + Save this screen
                </button>
              )}
            </div>
          </section>

          {/* ── Step 3: filters for this strategy only ── */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] mb-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5]">
              <span className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">3 · Filters <span className="normal-case tracking-normal font-normal text-[#A3A3A3]">· {strategy === "swing" ? "swing" : "long-term"} filters only</span></span>
              {(activeFilters.length > 0 || setupId) && (
                <button onClick={() => { setFilters({}); setSetupId(null); setActiveScreen(null); }} className="text-[11px] text-[#EF4444] hover:text-[#DC2626] font-semibold">Reset</button>
              )}
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {filtersFor(strategy).map((f) => (
                <div key={f.key}>
                  <label htmlFor={`f-${f.key}`} className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider truncate" title={f.needs ? `Looked up for the ${LOOKUP_LIMIT} largest candidates` : undefined}>
                    {f.label}{f.needs && f.key !== "sector" ? " *" : ""}
                  </label>
                  <select id={`f-${f.key}`} value={filters[f.key] ?? ""} onChange={(e) => setFilter(f.key, e.target.value)}
                    className={`w-full rounded-xl px-2.5 py-2 text-[13px] border focus:outline-none transition-all ${filters[f.key] ? "bg-[#EBF2FF] text-[#1F65F0] border-[#1F65F0]" : "bg-[#F7F7F8] text-[#0A0A0A] border-[#E5E5E5] focus:border-[#1F65F0] focus:bg-white"}`}>
                    <option value="">Any</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {activeFilters.length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {activeFilters.map((f) => (
                  <span key={f.key} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-[#EBF2FF] border border-[#1F65F0]/20 text-[#1F65F0] text-[11px] font-semibold rounded-full">
                    <span className="opacity-60">{f.label}:</span> {optionLabel(f.key, filters[f.key])}
                    <button onClick={() => setFilter(f.key, "")} className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-[#1F65F0]/10" aria-label={`Clear ${f.label}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <p className="px-4 pb-3 text-[11px] text-[#A3A3A3]">
              * Needs company fundamentals or price history, looked up for the {LOOKUP_LIMIT} largest stocks that pass the other filters.
              Market caps and prices are in each listing&apos;s own currency.
            </p>
          </div>

          {/* ── Results bar ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2 px-0.5">
            <div className="text-[13px] text-[#525252]">
              {data === undefined || (loading && !data) ? "Loading…" : !data ? (
                <span className="text-[#EF4444]">Screener data unavailable. Try Refresh in a moment.</span>
              ) : (
                <>
                  <span className="font-semibold text-[#0A0A0A]">{displayed.length}</span>
                  {search.trim() ? ` of ${results.length}` : ""} results
                  <span className="text-[#A3A3A3]">
                    {" "}· {setup ? `${setup.name} setup` : active ? active.name : activeFilters.length ? "custom filters" : `${marketDef.label} stocks`}
                    {" "}· checked {needs.size ? `the ${lookupSet.length} largest of ${quoteStage.length} candidates` : `${data.value.results.length} stocks`}
                  </span>
                  {pending > 0 && <span className="ml-2 text-[#1F65F0]">Looking up {pending} more…</span>}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {lists && displayed.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <select value={bulkList} onChange={(e) => setBulkList(e.target.value)} aria-label="Watchlist to add results to"
                    className="px-2 py-1.5 text-[12px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0]">
                    {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button onClick={addAllToList} className="px-3 py-1.5 text-[12px] font-semibold text-[#1F65F0] border border-[#C7DAFE] bg-[#F5F8FF] rounded-xl hover:bg-[#EBF2FF]">
                    + Add all {displayed.length}
                  </button>
                </span>
              )}
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find in these results…" aria-label="Find a ticker or company in these results"
                className="w-52 bg-white border border-[#E5E5E5] rounded-xl px-3 py-1.5 text-[13px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#1F65F0]" />
            </div>
          </div>
          {bulkMsg && <p className="text-[12px] text-[#166534] mb-2 px-0.5">✓ {bulkMsg}</p>}
          {data?.value.coverage === "universe" && (
            <p className="text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2 mb-2">
              {market === "US"
                ? `Yahoo's market-wide screener isn't responding, so this screens the app's list of ${data.value.results.length} large US companies instead.`
                : `Screening ${data.value.results.length} large Singapore Exchange listings (Straits Times Index members and other large SGX stocks).`}
            </p>
          )}

          {/* ── Results table ── */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 980 }}>
                <thead>
                  <tr className="border-b border-[#E5E5E5] bg-[#F7F7F8]">
                    <th className="pl-4 pr-1 py-2.5 text-[11px] font-semibold text-[#A3A3A3] w-8 text-left">#</th>
                    <th className={`${thCls("ticker")} text-left`} onClick={() => handleSort("ticker")}>Stock <SortIcon active={sk === "ticker"} dir={sortKey ? sortDir : "desc"} /></th>
                    {columns.map((c) => (
                      <th key={c.key} title={c.title} className={`${thCls(c.key)} text-right`} onClick={() => handleSort(c.key)}>
                        {c.label} <SortIcon active={sk === c.key} dir={sortKey ? sortDir : "desc"} />
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-[#525252] text-left whitespace-nowrap">Why it matched</th>
                    <th className="px-3 py-2.5 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {data === undefined || (loading && !data) ? (
                    <tr><td colSpan={columns.length + 4} className="py-20 text-center text-[13px] text-[#525252]">Fetching {marketDef.label} stocks from Yahoo Finance…</td></tr>
                  ) : !data ? (
                    <tr><td colSpan={columns.length + 4} className="py-20 text-center">
                      <p className="text-[#0A0A0A] font-semibold text-[13px] mb-1">Screener unavailable</p>
                      <button onClick={() => load(true)} className="mt-2 text-[13px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8] px-4 py-2 rounded-xl">Retry</button>
                    </td></tr>
                  ) : displayed.length === 0 ? (
                    <tr><td colSpan={columns.length + 4} className="py-16 text-center">
                      {pending > 0 ? (
                        <p className="text-[#525252] text-[13px]">Checking candidates… {pending} left to look up.</p>
                      ) : setup ? (
                        <>
                          <p className="text-[#0A0A0A] font-semibold text-[13px]">No stocks passed every {setup.name} rule{activeFilters.length ? " and filter" : ""}.</p>
                          <p className="text-[#525252] text-[12px] mt-1">{strategy === "swing" ? "Clean setups are rare on any given day. Try another setup, or run it again after the next session." : "Try loosening a filter, or another setup."}</p>
                        </>
                      ) : <p className="text-[#525252] text-[13px]">No stocks matched these filters.</p>}
                    </td></tr>
                  ) : displayed.map((r, i) => {
                    const ctx = contextFor(r.row.ticker);
                    const all = [...r.reasons, ...ctx];
                    const isOpen = expanded === r.row.ticker;
                    return (
                      <Fragment key={r.row.ticker}>
                        <tr className={`transition-colors ${isOpen ? "bg-[#F5F8FF]" : "hover:bg-[#F7F7F8]"}`}>
                          <td className="pl-4 pr-1 py-2.5 text-[11px] text-[#A3A3A3] tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2.5 max-w-[200px]">
                            <span className="flex items-center gap-1.5"><TickerLink ticker={r.row.ticker} />{r.row.currency && r.row.currency !== "USD" && <span className="text-[10px] font-semibold text-[#737373] border border-[#E5E5E5] rounded px-1">{r.row.currency}</span>}</span>
                            <p className="text-[11px] text-[#737373] truncate" title={r.row.name}>{r.row.name}</p>
                          </td>
                          {columns.map((c) => <td key={c.key} className="px-3 py-2.5 text-right text-[13px] text-[#525252] tabular-nums whitespace-nowrap">{c.render(r)}</td>)}
                          <td className="px-3 py-2.5 max-w-[260px]">
                            {all.length ? (
                              <button onClick={() => setExpanded(isOpen ? null : r.row.ticker)} className="flex items-center gap-1.5 text-left w-full group" title="Why am I seeing this?">
                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg border truncate ${TONE_CLS[all[0].tone]}`}>{all[0].text}</span>
                                {all.length > 1 && <span className="text-[11px] font-semibold text-[#1F65F0] shrink-0 group-hover:underline">+{all.length - 1}</span>}
                              </button>
                            ) : <span className="text-[11px] text-[#A3A3A3]">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <WatchButton
                              ticker={r.row.ticker}
                              lists={lists}
                              size="sm"
                              defaultIntent={strategy}
                              defaultNote={`${setup ? `${setup.name}: ` : ""}${r.reasons.map((x) => x.text).join("; ")}`}
                              meta={{ exchange: r.row.exchange ?? undefined, currency: r.row.currency ?? undefined, addedPrice: r.row.price ?? undefined }}
                              onSaved={setLists}
                            />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-[#F5F8FF]">
                            <td />
                            <td colSpan={columns.length + 3} className="px-3 pb-4 pt-1">
                              <p className="text-[12px] font-bold text-[#0A0A0A] mb-2">Why am I seeing {r.row.ticker}?</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">{setup ? `Passed every ${setup.name} rule` : "Matched your filters"}</p>
                                  {r.reasons.length ? (
                                    <ul className="space-y-1">{r.reasons.map((x) => <li key={x.text} className="text-[13px] text-[#262626]">✓ {x.text}</li>)}</ul>
                                  ) : <p className="text-[13px] text-[#A3A3A3]">No setup or filters: part of the {marketDef.label} list.</p>}
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">For your portfolio</p>
                                  {ctx.length ? (
                                    <ul className="space-y-1">{ctx.map((x) => (
                                      <li key={x.text} className={`text-[13px] ${x.tone === "warn" ? "text-[#92400E]" : x.tone === "good" ? "text-[#166534]" : "text-[#262626]"}`}>{x.tone === "warn" ? "⚠" : "•"} {x.text}</li>
                                    ))}</ul>
                                  ) : <p className="text-[13px] text-[#A3A3A3]">{extra[r.row.ticker]?.industry !== undefined ? "No overlap with your holdings or watchlists." : "Looking up sector…"}</p>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {data && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <SourceTag source={`Quotes: ${data.source}`} asOf={data.asOf} cached={data.cached} />
              {needs.has("chart") && <span className="text-[11px] text-[#A3A3A3]">RSI and 1-month change calculated from Yahoo Finance daily closes</span>}
              {needs.has("fundamentals") && <span className="text-[11px] text-[#A3A3A3]">Fundamentals: Yahoo Finance key statistics</span>}
            </div>
          )}
        </>
      )}

      {/* ── Save / rename modal ── */}
      {saveMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-[18px] font-black text-[#0A0A0A] mb-1">{saveMode === "rename" ? "Rename screen" : "Save screen"}</h2>
            <p className="text-[13px] text-[#525252] mb-4">
              {strategy === "swing" ? "Swing" : "Long-term"} · {marketDef.label}{setup ? ` · ${setup.name}` : ""}{activeFilters.length ? ` · ${activeFilters.length} filter${activeFilters.length > 1 ? "s" : ""}` : ""}
            </p>
            <input autoFocus type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveScreen(); if (e.key === "Escape") setSaveMode(null); }}
              placeholder="e.g. SG dividend payers, Tech pullbacks…"
              className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#1F65F0] mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setSaveMode(null)} className="flex-1 py-2.5 text-[13px] font-semibold text-[#525252] border border-[#E5E5E5] rounded-xl hover:border-[#0A0A0A]">Cancel</button>
              <button onClick={saveScreen} disabled={!saveName.trim()} className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8] rounded-xl disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
