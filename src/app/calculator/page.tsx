"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { formatCurrency, formatPercent, formatLargeNumber, formatVolume } from "@/lib/formatters";
import TickerLink from "@/components/TickerLink";
import WatchButton from "@/components/WatchButton";
import { SWING_PRESETS, SwingPresetId, Reason, evaluate, contextReasons, Holding, MIN_MARKET_CAP, MIN_PRICE } from "@/lib/rules";
import { getFundamentals, getQuotes } from "@/lib/data";
import { loadPortfolio, loadWatchlist } from "@/lib/store";
import { useSettings } from "@/hooks/useSettings";
import { PortfolioPosition, WatchlistItem } from "@/lib/types";

// ─── types ───────────────────────────────────────────────────────────────────

interface Filters {
  sector: string;
  marketCap: string;
  pe: string;
  price: string;
  change: string;
  relVolume: string;
  float: string;
  divYield: string;
}

interface Preset {
  name: string;
  filters: Filters;
  builtIn?: boolean;
  note?: string;
}

interface ScreenerRow {
  ticker: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketCap: number | null;
  pe: number | null;
  divYield: number | null;
  relVolume: number | null;
  floatShares?: number | null;
  sma50: number | null;
  sma200: number | null;
  high52: number | null;
  low52: number | null;
  /** Why this row matched: rule sentences for swing presets, filter descriptions otherwise */
  reasons: Reason[];
}

// How many top results get sector/industry looked up for portfolio context
const CONTEXT_LOOKUPS = 25;

type SortKey = "ticker" | "name" | "price" | "changePercent" | "volume" | "relVolume" | "marketCap" | "pe" | "divYield";
type SortDir = "asc" | "desc";

// ─── constants ───────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Filters = {
  sector: "", marketCap: "", pe: "", price: "", change: "",
  relVolume: "", float: "", divYield: "",
};

const LS_KEY = "screener_presets_v1";

const FILTER_OPTIONS = {
  sector: [
    { label: "Technology",       value: "Technology" },
    { label: "Communication",    value: "Communication" },
    { label: "Consumer Disc.",   value: "Consumer Disc." },
    { label: "Consumer Staples", value: "Consumer Staples" },
    { label: "Healthcare",       value: "Healthcare" },
    { label: "Financials",       value: "Financials" },
    { label: "Energy",           value: "Energy" },
    { label: "Industrials",      value: "Industrials" },
    { label: "Utilities",        value: "Utilities" },
    { label: "Materials",        value: "Materials" },
    { label: "Real Estate",      value: "Real Estate" },
  ],
  marketCap: [
    { label: "Mega (>$200B)",     value: "mega" },
    { label: "Large ($10B–$200B)", value: "large" },
    { label: "Mid ($2B–$10B)",    value: "mid" },
    { label: "Small ($300M–$2B)", value: "small" },
    { label: "Micro (<$300M)",    value: "micro" },
    { label: "Nano (<$50M)",      value: "nano" },
  ],
  pe: [
    { label: "Under 10",   value: "u10" },
    { label: "10 – 20",   value: "10-20" },
    { label: "20 – 30",   value: "20-30" },
    { label: "30 – 50",   value: "30-50" },
    { label: "Over 50",   value: "o50" },
    { label: "Negative",  value: "neg" },
  ],
  price: [
    { label: "$1 – $20",     value: "1-20" },
    { label: "Under $5",     value: "u5" },
    { label: "$5 – $10",     value: "5-10" },
    { label: "Under $25",    value: "u25" },
    { label: "$25 – $100",   value: "25-100" },
    { label: "$100 – $250",  value: "100-250" },
    { label: "$250 – $500",  value: "250-500" },
    { label: "Over $500",    value: "o500" },
  ],
  change: [
    { label: "Up 20%+",        value: "u20plus" },
    { label: "Up 10%+",        value: "u10plus" },
    { label: "Up 5%+",         value: "u5plus" },
    { label: "Up 3%+",         value: "uu" },
    { label: "Up 1%+",         value: "u" },
    { label: "Flat (±1%)",     value: "flat" },
    { label: "Down 1%+",       value: "d" },
    { label: "Down 3%+",       value: "dd" },
  ],
  relVolume: [
    { label: "10× Avg+",   value: "o10" },
    { label: "5× Avg+",    value: "o5" },
    { label: "3× Avg+",    value: "o3" },
    { label: "2× Avg+",    value: "o2" },
    { label: "1.5× Avg+",  value: "o1.5" },
  ],
  float: [
    { label: "Under 1M",   value: "u1" },
    { label: "Under 5M",   value: "u5" },
    { label: "Under 10M",  value: "u10" },
    { label: "Under 20M",  value: "u20" },
    { label: "Under 50M",  value: "u50" },
    { label: "Under 100M", value: "u100" },
  ],
  divYield: [
    { label: "None (0%)",  value: "none" },
    { label: "Under 1%",   value: "u1" },
    { label: "1% – 2%",   value: "1-2" },
    { label: "2% – 4%",   value: "2-4" },
    { label: "Over 4%",    value: "o4" },
  ],
};

