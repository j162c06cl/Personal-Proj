"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TickerLink from "@/components/TickerLink";
import TickerPreview from "@/components/TickerPreview";
import SourceTag from "@/components/SourceTag";
import { WatchlistItem } from "@/lib/types";
import { loadWatchlist, saveWatchlist } from "@/lib/store";
import { getChart, getFundamentals, getQuotes, QuoteMap } from "@/lib/data";
import { CATEGORY_ORDER, categoryFrom, knownCategory } from "@/lib/categories";
import { closeOnOrBefore, rangeCovering } from "@/lib/portfolioHistory";
import { formatCurrency, formatPercent } from "@/lib/formatters";

const SPARK_DAYS = 5;
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

type SortKey = "ticker" | "price" | "today" | "week" | "range" | "since";

const categoryOf = (i: WatchlistItem) => i.category ?? knownCategory(i.ticker) ?? "Other";
// Moves that round to 0.00% read as flat, not as a red "-0.00%"
const flat = (v: number) => Math.abs(v) < 0.005;
const toneCls = (v: number | null) => (v === null || flat(v) ? "text-[#A3A3A3]" : v > 0 ? "text-[#16A34A]" : "text-[#DC2626]");
const pctOrDash = (v: number | null) => (v === null ? "—" : flat(v) ? "0.00%" : formatPercent(v));

