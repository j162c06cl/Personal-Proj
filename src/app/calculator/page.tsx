"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SCREENER_UNIVERSE, SCREENER_SECTORS, ScreenerStock } from "@/lib/screenerUniverse";
import { QuoteData } from "@/lib/types";
import { formatCurrency, formatPercent, formatLargeNumber, formatVolume } from "@/lib/formatters";

type ScreenerResult = ScreenerStock & Omit<QuoteData, "ticker" | "name" | "open" | "dayHigh" | "dayLow"> & {
  loaded: boolean;
};

interface Filters {
  sector: string;
  type: string;
  marketCap: string;
  pe: string;
  price: string;
  change: string;
  divYield: string;
  volume: string;
}

type SortKey = "ticker" | "name" | "sector" | "marketCap" | "pe" | "price" | "changePercent" | "volume" | "divYield";
type SortDir = "asc" | "desc";

const EMPTY_FILTERS: Filters = {
  sector: "", type: "", marketCap: "", pe: "", price: "", change: "", divYield: "", volume: "",
};

const FILTER_OPTIONS: Record<string, { label: string; value: string }[]> = {
  sector: SCREENER_SECTORS.map((s) => ({ label: s, value: s })),
  type: [
    { label: "Stock", value: "Stock" },
    { label: "ETF", value: "ETF" },
    { label: "REIT", value: "REIT" },
  ],
  marketCap: [
    { label: "Mega (>$200B)", value: "mega" },
    { label: "Large ($10B–$200B)", value: "large" },
    { label: "Mid ($2B–$10B)", value: "mid" },
    { label: "Small (<$2B)", value: "small" },
  ],
  pe: [
    { label: "Under 10", value: "u10" },
    { label: "10 – 20", value: "10-20" },
    { label: "20 – 30", value: "20-30" },
    { label: "30 – 50", value: "30-50" },
    { label: "Over 50", value: "o50" },
    { label: "Negative", value: "neg" },
    { label: "N/A", value: "na" },
  ],
  price: [
    { label: "Under $25", value: "u25" },
    { label: "$25 – $100", value: "25-100" },
    { label: "$100 – $250", value: "100-250" },
    { label: "$250 – $500", value: "250-500" },
    { label: "Over $500", value: "o500" },
  ],
  change: [
    { label: "Strong Down (<−3%)", value: "dd" },
    { label: "Down (−3% to −1%)", value: "d" },
    { label: "Flat (±1%)", value: "flat" },
    { label: "Up (1% to 3%)", value: "u" },
    { label: "Strong Up (>3%)", value: "uu" },
  ],
  divYield: [
    { label: "None (0%)", value: "none" },
    { label: "Under 1%", value: "u1" },
    { label: "1% – 2%", value: "1-2" },
    { label: "2% – 4%", value: "2-4" },
    { label: "Over 4%", value: "o4" },
  ],
  volume: [
    { label: "Over 2× Avg", value: "o2" },
    { label: "1.5× – 2× Avg", value: "1.5-2" },
    { label: "0.5× – 1.5× Avg", value: "0.5-1.5" },
    { label: "Under 0.5× Avg", value: "u0.5" },
  ],
};

const FILTER_LABELS: Record<string, string> = {
  sector: "Sector", type: "Type", marketCap: "Market Cap", pe: "P/E Ratio",
  price: "Price", change: "Change %", divYield: "Dividend", volume: "Volume",
};