const FILTER_LABELS: Record<keyof Filters, string> = {
  sector: "Sector", marketCap: "Market Cap", pe: "P/E Ratio",
  price: "Price", change: "Change %", relVolume: "Rel. Volume",
  float: "Float", divYield: "Dividend",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-[#A3A3A3]">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function ChgBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[#A3A3A3]">—</span>;
  return (
    <span className={`font-semibold tabular-nums ${v >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
      {formatPercent(v)}
    </span>
  );
}

/** For manual filters: one sentence per active filter, showing the stock's actual value */
function filterReasons(filters: Filters, r: Omit<ScreenerRow, "reasons">): Reason[] {
  const label = (k: keyof Filters) => FILTER_OPTIONS[k].find((o) => o.value === filters[k])?.label ?? filters[k];
  const out: Reason[] = [];
  const add = (k: keyof Filters, actual: string) => out.push({ text: `${FILTER_LABELS[k]} ${label(k)}: ${actual}`, tone: "neutral", kind: "signal" });
  if (filters.sector) add("sector", "matches");
  if (filters.change && r.changePercent !== null) add("change", formatPercent(r.changePercent));
  if (filters.relVolume && r.relVolume !== null) add("relVolume", `${r.relVolume.toFixed(1)}× average`);
  if (filters.price && r.price !== null) add("price", formatCurrency(r.price));
  if (filters.marketCap && r.marketCap !== null) add("marketCap", formatLargeNumber(r.marketCap));
  if (filters.pe && r.pe !== null) add("pe", r.pe.toFixed(1));
  if (filters.divYield) add("divYield", r.divYield ? `${(r.divYield * 100).toFixed(2)}%` : "none");
  if (filters.float && r.floatShares) add("float", formatVolume(r.floatShares));
  return out;
}

const TONE_CLS: Record<Reason["tone"], string> = {
  good: "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]",
  warn: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]",
  neutral: "bg-[#F7F7F8] text-[#404040] border-[#E5E5E5]",
};

function Skeleton() {
  return <span className="inline-block h-3.5 w-14 bg-[#F0F0F0] rounded animate-pulse" />;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const [userPresets, setUserPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [swingId, setSwingId] = useState<SwingPresetId | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Portfolio context for "why am I seeing this?"
  const { settings } = useSettings();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { sector: string | null; industry: string | null }>>({});
  const [filters, setFilters]     = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults]     = useState<ScreenerRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [hasRun, setHasRun]       = useState(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("changePercent");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName]   = useState("");
  const saveInputRef              = useRef<HTMLInputElement>(null);
  // Only the newest screen may set results, so a slow earlier request can't overwrite it
  const screenId                  = useRef(0);

  // Load user presets from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setUserPresets(JSON.parse(raw));
    } catch {}
  }, []);

  // Load portfolio + watchlist, and each holding's industry, for portfolio-context reasons
  useEffect(() => {
    loadWatchlist().then(setWatchlist);
    loadPortfolio().then(async (ps) => {
      setPositions(ps);
      const tickers = Array.from(new Set(ps.map((p) => p.ticker)));
      const [quotes, funds] = await Promise.all([
        getQuotes(tickers),
        Promise.all(tickers.map((t) => getFundamentals(t))),
      ]);
      setHoldings(tickers.map((t, i) => ({
        ticker: t,
        sector: funds[i]?.value.profile.sector ?? ps.find((p) => p.ticker === t)?.sector ?? null,
        industry: funds[i]?.value.profile.industry ?? null,
        value: ps.filter((p) => p.ticker === t).reduce((s, p) => s + p.quantity * (quotes[t]?.value.price ?? p.purchasePrice), 0),
      })));
    });
  }, []);

  function loadSwing(id: SwingPresetId) {
    if (swingId === id) { setSwingId(null); return; }
    setSwingId(id);
    setActivePreset(null);
    setFilters(EMPTY_FILTERS);
  }

  function persistPresets(list: Preset[]) {
    setUserPresets(list);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function loadPreset(preset: Preset) {
    setFilters(preset.filters);
    setActivePreset(preset.name);
    setSwingId(null);
  }

  function clearAllFilters() {
    setFilters(EMPTY_FILTERS);
    setActivePreset(null);
    setSwingId(null);
    setSearch("");
  }

  function setFilter(key: keyof Filters, val: string) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === val ? "" : val }));
    setActivePreset(null); // deselect preset when manually changing filter
  }

  function clearFilter(key: string) {
    setFilters((prev) => ({ ...prev, [key]: "" }));
    setActivePreset(null);
  }

  function openSaveModal() {
    setSaveName("");
    setShowSaveModal(true);
    setTimeout(() => saveInputRef.current?.focus(), 50);
  }

  function savePreset() {
    const name = saveName.trim();
    if (!name) return;
    const preset: Preset = { name, filters };
    persistPresets([...userPresets.filter((p) => p.name !== name), preset]);
    setActivePreset(name);
    setShowSaveModal(false);
  }

  function deleteUserPreset(name: string) {
    persistPresets(userPresets.filter((p) => p.name !== name));
    if (activePreset === name) setActivePreset(null);
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  // Run the screen via Yahoo Finance screener API
  const runScreen = useCallback(async () => {
    const id = ++screenId.current;
    setLoading(true);
    setHasRun(true);
    setScreenerError(null);

    const params = new URLSearchParams();
    (Object.entries(filters) as [keyof Filters, string][]).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const swing = SWING_PRESETS.find((p) => p.id === swingId) ?? null;
    if (swing) {
      params.set("minCap", String(MIN_MARKET_CAP));
      params.set("minPrice", String(MIN_PRICE));
      params.set("sort", swing.query.sort);
      if (swing.query.minChange !== undefined) params.set("minChange", String(swing.query.minChange));
    }

    try {
      const resp = await fetch(`/api/finviz?${params.toString()}`);
      const data = await resp.json();
      if (id !== screenId.current) return;

      if (data.error) {
        setScreenerError(data.error);
        setResults([]);
        setLoading(false);
        return;
      }

      let rows: Omit<ScreenerRow, "reasons">[] = data.results ?? [];

      // Drop stocks with negligible volume (warrants, thin issues)
      rows = rows.filter((r) => r.volume === null || r.volume >= 10_000);

      // ── Client-side filters ──────────────────────────────────────────────────
      // Yahoo screener only reliably applies: exchange + percentchange filters.
      // Everything else is post-filtered here from the returned quote data.

      if (filters.price) {
        rows = rows.filter((r) => {
          if (r.price === null) return false;
          switch (filters.price) {
            case "1-20":    return r.price >= 1    && r.price < 20;
            case "u5":      return r.price < 5;
            case "5-10":    return r.price >= 5    && r.price < 10;
            case "u25":     return r.price < 25;
            case "25-100":  return r.price >= 25   && r.price < 100;
            case "100-250": return r.price >= 100  && r.price < 250;
            case "250-500": return r.price >= 250  && r.price < 500;
            case "o500":    return r.price >= 500;
            default:        return true;
          }
        });
      }

      if (filters.change) {
        rows = rows.filter((r) => {
          const c = r.changePercent;
          if (c === null) return false;
          switch (filters.change) {
            case "u20plus": return c > 20;
            case "u10plus": return c > 10;
            case "u5plus":  return c > 5;
            case "uu":      return c > 3;
            case "u":       return c > 1;
            case "flat":    return c >= -1 && c <= 1;
            case "d":       return c < -1;
            case "dd":      return c < -3;
            default:        return true;
          }
        });
      }

      if (filters.marketCap) {
        rows = rows.filter((r) => {
          const m = r.marketCap;
          if (m === null) return false;
          switch (filters.marketCap) {
            case "mega":  return m >= 200e9;
            case "large": return m >= 10e9  && m < 200e9;
            case "mid":   return m >= 2e9   && m < 10e9;
            case "small": return m >= 300e6 && m < 2e9;
            case "micro": return m >= 50e6  && m < 300e6;
            case "nano":  return m < 50e6;
            default:      return true;
          }
        });
      }

      if (filters.pe) {
        rows = rows.filter((r) => {
          const p = r.pe;
          switch (filters.pe) {
            case "u10":   return p !== null && p > 0   && p < 10;
            case "10-20": return p !== null && p >= 10  && p < 20;
            case "20-30": return p !== null && p >= 20  && p < 30;
            case "30-50": return p !== null && p >= 30  && p < 50;
            case "o50":   return p !== null && p >= 50;
            case "neg":   return p !== null && p < 0;
            default:      return true;
          }
        });
      }

      if (filters.divYield) {
        rows = rows.filter((r) => {
          const d = r.divYield;
          switch (filters.divYield) {
            case "none": return d === null || d === 0;
            case "u1":   return d !== null && d > 0     && d < 0.01;
            case "1-2":  return d !== null && d >= 0.01 && d < 0.02;
            case "2-4":  return d !== null && d >= 0.02 && d < 0.04;
            case "o4":   return d !== null && d >= 0.04;
            default:     return true;
          }
        });
      }

      if (filters.relVolume) {
        const thresholds: Record<string, number> = {
          "o10": 10, "o5": 5, "o3": 3, "o2": 2, "o1.5": 1.5,
        };
        const min = thresholds[filters.relVolume];
        if (min) rows = rows.filter((r) => r.relVolume !== null && r.relVolume >= min);
      }

      if (filters.float) {
        const floatMax: Record<string, number> = {
          "u1": 1e6, "u5": 5e6, "u10": 10e6, "u20": 20e6, "u50": 50e6, "u100": 100e6,
        };
        const max = floatMax[filters.float];
        if (max) rows = rows.filter((r) => r.floatShares == null || r.floatShares <= max);
      }

      // Attach the reasons each row matched. Swing presets run their rules here and
      // drop anything that fails; plain filters describe the stock's value for each filter.
      const withReasons: ScreenerRow[] = swing
        ? rows.flatMap((r) => {
            const res = evaluate(swing, { ...r, high52: r.high52, low52: r.low52 });
            return res.pass ? [{ ...r, reasons: [...res.reasons, ...filterReasons(filters, r)] }] : [];
          })
        : rows.map((r) => ({ ...r, reasons: filterReasons(filters, r) }));

      setResults(withReasons);
      setExpanded(null);
    } catch (e) {
      if (id !== screenId.current) return;
      setScreenerError(String(e));
      setResults([]);
    }

    setLoading(false);
  }, [filters, swingId]);

  // Screen on open (no setup = the default list of large US stocks) and again whenever the
  // setup or filters change; the short delay lets several quick filter changes run once
  useEffect(() => {
    const t = setTimeout(runScreen, 250);
    return () => clearTimeout(t);
  }, [runScreen]);

  // Sorted & searched results
  const displayed = useMemo(() => {
    let out = results;

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      out = out.filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
    }

    return [...out].sort((a, b) => {
      let av: number | string | null = null;
      let bv: number | string | null = null;
      switch (sortKey) {
        case "ticker":        av = a.ticker;        bv = b.ticker;        break;
        case "name":          av = a.name;          bv = b.name;          break;
        case "price":         av = a.price;         bv = b.price;         break;
        case "changePercent": av = a.changePercent; bv = b.changePercent; break;
        case "volume":        av = a.volume;        bv = b.volume;        break;
        case "relVolume":     av = a.relVolume;     bv = b.relVolume;     break;
        case "marketCap":     av = a.marketCap;     bv = b.marketCap;     break;
        case "pe":            av = a.pe;            bv = b.pe;            break;
        case "divYield":      av = a.divYield;      bv = b.divYield;      break;
      }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [results, search, sortKey, sortDir]);

  // Look up sector/industry for the top results (cached 6h) so context reasons can compare
  // them with what the investor already holds
  useEffect(() => {
    const missing = displayed.slice(0, CONTEXT_LOOKUPS).map((r) => r.ticker).filter((t) => !(t in profiles));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(async (t) => [t, (await getFundamentals(t))?.value.profile] as const)).then((pairs) => {
      if (cancelled) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const [t, p] of pairs) next[t] = { sector: p?.sector ?? null, industry: p?.industry ?? null };
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [displayed]); // eslint-disable-line react-hooks/exhaustive-deps

  const contextFor = useCallback((ticker: string): Reason[] => contextReasons({
    ticker,
    sector: profiles[ticker]?.sector ?? null,
    industry: profiles[ticker]?.industry ?? null,
    holdings,
    positions,
    watchlist,
    watchedSectors: settings?.profile.sectors ?? [],
  }), [profiles, holdings, positions, watchlist, settings]);

  const activeSwing   = SWING_PRESETS.find((p) => p.id === swingId) ?? null;
  const activeFilters = (Object.entries(filters) as [keyof Filters, string][]).filter(([, v]) => v !== "");
  const hasFilters    = activeFilters.length > 0 || swingId !== null;
  const allPresets    = userPresets;

  const thCls = (key: SortKey) =>
    `px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer select-none transition-colors ${
      sortKey === key
        ? "text-[#1F65F0] bg-[#EBF2FF]"
        : "text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8]"
    }`;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Stock Screener</h1>
          <p className="text-[14px] text-[#525252] mt-0.5">Pick a setup, or narrow the list with filters. Results update automatically.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={runScreen}
            disabled={loading}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8] px-4 py-2 rounded-xl disabled:opacity-60 transition-colors"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Screener setups ── */}
      <section className="bg-white rounded-2xl border border-[#E5E5E5] mb-4 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-bold text-[#0A0A0A]">Screener setups</h2>
          <span className="text-[12px] text-[#A3A3A3] hidden sm:inline">Every result lists the exact rules it passed</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[{ id: null, name: "All large US stocks", summary: "No setup: US-listed stocks over $1B market cap, biggest movers first." }, ...SWING_PRESETS].map((p) => {
            const active = p.id === null ? swingId === null && !activePreset : swingId === p.id;
            return (
              <button
                key={p.id ?? "default"}
                onClick={() => (p.id === null ? clearAllFilters() : loadSwing(p.id))}
                aria-pressed={active}
                className={`text-left rounded-xl border px-3.5 py-3 transition-all ${
                  active
                    ? "border-[#1F65F0] bg-[#F5F8FF] shadow-[0_0_0_3px_rgba(31,101,240,0.10)]"
                    : "border-[#E5E5E5] hover:border-[#A3A3A3] bg-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-[#1F65F0] text-white" : "bg-[#F0F0F0] text-[#525252]"}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {p.id === null
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />}
                    </svg>
                  </span>
                  <span className={`text-[14px] font-bold ${active ? "text-[#1F65F0]" : "text-[#0A0A0A]"}`}>{p.name}</span>
                </span>
                <span className="block text-[12px] text-[#525252] mt-1.5 leading-snug">{p.summary}</span>
              </button>
            );
          })}
        </div>

        {/* Saved filter sets */}
        <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-[#F0F0F0]">
          <span className="text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-wider shrink-0">Your saved filters</span>
          {allPresets.length === 0 && <span className="text-[12px] text-[#A3A3A3]">None yet</span>}
          {allPresets.map((preset) => {
            const isActive = activePreset === preset.name;
            return (
              <div key={preset.name} className="relative group flex items-center">
                <button
                  onClick={() => {
                    if (isActive) { setActivePreset(null); setFilters(EMPTY_FILTERS); }
                    else loadPreset(preset);
                  }}
                  className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all border ${
                    isActive ? "bg-[#1F65F0] text-white border-[#1F65F0]" : "bg-[#F7F7F8] text-[#525252] border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
                  }`}
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => deleteUserPreset(preset.name)}
                  className="ml-1 w-4 h-4 rounded-full bg-[#E5E5E5] hover:bg-[#EF4444] hover:text-white text-[#525252] text-[10px] font-bold flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete saved filters"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            onClick={openSaveModal}
            disabled={activeFilters.length === 0}
            title={activeFilters.length === 0 ? "Set some filters below first" : "Save the current filters"}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold text-[#525252] border border-dashed border-[#D4D4D4] hover:border-[#1F65F0] hover:text-[#1F65F0] disabled:opacity-40 disabled:hover:border-[#D4D4D4] disabled:hover:text-[#525252] transition-all"
          >
            + Save current filters
          </button>
        </div>
      </section>

      {/* ── Setup explainer ── */}
      {activeSwing && (
        <div className="mb-4 px-4 py-3 bg-[#F5F8FF] border border-[#D6E4FF] rounded-2xl">
          <p className="text-[12px] text-[#525252]">
            <span className="font-semibold text-[#0A0A0A]">{activeSwing.name}</span> only looks at US-listed stocks over $2B market cap and $5 a share.
            These rules describe the chart, not where it goes next.
          </p>
        </div>
      )}

      {/* ── Filter panel ── */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5]">
          <span className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Filters <span className="normal-case tracking-normal font-normal text-[#A3A3A3]">· optional, combine with any setup</span></span>
          {hasFilters && (
            <button
              onClick={clearAllFilters}
              className="text-[11px] text-[#EF4444] hover:text-[#DC2626] font-semibold transition-colors"
            >
              Reset all
            </button>
          )}
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(Object.keys(FILTER_OPTIONS) as (keyof Filters)[]).map((key) => (
            <div key={key}>
              <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">{FILTER_LABELS[key]}</label>
              <select
                value={filters[key]}
                onChange={(e) => setFilter(key, e.target.value)}
                className={`w-full rounded-xl px-2.5 py-2 text-[13px] border focus:outline-none focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] transition-all ${
                  filters[key]
                    ? "bg-[#EBF2FF] text-[#1F65F0] border-[#1F65F0]"
                    : "bg-[#F7F7F8] text-[#0A0A0A] border-[#E5E5E5] focus:border-[#1F65F0] focus:bg-white"
                }`}
              >
                <option value="">Any</option>
                {FILTER_OPTIONS[key].map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {activeFilters.map(([key, val]) => {
              const opts = FILTER_OPTIONS[key] as { label: string; value: string }[] | undefined;
              const label = opts?.find((o) => o.value === val)?.label ?? val;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-[#EBF2FF] border border-[#1F65F0]/20 text-[#1F65F0] text-[11px] font-semibold rounded-full"
                >
                  <span className="opacity-60">{FILTER_LABELS[key]}:</span> {label}
                  <button
                    onClick={() => clearFilter(key)}
                    className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-[#1F65F0]/10 transition-colors"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

      </div>

      {/* ── Results info bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2 px-0.5">
        <p className="text-[13px] text-[#525252]">
          {loading
            ? "Scanning…"
            : screenerError
            ? <span className="text-[#EF4444]">Screener unavailable — try again in a moment</span>
            : <>
                <span className="font-semibold text-[#0A0A0A]">{displayed.length}</span>
                {search.trim() ? ` of ${results.length}` : ""} results
                <span className="text-[#A3A3A3]"> · {activeSwing ? `${activeSwing.name} setup` : activePreset ? activePreset : activeFilters.length ? "custom filters" : "default list: large US stocks"}</span>
              </>
          }
        </p>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A3A3A3] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find in these results…"
            aria-label="Find a ticker or company in these results"
            className="w-56 bg-white border border-[#E5E5E5] rounded-xl pl-8 pr-3 py-1.5 text-[13px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#1F65F0]"
          />
        </div>
      </div>

      {/* ── Results table ── */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 860 }}>
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#F7F7F8]">
                <th className="pl-4 pr-1 py-2.5 text-[11px] font-semibold text-[#A3A3A3] w-8 text-left">#</th>
                <th className={`${thCls("ticker")} text-left`} onClick={() => handleSort("ticker")}>
                  Ticker <SortIcon active={sortKey === "ticker"} dir={sortDir} />
                </th>
                <th className={`${thCls("name")} text-left`} onClick={() => handleSort("name")}>
                  Company <SortIcon active={sortKey === "name"} dir={sortDir} />
                </th>
                <th className={`${thCls("price")} text-right`} onClick={() => handleSort("price")}>
                  Price <SortIcon active={sortKey === "price"} dir={sortDir} />
                </th>
                <th className={`${thCls("changePercent")} text-right`} onClick={() => handleSort("changePercent")}>
                  Chg % <SortIcon active={sortKey === "changePercent"} dir={sortDir} />
                </th>
                <th className={`${thCls("volume")} text-right`} onClick={() => handleSort("volume")}>
                  Volume <SortIcon active={sortKey === "volume"} dir={sortDir} />
                </th>
                <th className={`${thCls("relVolume")} text-right`} onClick={() => handleSort("relVolume")}>
                  Rel Vol <SortIcon active={sortKey === "relVolume"} dir={sortDir} />
                </th>
                <th className={`${thCls("marketCap")} text-right`} onClick={() => handleSort("marketCap")}>
                  Mkt Cap <SortIcon active={sortKey === "marketCap"} dir={sortDir} />
                </th>
                <th className={`${thCls("pe")} text-right`} onClick={() => handleSort("pe")}>
                  P/E <SortIcon active={sortKey === "pe"} dir={sortDir} />
                </th>
                <th className={`${thCls("divYield")} text-right`} onClick={() => handleSort("divYield")}>
                  Div % <SortIcon active={sortKey === "divYield"} dir={sortDir} />
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-[#525252] text-left whitespace-nowrap">Why it matched</th>
                <th className="px-3 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {!hasRun ? (
                <tr>
                  <td colSpan={12} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-10 h-10 text-[#E5E5E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="text-[#525252] text-[13px]">Loading the default list…</p>
                    </div>
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={12} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-8 h-8 text-[#1F65F0] animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <p className="text-[#525252] text-[13px]">Fetching results from Yahoo Finance…</p>
                    </div>
                  </td>
                </tr>
              ) : screenerError ? (
                <tr>
                  <td colSpan={12} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-10 h-10 text-[#E5E5E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="text-center">
                        <p className="text-[#0A0A0A] font-semibold text-[13px] mb-1">Screener unavailable</p>
                        <p className="text-[#525252] text-[12px] mb-3">Yahoo Finance authentication may have expired. Try running again.</p>
                        <button
                          onClick={runScreen}
                          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8] px-4 py-2 rounded-xl transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center">
                    {activeSwing ? (
                      <>
                        <p className="text-[#0A0A0A] font-semibold text-[13px]">No stocks passed every {activeSwing.name} rule in the latest session.</p>
                        <p className="text-[#525252] text-[12px] mt-1">That&apos;s normal: clean setups are rare on any given day. Try another setup, or run it again after the next session.</p>
                      </>
                    ) : search.trim() && results.length ? (
                      <p className="text-[#525252] text-[13px]">None of the {results.length} results match &ldquo;{search.trim()}&rdquo;.</p>
                    ) : (
                      <p className="text-[#525252] text-[13px]">No stocks matched these filters.</p>
                    )}
                  </td>
                </tr>
              ) : (
                displayed.map((r, i) => {
                  const ctx = contextFor(r.ticker);
                  const all = [...r.reasons, ...ctx];
                  const isOpen = expanded === r.ticker;
                  const watched = watchlist.find((w) => w.ticker === r.ticker) ?? null;
                  return (
                  <Fragment key={r.ticker}>
                  <tr className={`transition-colors ${isOpen ? "bg-[#F5F8FF]" : "hover:bg-[#F7F7F8]"}`}>
                    <td className="pl-4 pr-1 py-2.5 text-[11px] text-[#A3A3A3] tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><TickerLink ticker={r.ticker} /></td>
                    <td className="px-3 py-2.5 text-[#0A0A0A] text-[13px] max-w-[160px] truncate">{r.name}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#0A0A0A] tabular-nums whitespace-nowrap">
                      {r.price !== null ? formatCurrency(r.price) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <ChgBadge v={r.changePercent} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums whitespace-nowrap">
                      {formatVolume(r.volume)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums whitespace-nowrap">
                      {r.relVolume !== null ? (
                        <span className={r.relVolume >= 3 ? "text-[#22C55E] font-semibold" : "text-[#525252]"}>
                          {r.relVolume.toFixed(2)}×
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums whitespace-nowrap">
                      {r.marketCap ? formatLargeNumber(r.marketCap) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums">
                      {r.pe !== null ? r.pe.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums">
                      {r.divYield !== null && r.divYield > 0 ? `${(r.divYield * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 max-w-[260px]">
                      {all.length ? (
                        <button
                          onClick={() => setExpanded(isOpen ? null : r.ticker)}
                          className="flex items-center gap-1.5 text-left w-full group"
                          title="Why am I seeing this?"
                        >
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg border truncate ${TONE_CLS[all[0].tone]}`}>{all[0].text}</span>
                          {all.length > 1 && <span className="text-[11px] font-semibold text-[#1F65F0] shrink-0 group-hover:underline">+{all.length - 1}</span>}
                        </button>
                      ) : <span className="text-[11px] text-[#A3A3A3]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <WatchButton
                        ticker={r.ticker}
                        current={watched}
                        size="sm"
                        defaultIntent={activeSwing ? "swing" : "research"}
                        defaultNote={activeSwing
                          ? `${activeSwing.name} setup: ${r.reasons.filter((x) => x.kind === "signal").map((x) => x.text).join("; ")}`
                          : r.reasons.map((x) => x.text).join("; ")}
                        onSaved={setWatchlist}
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[#F5F8FF]">
                      <td />
                      <td colSpan={11} className="px-3 pb-4 pt-1">
                        <p className="text-[12px] font-bold text-[#0A0A0A] mb-2">Why am I seeing {r.ticker}?</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">
                              {activeSwing ? `Passed every ${activeSwing.name} rule` : "Matched your filters"}
                            </p>
                            {r.reasons.length ? (
                              <ul className="space-y-1">
                                {r.reasons.map((x) => <li key={x.text} className="text-[13px] text-[#262626]">✓ {x.text}</li>)}
                              </ul>
                            ) : <p className="text-[13px] text-[#A3A3A3]">No setup or filters: part of the default list of US-listed stocks over $1B market cap.</p>}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">For your portfolio</p>
                            {ctx.length ? (
                              <ul className="space-y-1">
                                {ctx.map((x) => (
                                  <li key={x.text} className={`text-[13px] ${x.tone === "warn" ? "text-[#92400E]" : x.tone === "good" ? "text-[#166534]" : "text-[#262626]"}`}>
                                    {x.tone === "warn" ? "⚠" : "•"} {x.text}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[13px] text-[#A3A3A3]">
                                {profiles[r.ticker] ? "No overlap with your holdings or watchlist." : "Looking up sector…"}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Save preset modal ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-[18px] font-black text-[#0A0A0A] mb-1">Save Preset</h2>
            <p className="text-[13px] text-[#525252] mb-4">Give this set of filters a name</p>
            <input
              ref={saveInputRef}
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") setShowSaveModal(false); }}
              placeholder="e.g. High Dividend, Small Cap Momentum…"
              className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-[13px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#1F65F0] focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] transition-all mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 py-2.5 text-[13px] font-semibold text-[#525252] border border-[#E5E5E5] rounded-xl hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePreset}
                disabled={!saveName.trim()}
                className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-[#1F65F0] hover:bg-[#1550D8] rounded-xl disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
