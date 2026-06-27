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
  if (!active) return <span className="ml-1 text-[#A3A3A3]">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function ChgBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[#A3A3A3]">—</span>;
  const pos = v >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${pos ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
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
          case "u1":   return dy !== null && dy > 0 && dy < 0.01;
          case "1-2":  return dy !== null && dy >= 0.01 && dy < 0.02;
          case "2-4":  return dy !== null && dy >= 0.02 && dy < 0.04;
          case "o4":   return dy !== null && dy >= 0.04;
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
    `px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer select-none transition-colors ${
      sortKey === key
        ? "text-[#1F65F0] bg-[#EBF2FF]"
        : "text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8]"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Stock Screener</h1>
          <p className="text-[14px] text-[#525252] mt-0.5">Filter {SCREENER_UNIVERSE.length} securities by fundamental &amp; technical criteria</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-1.5 text-[14px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#0A0A0A] hover:text-[#0A0A0A] px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5]">
          <span className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Filters</span>
          {hasFilters && (
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setSearch(""); }}
              className="text-[11px] text-[#EF4444] hover:text-[#DC2626] font-semibold transition-colors"
            >
              Reset all
            </button>
          )}
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticker or company name…"
              className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-3 py-2 text-[13px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#1F65F0] focus:bg-white focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] transition-all"
            />
          </div>

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
              const label = FILTER_OPTIONS[key]?.find((o) => o.value === val)?.label ?? val;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-[#EBF2FF] border border-[#1F65F0]/20 text-[#1F65F0] text-[11px] font-semibold rounded-full"
                >
                  <span className="opacity-70">{FILTER_LABELS[key]}:</span> {label}
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

      {/* Results bar */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <p className="text-[13px] text-[#525252]">
          {loading && results.every((r) => !r.loaded)
            ? "Loading market data…"
            : <><span className="font-semibold text-[#0A0A0A]">{filtered.length}</span> of {SCREENER_UNIVERSE.length} securities match</>
          }
        </p>
        {loading && results.some((r) => !r.loaded) && !results.every((r) => !r.loaded) && (
          <span className="text-[11px] text-[#525252] animate-pulse">Updating…</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 800 }}>
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#F7F7F8]">
                <th className="pl-4 pr-1 py-2.5 text-[11px] font-semibold text-[#A3A3A3] w-8 text-left">#</th>
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
            <tbody className="divide-y divide-[#F0F0F0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-[#525252] text-[13px]">
                    No securities match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const isLoading = !r.loaded;
                  return (
                    <tr key={r.ticker} className="hover:bg-[#F7F7F8] transition-colors">
                      <td className="pl-4 pr-1 py-2.5 text-[11px] text-[#A3A3A3] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-[#1F65F0] whitespace-nowrap">{r.ticker}</td>
                      <td className="px-3 py-2.5 text-[#0A0A0A] text-[13px] max-w-[180px] truncate">{r.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] text-[#525252] whitespace-nowrap">{r.sector}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums whitespace-nowrap">
                        {isLoading ? <Skeleton /> : (r.marketCap ? formatLargeNumber(r.marketCap) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums">
                        {isLoading ? <Skeleton /> : (r.pe !== null ? r.pe.toFixed(1) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-[#0A0A0A] tabular-nums whitespace-nowrap">
                        {isLoading ? <Skeleton /> : (r.price !== null ? formatCurrency(r.price) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {isLoading ? <Skeleton /> : <ChgBadge v={r.changePercent} />}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums whitespace-nowrap">
                        {isLoading ? <Skeleton /> : formatVolume(r.volume)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#525252] text-[13px] tabular-nums">
                        {isLoading ? <Skeleton /> : (r.divYield !== null && r.divYield > 0 ? `${(r.divYield * 100).toFixed(2)}%` : "—")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return <span className="inline-block h-3.5 w-14 bg-[#F0F0F0] rounded animate-pulse" />;
}