function mktCapBucket(v: number | null): string {
  if (v === null) return "";
  if (v >= 200e9) return "mega";
  if (v >= 10e9) return "large";
  if (v >= 2e9) return "mid";
  return "small";
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function ChgBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-400">—</span>;
  const pos = v >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${pos ? "text-emerald-600" : "text-red-500"}`}>
      {formatPercent(v)}
    </span>
  );
}

export default function ScreenerPage() {
  const [results, setResults] = useState<ScreenerResult[]>(() =>
    SCREENER_UNIVERSE.map((s) => ({
      ...s, price: null, change: null, changePercent: null, weekHigh52: null, weekLow52: null,
      marketCap: null, volume: null, avgVolume: null, pe: null, divYield: null, loaded: false,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const tickers = SCREENER_UNIVERSE.map((s) => s.ticker);
    const BATCH = 20;
    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += BATCH) batches.push(tickers.slice(i, i + BATCH));

    try {
      const allResponses = await Promise.all(
        batches.map((batch) =>
          fetch(`/api/quote?ticker=${batch.join(",")}`).then((r) => r.json())
        )
      );
      const flat: QuoteData[] = allResponses.flat();
      const map = new Map<string, QuoteData>(flat.map((d) => [d.ticker, d]));

      setResults((prev) =>
        prev.map((r) => {
          const d = map.get(r.ticker);
          if (!d) return { ...r, loaded: true };
          return {
            ...r,
            price: d.price,
            change: d.change,
            changePercent: d.changePercent,
            weekHigh52: d.weekHigh52,
            weekLow52: d.weekLow52,
            marketCap: d.marketCap,
            volume: d.volume,
            avgVolume: d.avgVolume,
            pe: d.pe,
            divYield: d.divYield,
            loaded: true,
          };
        })
      );
    } catch {
      setResults((prev) => prev.map((r) => ({ ...r, loaded: true })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function setFilter(key: keyof Filters, val: string) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === val ? "" : val }));
  }

  function clearFilter(key: string) {
    setFilters((prev) => ({ ...prev, [key]: "" }));
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    let out = results;

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      out = out.filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
    }

    if (filters.sector) out = out.filter((r) => r.sector === filters.sector);
    if (filters.type) out = out.filter((r) => r.type === filters.type);

    if (filters.marketCap) {
      out = out.filter((r) => mktCapBucket(r.marketCap) === filters.marketCap);
    }

    if (filters.pe) {
      out = out.filter((r) => {
        const pe = r.pe;
        switch (filters.pe) {
          case "neg":   return pe !== null && pe < 0;
          case "u10":   return pe !== null && pe > 0 && pe < 10;
          case "10-20": return pe !== null && pe >= 10 && pe < 20;
          case "20-30": return pe !== null && pe >= 20 && pe < 30;
          case "30-50": return pe !== null && pe >= 30 && pe < 50;
          case "o50":   return pe !== null && pe >= 50;
          case "na":    return pe === null;
          default:      return true;
        }
      });
    }

    if (filters.price) {
      out = out.filter((r) => {
        const p = r.price;
        if (p === null) return false;
        switch (filters.price) {
          case "u25":     return p < 25;
          case "25-100":  return p >= 25 && p < 100;
          case "100-250": return p >= 100 && p < 250;
          case "250-500": return p >= 250 && p < 500;
          case "o500":    return p >= 500;
          default:        return true;
        }
      });
    }

    if (filters.change) {
      out = out.filter((r) => {
        const c = r.changePercent;
        if (c === null) return false;
        switch (filters.change) {
          case "dd":   return c < -3;
          case "d":    return c >= -3 && c < -1;
          case "flat": return c >= -1 && c < 1;
          case "u":    return c >= 1 && c < 3;
          case "uu":   return c >= 3;
          default:     return true;
        }
      });
    }

    if (filters.divYield) {
      out = out.filter((r) => {
        const dy = r.divYield;
        switch (filters.divYield) {
          case "none": return dy === null || dy === 0;
          case "u1":   return dy !== null && dy > 0 && dy < 1;
          case "1-2":  return dy !== null && dy >= 1 && dy < 2;
          case "2-4":  return dy !== null && dy >= 2 && dy < 4;
          case "o4":   return dy !== null && dy >= 4;
          default:     return true;
        }
      });
    }

    if (filters.volume) {
      out = out.filter((r) => {
        const v = r.volume;
        const av = r.avgVolume;
        if (!v || !av || av === 0) return false;
        const ratio = v / av;
        switch (filters.volume) {
          case "o2":      return ratio >= 2;
          case "1.5-2":   return ratio >= 1.5 && ratio < 2;
          case "0.5-1.5": return ratio >= 0.5 && ratio < 1.5;
          case "u0.5":    return ratio < 0.5;
          default:        return true;
        }
      });
    }

    return [...out].sort((a, b) => {
      let av: number | string | null = null;
      let bv: number | string | null = null;
      switch (sortKey) {
        case "ticker":        av = a.ticker;        bv = b.ticker;        break;
        case "name":          av = a.name;          bv = b.name;          break;
        case "sector":        av = a.sector;        bv = b.sector;        break;
        case "marketCap":     av = a.marketCap;     bv = b.marketCap;     break;
        case "pe":            av = a.pe;            bv = b.pe;            break;
        case "price":         av = a.price;         bv = b.price;         break;
        case "changePercent": av = a.changePercent; bv = b.changePercent; break;
        case "volume":        av = a.volume;        bv = b.volume;        break;
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
  }, [results, filters, search, sortKey, sortDir]);

  const activeFilters = (Object.entries(filters) as [keyof Filters, string][]).filter(([, v]) => v !== "");
  const hasFilters = activeFilters.length > 0 || search.trim() !== "";

  const thCls = (key: SortKey) =>
    `px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none transition-colors ${
      sortKey === key ? "text-emerald-600 bg-emerald-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Screener</h1>
          <p className="text-gray-500 text-sm mt-0.5">Filter {SCREENER_UNIVERSE.length} securities by fundamental &amp; technical criteria</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filter Panel */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>
          {hasFilters && (
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setSearch(""); }}
              className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              Reset all
            </button>
          )}
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticker or company name…"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {(Object.keys(FILTER_OPTIONS) as (keyof Filters)[]).map((key) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{FILTER_LABELS[key]}</label>
              <select
                value={filters[key]}
                onChange={(e) => setFilter(key, e.target.value)}
                className={`w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                  filters[key]
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 focus:border-emerald-500"
                    : "border-gray-200 bg-gray-50 text-gray-700 focus:border-emerald-400"
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
              const label = FILTER_OPTIONS[key]?.find((o) => o.value === val)?.label ?? val;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full"
                >
                  <span className="text-emerald-500">{FILTER_LABELS[key]}:</span> {label}
                  <button
                    onClick={() => clearFilter(key)}
                    className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-emerald-200 transition-colors"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Results bar */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <p className="text-sm text-gray-500">
          {loading && results.every((r) => !r.loaded)
            ? "Loading market data…"
            : <><span className="font-semibold text-gray-900">{filtered.length}</span> of {SCREENER_UNIVERSE.length} securities match</>
          }
        </p>
        {loading && results.some((r) => !r.loaded) && !results.every((r) => !r.loaded) && (
          <span className="text-xs text-gray-400 animate-pulse">Updating…</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 800 }}>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="pl-4 pr-1 py-2.5 text-xs font-semibold text-gray-400 w-8 text-left">#</th>
                <th className={`${thCls("ticker")} text-left`} onClick={() => handleSort("ticker")}>
                  Ticker <SortIcon active={sortKey === "ticker"} dir={sortDir} />
                </th>
                <th className={`${thCls("name")} text-left`} onClick={() => handleSort("name")}>
                  Company <SortIcon active={sortKey === "name"} dir={sortDir} />
                </th>
                <th className={`${thCls("sector")} text-left`} onClick={() => handleSort("sector")}>
                  Sector <SortIcon active={sortKey === "sector"} dir={sortDir} />
                </th>
                <th className={`${thCls("marketCap")} text-right`} onClick={() => handleSort("marketCap")}>
                  Mkt Cap <SortIcon active={sortKey === "marketCap"} dir={sortDir} />
                </th>
                <th className={`${thCls("pe")} text-right`} onClick={() => handleSort("pe")}>
                  P/E <SortIcon active={sortKey === "pe"} dir={sortDir} />
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
                <th className={`${thCls("divYield")} text-right`} onClick={() => handleSort("divYield")}>
                  Div % <SortIcon active={sortKey === "divYield"} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-gray-400 text-sm">
                    No securities match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const isLoading = !r.loaded;
                  return (
                    <tr key={r.ticker} className="hover:bg-gray-50 transition-colors">
                      <td className="pl-4 pr-1 py-2.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-emerald-600 whitespace-nowrap">{r.ticker}</td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate">{r.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-500 whitespace-nowrap">{r.sector}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                        {isLoading ? <Skeleton /> : (r.marketCap ? formatLargeNumber(r.marketCap) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">
                        {isLoading ? <Skeleton /> : (r.pe !== null ? r.pe.toFixed(1) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {isLoading ? <Skeleton /> : (r.price !== null ? formatCurrency(r.price) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {isLoading ? <Skeleton /> : <ChgBadge v={r.changePercent} />}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums whitespace-nowrap">
                        {isLoading ? <Skeleton /> : formatVolume(r.volume)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">
                        {isLoading ? <Skeleton /> : (r.divYield !== null && r.divYield > 0 ? `${r.divYield.toFixed(2)}%` : "—")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden mt-4 flex flex-col gap-3">
        {/* Note: Desktop table is hidden on mobile via hidden sm:block above — this section is a fallback note */}
      </div>
    </div>
  );
}

function Skeleton() {
  return <span className="inline-block h-3.5 w-14 bg-gray-100 rounded animate-pulse" />;
}
