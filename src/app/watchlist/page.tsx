"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TickerLink from "@/components/TickerLink";
import TickerPreview from "@/components/TickerPreview";
import SourceTag from "@/components/SourceTag";
import { INTENTS, TAGS, tagInfo } from "@/components/WatchButton";
import { WatchIntent, WatchTag, Watchlist, WatchlistItem } from "@/lib/types";
import { loadWatchlists, newId, newItem, saveWatchlists } from "@/lib/store";
import { getChart, getFundamentals, getQuotes, QuoteMap } from "@/lib/data";
import { CATEGORY_ORDER, categoryFrom, knownCategory } from "@/lib/categories";
import { closeOnOrBefore, rangeCovering } from "@/lib/portfolioHistory";
import { formatPercent, formatVolume } from "@/lib/formatters";
import { defaultCurrency, formatBig, formatMoney } from "@/lib/markets";

const SPARK_DAYS = 5;
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

type SortKey = "ticker" | "tag" | "price" | "today" | "week" | "volume" | "marketCap" | "range" | "target" | "since";
type TagFilter = "active" | "all" | WatchTag;

const TAG_ORDER: Record<WatchTag, number> = { "setup-ready": 0, watching: 1, researching: 2, archived: 3 };
const categoryOf = (i: WatchlistItem) => i.category ?? knownCategory(i.ticker) ?? "Other";
// Moves that round to 0.00% read as flat, not as a red "-0.00%"
const flat = (v: number) => Math.abs(v) < 0.005;
const toneCls = (v: number | null) => (v === null || flat(v) ? "text-[#A3A3A3]" : v > 0 ? "text-[#16A34A]" : "text-[#DC2626]");
const pctOrDash = (v: number | null) => (v === null ? "—" : flat(v) ? "0.00%" : formatPercent(v));
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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