function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return <span className="inline-block w-16 h-5" />;
  const w = 64, h = 20;
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * w},${hi === lo ? h / 2 : h - 2 - ((c - lo) / (hi - lo)) * (h - 4)}`).join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={w} height={h} className="inline-block align-middle" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#16A34A" : "#DC2626"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RangeBar({ pos }: { pos: number | null }) {
  if (pos === null) return <span className="text-[#A3A3A3]">—</span>;
  return (
    <span className="relative inline-block w-20 h-1.5 bg-[#EBEBEB] rounded-full align-middle" title={`${pos.toFixed(0)}% of the way from the 52-week low to the high`}>
      <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#1F65F0] ring-2 ring-white" style={{ left: `${Math.min(100, Math.max(0, pos))}%` }} />
    </span>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [closes, setCloses] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [tab, setTab] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchQuotes = useCallback(async (tickers: string[], force = false) => {
    if (!tickers.length) return;
    setLoading(true);
    const map = await getQuotes(tickers, { force });
    setQuotes((prev) => ({ ...prev, ...map }));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWatchlist().then((list) => {
      setItems(list);
      fetchQuotes(list.map((i) => i.ticker));
    });
  }, [fetchQuotes]);

  function commit(next: WatchlistItem[]) {
    setItems(next);
    saveWatchlist(next);
  }

  function update(ticker: string, patch: Partial<WatchlistItem>) {
    setItems((prev) => {
      if (!prev) return prev;
      const next = prev.map((i) => (i.ticker === ticker ? { ...i, ...patch } : i));
      saveWatchlist(next);
      return next;
    });
  }

  // File each stock under its sector (or ETFs) once, and remember it so grouping is instant next time
  const uncategorised = useMemo(() => (items ?? []).filter((i) => !i.category).map((i) => i.ticker).join(","), [items]);
  useEffect(() => {
    if (!uncategorised) return;
    for (const t of uncategorised.split(",")) {
      const known = knownCategory(t);
      if (known) { update(t, { category: known }); continue; }
      getFundamentals(t).then((f) => {
        const c = f ? categoryFrom({ quoteType: f.value.quoteType, sector: f.value.profile.sector }) : null;
        if (c) update(t, { category: c });
      });
    }
  }, [uncategorised]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recent closes for the 5-day sparkline, and the close on the day each stock was added
  // for any item saved before "since added" existed
  const tickerKey = useMemo(() => (items ?? []).map((i) => i.ticker).sort().join(","), [items]);
  useEffect(() => {
    if (!items?.length) return;
    let live = true;
    for (const item of items) {
      if (closes[item.ticker]) continue;
      getChart(item.ticker, "1mo").then(async (chart) => {
        if (!live) return;
        const pts = chart?.value.points ?? [];
        setCloses((prev) => ({ ...prev, [item.ticker]: pts.slice(-(SPARK_DAYS + 1)).map((p) => p.c) }));
        if (item.addedPrice != null) return;
        const day = item.addedAt.slice(0, 10);
        let price = closeOnOrBefore(pts, day);
        if (price === null) {
          const longer = await getChart(item.ticker, rangeCovering(day));
          price = closeOnOrBefore(longer?.value.points ?? [], day);
        }
        if (live && price !== null) update(item.ticker, { addedPrice: price });
      });
    }
    return () => { live = false; };
  }, [tickerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function openPreview(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (t) setPreview(t);
  }

  function addPreviewed(category: string | null, price: number | null) {
    if (!items || !preview || items.some((i) => i.ticker === preview)) return;
    commit([...items, {
      ticker: preview, intent: "research", note: "", status: "not-started", addedAt: new Date().toISOString(),
      ...(category ? { category } : {}), ...(price !== null ? { addedPrice: price } : {}),
    }]);
    fetchQuotes([preview]);
  }

  useEffect(() => {
    if (!preview) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);

  const rows = useMemo(() => (items ?? []).map((item) => {
    const q = quotes[item.ticker]?.value;
    const c = closes[item.ticker] ?? [];
    const price = q?.price ?? null;
    const lo = q?.weekLow52 ?? null, hi = q?.weekHigh52 ?? null;
    return {
      item,
      name: q?.name ?? "",
      price,
      today: q?.changePercent ?? null,
      spark: c,
      week: c.length > 1 ? ((c[c.length - 1] - c[0]) / c[0]) * 100 : null,
      range: price !== null && lo !== null && hi !== null && hi > lo ? ((price - lo) / (hi - lo)) * 100 : null,
      since: price !== null && item.addedPrice ? ((price - item.addedPrice) / item.addedPrice) * 100 : null,
    };
  }), [items, quotes, closes]);

  const tabs = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items ?? []) counts[categoryOf(i)] = (counts[categoryOf(i)] ?? 0) + 1;
    return [{ name: "All", count: items?.length ?? 0 }, ...CATEGORY_ORDER.filter((c) => counts[c]).map((c) => ({ name: c, count: counts[c] }))];
  }, [items]);

  // If the current tab empties (last stock removed), fall back to All
  useEffect(() => { if (tab !== "All" && !tabs.some((t) => t.name === tab)) setTab("All"); }, [tabs, tab]);

  const visible = useMemo(() => {
    const list = rows.filter((r) => tab === "All" || categoryOf(r.item) === tab);
    const val = (r: (typeof rows)[number]) => (sortKey === "ticker" ? r.item.ticker : r[sortKey]);
    return list.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const d = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? d : -d;
    });
  }, [rows, tab, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ticker" ? "asc" : "desc"); }
  }

  // Newest quote timestamp per provider, for the source line
  const sources = useMemo(() => {
    const by: Record<string, { asOf: string; cached: boolean }> = {};
    for (const i of items ?? []) {
      const q = quotes[i.ticker];
      if (q && (!by[q.source] || q.asOf > by[q.source].asOf)) by[q.source] = { asOf: q.asOf, cached: q.cached };
    }
    return Object.entries(by);
  }, [items, quotes]);

  if (!items) return null;

  const columns: { key: SortKey | null; label: string; align: "left" | "right" | "center"; width: string }[] = [
    { key: "ticker", label: "Stock",          align: "left",   width: "22%" },
    { key: "price",  label: "Price",          align: "right",  width: "11%" },
    { key: "today",  label: "Today",          align: "right",  width: "10%" },
    { key: "week",   label: "5 days",         align: "right",  width: "18%" },
    { key: "range",  label: "52-week range",  align: "center", width: "15%" },
    { key: "since",  label: "Since added",    align: "right",  width: "14%" },
    { key: null,     label: "",               align: "right",  width: "10%" },
  ];

  return (
    <div className="max-w-[1280px]">
      {/* Header + search */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Watchlist</h1>
          <p className="text-[14px] text-[#525252] mt-1">{items.length} stock{items.length !== 1 ? "s" : ""} · click a column to sort</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3] pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <TickerAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={(t) => openPreview(t)}
              onKeyDown={(e) => { if (e.key === "Enter") openPreview(query); }}
              placeholder="Look up a stock to add…"
              inputClassName="w-full pl-9 pr-8 py-2 text-[14px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)]"
            />
          </div>
          <button
            onClick={() => fetchQuotes(items.map((i) => i.ticker), true)}
            disabled={loading}
            title="Refresh prices"
            aria-label="Refresh prices"
            className="p-2.5 text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#0A0A0A] hover:text-[#0A0A0A] rounded-xl disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sector tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[#E5E5E5] mb-0" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.name}
            role="tab"
            aria-selected={tab === t.name}
            onClick={() => setTab(t.name)}
            className={`shrink-0 px-3.5 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.name ? "text-[#0A0A0A] border-[#0A0A0A]" : "text-[#737373] border-transparent hover:text-[#0A0A0A]"
            }`}
          >
            {t.name} <span className="text-[11px] font-medium text-[#A3A3A3] ml-0.5">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-b-2xl border border-t-0 border-[#E5E5E5] overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-[#525252]">Your watchlist is empty. Look up a stock above, or use + Watch in the screener or on a research page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed" style={{ minWidth: 900 }}>
              <colgroup>{columns.map((c, i) => <col key={i} style={{ width: c.width }} />)}</colgroup>
              <thead>
                <tr className="bg-[#F7F7F8] border-b border-[#F0F0F0]">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      onClick={c.key ? () => sortBy(c.key!) : undefined}
                      aria-sort={c.key && sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap select-none ${ALIGN[c.align]} ${
                        c.key ? "cursor-pointer hover:text-[#0A0A0A]" : ""
                      } ${c.key && sortKey === c.key ? "text-[#1F65F0]" : "text-[#525252]"}`}
                    >
                      {c.label}
                      {c.key && sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {visible.map((r) => (
                  <tr key={r.item.ticker} className="group hover:bg-[#FAFAFA]">
                    <td className="px-4 py-2.5">
                      <TickerLink ticker={r.item.ticker} />
                      <p className="text-[11px] text-[#737373] truncate">{r.name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#0A0A0A]">{r.price !== null ? formatCurrency(r.price) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${toneCls(r.today)}`}>{pctOrDash(r.today)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <Sparkline closes={r.spark} />
                        <span className={`text-[12px] font-medium tabular-nums w-14 ${toneCls(r.week)}`}>{pctOrDash(r.week)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center"><RangeBar pos={r.range} /></td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold tabular-nums ${toneCls(r.since)}`}
                      title={r.item.addedPrice != null ? `Added ${new Date(r.item.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${formatCurrency(r.item.addedPrice)}` : undefined}
                    >
                      {pctOrDash(r.since)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {pendingRemove === r.item.ticker ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => { commit(items.filter((i) => i.ticker !== r.item.ticker)); setPendingRemove(null); }}
                            className="text-[11px] px-2 py-0.5 bg-[#EF4444] text-white rounded-lg font-semibold"
                          >
                            Remove
                          </button>
                          <button onClick={() => setPendingRemove(null)} className="text-[11px] px-1.5 py-0.5 text-[#525252]" aria-label="Cancel">✕</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setPendingRemove(r.item.ticker)}
                          className="text-[18px] leading-none text-[#C8C8C8] hover:text-[#EF4444] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          title={`Remove ${r.item.ticker}`}
                          aria-label={`Remove ${r.item.ticker}`}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {sources.map(([source, s]) => <SourceTag key={source} source={`Prices: ${source}`} asOf={s.asOf} cached={s.cached} />)}
          <span className="text-[11px] text-[#A3A3A3]">5-day and since-added changes use Yahoo Finance daily closes</span>
        </div>
      )}

      {/* Look-up drawer */}
      {preview && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/25" onClick={() => setPreview(null)} />
          <aside className="absolute inset-y-0 right-0 w-full sm:w-[460px] bg-[#F7F7F8] shadow-2xl overflow-y-auto p-4" aria-label={`${preview} preview`}>
            <TickerPreview
              key={preview}
              ticker={preview}
              watching={items.some((i) => i.ticker === preview)}
              onAdd={addPreviewed}
              onClose={() => setPreview(null)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