function TagPill({ tag }: { tag: WatchTag }) {
  const t = tagInfo(tag);
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${t.cls}`}>{t.label}</span>;
}

const numOrNull = (s: string) => {
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** Edits one stock's plan: strategy, status, reason, thesis, target and invalidation level */
function ItemEditor({ item, price, currency, onSave, onCancel }: {
  item: WatchlistItem;
  price: number | null;
  currency: string;
  onSave: (patch: Partial<WatchlistItem>) => void;
  onCancel: () => void;
}) {
  const [intent, setIntent] = useState<WatchIntent>(item.intent);
  const [tag, setTag] = useState<WatchTag>(item.tag);
  const [note, setNote] = useState(item.note);
  const [thesis, setThesis] = useState(item.thesis ?? "");
  const [target, setTarget] = useState(item.targetPrice != null ? String(item.targetPrice) : "");
  const [stop, setStop] = useState(item.invalidation != null ? String(item.invalidation) : "");
  const t = numOrNull(target), s = numOrNull(stop);
  const input = "w-full px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0]";
  const label = "block text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="space-y-3">
        <div>
          <span className={label}>Strategy</span>
          <div className="flex gap-1">
            {INTENTS.map((o) => (
              <button key={o.value} type="button" title={o.hint} onClick={() => setIntent(o.value)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[12px] font-semibold border ${intent === o.value ? "bg-[#1F65F0] text-white border-[#1F65F0]" : "bg-white text-[#525252] border-[#E5E5E5]"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Status</span>
          <div className="grid grid-cols-2 gap-1">
            {TAGS.map((o) => (
              <button key={o.value} type="button" onClick={() => setTag(o.value)}
                className={`px-2 py-1 rounded-lg text-[12px] font-semibold border ${tag === o.value ? o.cls + " ring-2 ring-[#1F65F0]/30" : "bg-white text-[#737373] border-[#E5E5E5]"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={label}>Target price</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder={currency} className={input} />
            {t !== null && price !== null && (
              <span className={`text-[11px] ${t >= price ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{formatPercent(((t - price) / price) * 100)} from price</span>
            )}
          </label>
          <label>
            <span className={label}>Invalidation</span>
            <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" placeholder={currency} className={input} />
            {s !== null && price !== null && (
              <span className="text-[11px] text-[#525252]">{price > s ? `${(((price - s) / price) * 100).toFixed(1)}% below price` : "Price is at or below it"}</span>
            )}
          </label>
        </div>
      </div>
      <label className="block">
        <span className={label}>Thesis</span>
        <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={7}
          placeholder="Why own or trade it? What has to go right, and over what time frame?" className={`${input} resize-y`} />
      </label>
      <div className="flex flex-col">
        <label className="block flex-1">
          <span className={label}>Notes</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5}
            placeholder="Why you added it, things to check next…" className={`${input} resize-y`} />
        </label>
        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="text-[11px] text-[#A3A3A3]">
            Added {new Date(item.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {item.updatedAt ? ` · edited ${fmtTime(item.updatedAt)}` : ""}
          </span>
          <span className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-[13px] text-[#525252] border border-[#E5E5E5] rounded-xl hover:border-[#0A0A0A]">Cancel</button>
            <button
              onClick={() => onSave({ intent, tag, note: note.trim(), thesis: thesis.trim(), targetPrice: t, invalidation: s, updatedAt: new Date().toISOString() })}
              className="px-3 py-1.5 text-[13px] bg-[#1F65F0] text-white rounded-xl font-semibold hover:bg-[#1550D8]"
            >
              Save
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [closes, setCloses] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<TagFilter>("active");
  const [intentFilter, setIntentFilter] = useState<WatchIntent | "all">("all");
  const [sector, setSector] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // List management: renaming in place, naming a new list, confirming a delete
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = lists?.find((l) => l.id === activeId) ?? lists?.[0] ?? null;
  const items = useMemo(() => list?.items ?? [], [list]);

  const fetchQuotes = useCallback(async (tickers: string[], force = false) => {
    if (!tickers.length) return;
    setLoading(true);
    const map = await getQuotes(tickers, { force });
    setQuotes((prev) => ({ ...prev, ...map }));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWatchlists().then((ls) => {
      setLists(ls);
      let saved: string | null = null;
      try { saved = localStorage.getItem("watchlist_active"); } catch {}
      setActiveId(ls.find((l) => l.id === saved)?.id ?? ls[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    try { localStorage.setItem("watchlist_active", activeId); } catch {}
    setEditing(null);
    setConfirmDelete(false);
  }, [activeId]);

  // Quotes for the visible list
  const tickerKey = useMemo(() => items.map((i) => i.ticker).sort().join(","), [items]);
  useEffect(() => {
    if (tickerKey) fetchQuotes(tickerKey.split(","));
  }, [tickerKey, fetchQuotes]);

  function commit(next: Watchlist[]) {
    setLists(next);
    saveWatchlists(next);
  }

  /** Patches one stock wherever it appears, so listing details stay consistent across lists */
  const updateEverywhere = useCallback((ticker: string, patch: Partial<WatchlistItem>) => {
    setLists((prev) => {
      if (!prev) return prev;
      const next = prev.map((l) => ({ ...l, items: l.items.map((i) => (i.ticker === ticker ? { ...i, ...patch } : i)) }));
      saveWatchlists(next);
      return next;
    });
  }, []);

  function updateInList(ticker: string, patch: Partial<WatchlistItem>) {
    if (!lists || !list) return;
    commit(lists.map((l) => (l.id === list.id ? { ...l, items: l.items.map((i) => (i.ticker === ticker ? { ...i, ...patch } : i)) } : l)));
  }

  // ── List management ──
  function createList(name: string) {
    if (!lists) return;
    const l: Watchlist = { id: newId(), name: name.trim() || `List ${lists.length + 1}`, createdAt: new Date().toISOString(), items: [] };
    commit([...lists, l]);
    setActiveId(l.id);
    setCreating(false);
    setNameDraft("");
  }

  function renameList(id: string, name: string) {
    if (!lists || !name.trim()) { setRenaming(null); return; }
    commit(lists.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)));
    setRenaming(null);
  }

  function duplicateList() {
    if (!lists || !list) return;
    const copy: Watchlist = { id: newId(), name: `${list.name} (copy)`, createdAt: new Date().toISOString(), items: list.items.map((i) => ({ ...i })) };
    const at = lists.findIndex((l) => l.id === list.id);
    commit([...lists.slice(0, at + 1), copy, ...lists.slice(at + 1)]);
    setActiveId(copy.id);
  }

  function deleteList() {
    if (!lists || !list) return;
    const rest = lists.filter((l) => l.id !== list.id);
    // Always keep one list to add to
    const next = rest.length ? rest : [{ id: newId(), name: "My watchlist", createdAt: new Date().toISOString(), items: [] }];
    commit(next);
    setActiveId(next[0].id);
    setConfirmDelete(false);
  }

  // File each stock under its sector (or ETFs) once, and record its exchange and currency
  const uncategorised = useMemo(() => items.filter((i) => !i.category || !i.currency).map((i) => i.ticker).join(","), [items]);
  useEffect(() => {
    if (!uncategorised) return;
    for (const t of uncategorised.split(",")) {
      const known = knownCategory(t);
      getFundamentals(t).then((f) => {
        const c = known ?? (f ? categoryFrom({ quoteType: f.value.quoteType, sector: f.value.profile.sector }) : null);
        const patch: Partial<WatchlistItem> = {};
        if (c) patch.category = c;
        if (f?.value.currency) patch.currency = f.value.currency;
        if (f?.value.exchange) patch.exchange = f.value.exchange;
        if (Object.keys(patch).length) updateEverywhere(t, patch);
      });
    }
  }, [uncategorised, updateEverywhere]);

  // Recent closes for the 5-day sparkline, and the close on the day each stock was added
  // for any item saved before "since added" existed
  useEffect(() => {
    if (!items.length) return;
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
        if (live && price !== null) updateEverywhere(item.ticker, { addedPrice: price });
      });
    }
    return () => { live = false; };
  }, [tickerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function openPreview(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (t) setPreview(t);
  }

  function addPreviewed(meta: { category: string | null; price: number | null; exchange: string | null; currency: string | null }) {
    if (!lists || !list || !preview || list.items.some((i) => i.ticker === preview)) return;
    const item = newItem(preview, {
      ...(meta.category ? { category: meta.category } : {}),
      ...(meta.price !== null ? { addedPrice: meta.price } : {}),
      ...(meta.exchange ? { exchange: meta.exchange } : {}),
      ...(meta.currency ? { currency: meta.currency } : {}),
    });
    commit(lists.map((l) => (l.id === list.id ? { ...l, items: [...l.items, item] } : l)));
    fetchQuotes([preview]);
  }

  useEffect(() => {
    if (!preview) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);

  const rows = useMemo(() => items.map((item) => {
    const sq = quotes[item.ticker];
    const q = sq?.value;
    const c = closes[item.ticker] ?? [];
    const price = q?.price ?? null;
    const lo = q?.weekLow52 ?? null, hi = q?.weekHigh52 ?? null;
    return {
      item,
      name: q?.name ?? "",
      currency: item.currency ?? q?.currency ?? defaultCurrency(item.ticker),
      exchange: item.exchange ?? q?.exchange ?? null,
      asOf: sq?.asOf ?? null,
      price,
      today: q?.changePercent ?? null,
      spark: c,
      week: c.length > 1 ? ((c[c.length - 1] - c[0]) / c[0]) * 100 : null,
      volume: q?.volume ?? null,
      relVolume: q?.volume && q?.avgVolume ? q.volume / q.avgVolume : null,
      marketCap: q?.marketCap ?? null,
      range: price !== null && lo !== null && hi !== null && hi > lo ? ((price - lo) / (hi - lo)) * 100 : null,
      target: price !== null && item.targetPrice ? ((item.targetPrice - price) / price) * 100 : null,
      stopGap: price !== null && item.invalidation ? ((price - item.invalidation) / price) * 100 : null,
      since: price !== null && item.addedPrice ? ((price - item.addedPrice) / item.addedPrice) * 100 : null,
      tag: TAG_ORDER[item.tag],
    };
  }), [items, quotes, closes]);

  const sectors = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) counts[categoryOf(i)] = (counts[categoryOf(i)] ?? 0) + 1;
    return CATEGORY_ORDER.filter((c) => counts[c]).map((c) => ({ name: c, count: counts[c] }));
  }, [items]);

  const tagCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, active: items.filter((i) => i.tag !== "archived").length };
    for (const i of items) c[i.tag] = (c[i.tag] ?? 0) + 1;
    return c;
  }, [items]);

  useEffect(() => { if (sector !== "All" && !sectors.some((s) => s.name === sector)) setSector("All"); }, [sectors, sector]);

  const visible = useMemo(() => {
    const out = rows.filter((r) =>
      (tagFilter === "all" || (tagFilter === "active" ? r.item.tag !== "archived" : r.item.tag === tagFilter))
      && (intentFilter === "all" || r.item.intent === intentFilter)
      && (sector === "All" || categoryOf(r.item) === sector));
    const val = (r: (typeof rows)[number]) => (sortKey === "ticker" ? r.item.ticker : r[sortKey]);
    return out.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const d = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? d : -d;
    });
  }, [rows, tagFilter, intentFilter, sector, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ticker" || key === "tag" ? "asc" : "desc"); }
  }

  // Newest and oldest quote timestamp per provider, for the source line
  const sources = useMemo(() => {
    const by: Record<string, { asOf: string; oldest: string; cached: boolean }> = {};
    for (const i of items) {
      const q = quotes[i.ticker];
      if (!q) continue;
      const b = by[q.source];
      if (!b) by[q.source] = { asOf: q.asOf, oldest: q.asOf, cached: q.cached };
      else {
        if (q.asOf > b.asOf) { b.asOf = q.asOf; b.cached = q.cached; }
        if (q.asOf < b.oldest) b.oldest = q.asOf;
      }
    }
    return Object.entries(by);
  }, [items, quotes]);

  if (!lists || !list) return null;

  const columns: { key: SortKey | null; label: string; align: "left" | "right" | "center"; width: number; title?: string }[] = [
    { key: "ticker",    label: "Stock",         align: "left",   width: 190 },
    { key: "tag",       label: "Status",        align: "left",   width: 110 },
    { key: "price",     label: "Price",         align: "right",  width: 100 },
    { key: "today",     label: "Today",         align: "right",  width: 80 },
    { key: "week",      label: "5 days",        align: "right",  width: 140 },
    { key: "volume",    label: "Volume",        align: "right",  width: 90, title: "Latest session's volume; the multiple compares it with the 3-month average" },
    { key: "marketCap", label: "Mkt cap",       align: "right",  width: 95 },
    { key: "range",     label: "52-wk range",   align: "center", width: 105 },
    { key: "target",    label: "To target",     align: "right",  width: 105, title: "Distance from the price to your target; below it, the gap to your invalidation level" },
    { key: "since",     label: "Since added",   align: "right",  width: 95 },
    { key: null,        label: "",              align: "right",  width: 80 },
  ];

  const tagTabs: { id: TagFilter; label: string }[] = [
    { id: "active", label: "Active" },
    ...TAGS.map((t) => ({ id: t.value as TagFilter, label: t.label })),
    { id: "all", label: "All" },
  ];

  return (
    <div className="max-w-[1400px]">
      {/* Header + search */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Watchlists</h1>
          <p className="text-[14px] text-[#525252] mt-1">{lists.length} list{lists.length !== 1 ? "s" : ""} · click a column to sort · Plan holds each stock&apos;s thesis, target and invalidation level</p>
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
              placeholder={`Add a stock to ${list.name}…`}
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

      {/* Lists */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E5E5E5]" role="tablist" aria-label="Watchlists">
        {lists.map((l) => (
          renaming === l.id ? (
            <input
              key={l.id}
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => renameList(l.id, nameDraft)}
              onKeyDown={(e) => { if (e.key === "Enter") renameList(l.id, nameDraft); if (e.key === "Escape") setRenaming(null); }}
              className="shrink-0 my-1 px-2 py-1.5 text-[13px] font-semibold border border-[#1F65F0] rounded-lg focus:outline-none w-44"
              aria-label="List name"
            />
          ) : (
            <button
              key={l.id}
              role="tab"
              aria-selected={l.id === list.id}
              onClick={() => setActiveId(l.id)}
              onDoubleClick={() => { setRenaming(l.id); setNameDraft(l.name); }}
              title="Double-click to rename"
              className={`shrink-0 px-3.5 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                l.id === list.id ? "text-[#0A0A0A] border-[#0A0A0A]" : "text-[#737373] border-transparent hover:text-[#0A0A0A]"
              }`}
            >
              {l.name} <span className="text-[11px] font-medium text-[#A3A3A3] ml-0.5">{l.items.length}</span>
            </button>
          )
        ))}
        {creating ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createList(nameDraft); if (e.key === "Escape") { setCreating(false); setNameDraft(""); } }}
            onBlur={() => (nameDraft.trim() ? createList(nameDraft) : setCreating(false))}
            placeholder="New list name"
            className="shrink-0 my-1 px-2 py-1.5 text-[13px] border border-[#1F65F0] rounded-lg focus:outline-none w-44"
            aria-label="New list name"
          />
        ) : (
          <button onClick={() => { setCreating(true); setNameDraft(""); }} className="shrink-0 px-3 py-2.5 text-[13px] font-semibold text-[#1F65F0] hover:text-[#1550D8]">
            + New list
          </button>
        )}
      </div>

      {/* List actions + filters */}
      <div className="bg-white border border-t-0 border-[#E5E5E5] px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {tagTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTagFilter(t.id)}
              className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
                tagFilter === t.id ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3]"
              }`}
            >
              {t.label} <span className="opacity-60">{tagCounts[t.id] ?? 0}</span>
            </button>
          ))}
          <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value as WatchIntent | "all")} aria-label="Strategy"
            className="ml-1 px-2 py-1 text-[12px] font-semibold text-[#525252] bg-white border border-[#E5E5E5] rounded-full focus:outline-none focus:border-[#1F65F0]">
            <option value="all">Any strategy</option>
            {INTENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {sectors.length > 1 && (
            <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"
              className="px-2 py-1 text-[12px] font-semibold text-[#525252] bg-white border border-[#E5E5E5] rounded-full focus:outline-none focus:border-[#1F65F0]">
              <option value="All">All sectors</option>
              {sectors.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold">
          {confirmDelete ? (
            <>
              <span className="text-[#525252] font-medium">Delete &ldquo;{list.name}&rdquo; and its {list.items.length} stocks?</span>
              <button onClick={deleteList} className="px-2.5 py-1 bg-[#EF4444] text-white rounded-lg">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 text-[#525252] border border-[#E5E5E5] rounded-lg">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => { setRenaming(list.id); setNameDraft(list.name); }} className="px-2.5 py-1 text-[#525252] border border-[#E5E5E5] rounded-lg hover:border-[#0A0A0A] hover:text-[#0A0A0A]">Rename</button>
              <button onClick={duplicateList} className="px-2.5 py-1 text-[#525252] border border-[#E5E5E5] rounded-lg hover:border-[#0A0A0A] hover:text-[#0A0A0A]">Duplicate</button>
              <button onClick={() => setConfirmDelete(true)} className="px-2.5 py-1 text-[#DC2626] border border-[#E5E5E5] rounded-lg hover:border-[#DC2626]">Delete list</button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-b-2xl border border-t-0 border-[#E5E5E5] overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-[#525252]">{list.name} is empty. Look up a stock above, or use + Watch in the screener or on a research page.</p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-[#525252]">No stocks match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed" style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) }}>
              <colgroup>{columns.map((c, i) => <col key={i} style={{ width: c.width }} />)}</colgroup>
              <thead>
                <tr className="bg-[#F7F7F8] border-b border-[#F0F0F0]">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      onClick={c.key ? () => sortBy(c.key!) : undefined}
                      title={c.title}
                      aria-sort={c.key && sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                      className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap select-none ${ALIGN[c.align]} ${
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
                {visible.map((r) => {
                  const isEditing = editing === r.item.ticker;
                  const plan = r.item.thesis || r.item.note;
                  return (
                    <Fragment key={r.item.ticker}>
                      <tr className={`group ${isEditing ? "bg-[#F5F8FF]" : "hover:bg-[#FAFAFA]"} ${r.item.tag === "archived" ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <TickerLink ticker={r.item.ticker} />
                            <span className="text-[10px] font-semibold text-[#737373] border border-[#E5E5E5] rounded px-1" title={r.exchange ?? undefined}>
                              {r.currency}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#737373] truncate" title={r.exchange ? `${r.name} · ${r.exchange}` : r.name}>{r.name}{r.exchange ? ` · ${r.exchange}` : ""}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={r.item.tag}
                            onChange={(e) => updateInList(r.item.ticker, { tag: e.target.value as WatchTag, updatedAt: new Date().toISOString() })}
                            aria-label={`Status of ${r.item.ticker}`}
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-lg border cursor-pointer focus:outline-none ${tagInfo(r.item.tag).cls}`}
                          >
                            {TAGS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <p className="text-[10px] text-[#A3A3A3] mt-0.5">{INTENTS.find((o) => o.value === r.item.intent)?.label}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#0A0A0A]" title={r.asOf ? `As of ${fmtTime(r.asOf)}` : undefined}>
                          {formatMoney(r.price, r.currency)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${toneCls(r.today)}`}>{pctOrDash(r.today)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <Sparkline closes={r.spark} />
                            <span className={`text-[12px] font-medium tabular-nums w-14 ${toneCls(r.week)}`}>{pctOrDash(r.week)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#525252]">
                          {formatVolume(r.volume)}
                          {r.relVolume !== null && (
                            <span className={`block text-[10px] ${r.relVolume >= 1.5 ? "text-[#D97706] font-semibold" : "text-[#A3A3A3]"}`}>{r.relVolume.toFixed(1)}× avg</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-[#525252]">{formatBig(r.marketCap, r.currency)}</td>
                        <td className="px-3 py-2.5 text-center"><RangeBar pos={r.range} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[12px]">
                          {r.target !== null ? (
                            <span className={toneCls(r.target)} title={`Target ${formatMoney(r.item.targetPrice!, r.currency)}`}>{pctOrDash(r.target)}</span>
                          ) : <span className="text-[#A3A3A3]">—</span>}
                          {r.stopGap !== null && (
                            <span className={`block text-[10px] ${r.stopGap <= 3 ? "text-[#DC2626] font-semibold" : "text-[#737373]"}`} title={`Invalidation ${formatMoney(r.item.invalidation!, r.currency)}`}>
                              {r.stopGap > 0 ? `stop −${r.stopGap.toFixed(1)}%` : "below stop"}
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold tabular-nums ${toneCls(r.since)}`}
                          title={r.item.addedPrice != null ? `Added ${new Date(r.item.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${formatMoney(r.item.addedPrice, r.currency)}` : undefined}
                        >
                          {pctOrDash(r.since)}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {pendingRemove === r.item.ticker ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                onClick={() => { commit(lists.map((l) => (l.id === list.id ? { ...l, items: l.items.filter((i) => i.ticker !== r.item.ticker) } : l))); setPendingRemove(null); }}
                                className="text-[11px] px-2 py-0.5 bg-[#EF4444] text-white rounded-lg font-semibold"
                              >
                                Remove
                              </button>
                              <button onClick={() => setPendingRemove(null)} className="text-[11px] px-1 py-0.5 text-[#525252]" aria-label="Cancel">✕</button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <button
                                onClick={() => setEditing(isEditing ? null : r.item.ticker)}
                                className={`text-[11px] px-2 py-0.5 rounded-lg border font-semibold ${plan || r.item.targetPrice ? "text-[#1F65F0] border-[#C7DAFE] bg-[#F5F8FF]" : "text-[#525252] border-[#E5E5E5]"}`}
                                title={plan ? plan : "Add notes, thesis, target and invalidation"}
                                aria-expanded={isEditing}
                              >
                                {isEditing ? "Close" : "Plan"}
                              </button>
                              <button
                                onClick={() => setPendingRemove(r.item.ticker)}
                                className="text-[18px] leading-none text-[#C8C8C8] hover:text-[#EF4444] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                title={`Remove ${r.item.ticker} from ${list.name}`}
                                aria-label={`Remove ${r.item.ticker}`}
                              >
                                ×
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                      {!isEditing && plan && (
                        <tr className={r.item.tag === "archived" ? "opacity-60" : ""}>
                          <td colSpan={columns.length} className="px-3 pb-2 pt-0 border-t-0">
                            <p className="text-[12px] text-[#525252] truncate" title={plan}>
                              <span className="font-semibold text-[#0A0A0A]">{r.item.thesis ? "Thesis" : "Note"}:</span> {plan}
                            </p>
                          </td>
                        </tr>
                      )}
                      {isEditing && (
                        <tr className="bg-[#F5F8FF]">
                          <td colSpan={columns.length} className="px-4 pb-4 pt-1">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[13px] font-bold text-[#0A0A0A]">Your plan for {r.item.ticker}</p>
                              <Link href={`/stock/${encodeURIComponent(r.item.ticker)}`} className="text-[12px] font-semibold text-[#1F65F0] hover:underline">Open analyser →</Link>
                            </div>
                            <ItemEditor
                              item={r.item}
                              price={r.price}
                              currency={r.currency}
                              onCancel={() => setEditing(null)}
                              onSave={(patch) => { updateInList(r.item.ticker, patch); setEditing(null); }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {sources.map(([source, s]) => (
            <span key={source} className="inline-flex items-center gap-1.5">
              <SourceTag source={`Prices: ${source}`} asOf={s.asOf} cached={s.cached} />
              {s.oldest !== s.asOf && <span className="text-[11px] text-[#A3A3A3]">(oldest {fmtTime(s.oldest)})</span>}
            </span>
          ))}
          <span className="text-[11px] text-[#A3A3A3]">Prices in each listing&apos;s own currency · 5-day and since-added changes use Yahoo Finance daily closes · hover a price for its time</span>
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
              watching={list.items.some((i) => i.ticker === preview)}
              listName={list.name}
              onAdd={addPreviewed}
              onClose={() => setPreview(null)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
