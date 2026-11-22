"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TickerPreview from "@/components/TickerPreview";
import SourceTag from "@/components/SourceTag";
import { Watchlist, WatchlistItem } from "@/lib/types";
import { loadWatchlists, newId, newItem, saveWatchlists } from "@/lib/store";
import { getChart, getFundamentals, getQuotes, QuoteMap } from "@/lib/data";
import { categoryFrom, knownCategory } from "@/lib/categories";
import { closeOnOrBefore, rangeCovering } from "@/lib/portfolioHistory";
import { formatPercent } from "@/lib/formatters";
import { defaultCurrency, formatMoney } from "@/lib/markets";
import { useMediaQuery, WIDE } from "@/hooks/useMediaQuery";

const SPARK_DAYS = 5;

type SortKey = "added" | "name" | "move";
type Show = "today" | "since";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "added", label: "Order added" },
  { id: "name", label: "A–Z" },
  { id: "move", label: "Biggest movers" },
];

// Moves that round to 0.00% read as flat, not as a red "-0.00%"
const flat = (v: number) => Math.abs(v) < 0.005;

function Sparkline({ closes }: { closes: number[] }) {
  const w = 72, h = 28;
  if (closes.length < 2) return <span className="inline-block" style={{ width: w, height: h }} />;
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * w},${hi === lo ? h / 2 : h - 3 - ((c - lo) / (hi - lo)) * (h - 6)}`).join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={w} height={h} className="block" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#00B341" : "#F04E23"} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The coloured change pill on the right of each row */
function ChangePill({ v }: { v: number | null }) {
  const cls = v === null || flat(v) ? "bg-[#F0F0F0] text-[#737373]" : v > 0 ? "bg-[#00B341] text-white" : "bg-[#F04E23] text-white";
  return (
    <span className={`inline-block min-w-[76px] text-center px-2 py-1 rounded-lg text-[13px] font-semibold tabular-nums ${cls}`}>
      {v === null ? "—" : flat(v) ? "0.00%" : formatPercent(v)}
    </span>
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
  // On a laptop the list has a quick-look panel beside it; this is the stock shown there
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE);
  const [sort, setSort] = useState<SortKey>("added");
  const [show, setShow] = useState<Show>("today");
  // Edit mode: rename the list, remove stocks, write notes, delete the list
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

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
    try {
      const s = localStorage.getItem("watchlist_sort");
      if (s === "added" || s === "name" || s === "move") setSort(s);
      if (localStorage.getItem("watchlist_show") === "since") setShow("since");
    } catch {}
  }, []);

  useEffect(() => {
    if (!activeId) return;
    try { localStorage.setItem("watchlist_active", activeId); } catch {}
    setEditing(false);
  }, [activeId]);

  useEffect(() => { try { localStorage.setItem("watchlist_sort", sort); localStorage.setItem("watchlist_show", show); } catch {} }, [sort, show]);

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

  function removeFromList(ticker: string) {
    if (!lists || !list) return;
    commit(lists.map((l) => (l.id === list.id ? { ...l, items: l.items.filter((i) => i.ticker !== ticker) } : l)));
  }

  function createList() {
    if (!lists) return;
    const l: Watchlist = { id: newId(), name: newName.trim() || `List ${lists.length + 1}`, createdAt: new Date().toISOString(), items: [] };
    commit([...lists, l]);
    setActiveId(l.id);
    setCreating(false);
    setNewName("");
  }

  function renameList() {
    if (!lists || !list || !nameDraft.trim() || nameDraft.trim() === list.name) return;
    commit(lists.map((l) => (l.id === list.id ? { ...l, name: nameDraft.trim() } : l)));
  }

  function deleteList() {
    if (!lists || !list) return;
    if (!window.confirm(`Delete "${list.name}"${list.items.length ? ` and its ${list.items.length} stock${list.items.length > 1 ? "s" : ""}` : ""}?`)) return;
    const rest = lists.filter((l) => l.id !== list.id);
    // Always keep one list to add to
    const next = rest.length ? rest : [{ id: newId(), name: "My watchlist", createdAt: new Date().toISOString(), items: [] }];
    commit(next);
    setActiveId(next[0].id);
  }

  function startEditing() {
    if (!list) return;
    setNameDraft(list.name);
    setEditing(true);
  }

  function finishEditing() {
    renameList();
    setEditing(false);
  }

  // Record each stock's sector, exchange and currency once
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

  // Recent closes for the sparkline, and the close on the day each stock was added
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
    if (t) { setPreview(t); setQuery(""); }
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
    setQuery("");
  }

  useEffect(() => {
    if (!preview) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);

  const rows = useMemo(() => {
    const out = items.map((item, order) => {
      const q = quotes[item.ticker]?.value;
      const price = q?.price ?? null;
      return {
        item,
        order,
        name: q?.name ?? "",
        currency: item.currency ?? q?.currency ?? defaultCurrency(item.ticker),
        price,
        today: q?.changePercent ?? null,
        since: price !== null && item.addedPrice ? ((price - item.addedPrice) / item.addedPrice) * 100 : null,
        spark: closes[item.ticker] ?? [],
      };
    });
    if (sort === "name") out.sort((a, b) => a.item.ticker.localeCompare(b.item.ticker));
    if (sort === "move") {
      const v = (r: (typeof out)[number]) => (show === "today" ? r.today : r.since);
      out.sort((a, b) => Math.abs(v(b) ?? -1) - Math.abs(v(a) ?? -1));
    }
    return out;
  }, [items, quotes, closes, sort, show]);

  // Newest quote time per provider, for the footnote
  const sources = useMemo(() => {
    const by: Record<string, { asOf: string; cached: boolean }> = {};
    for (const i of items) {
      const q = quotes[i.ticker];
      if (q && (!by[q.source] || q.asOf > by[q.source].asOf)) by[q.source] = { asOf: q.asOf, cached: q.cached };
    }
    return Object.entries(by);
  }, [items, quotes]);

  if (!lists || !list) return null;

  // A looked-up stock first, then the row picked in the list, then the list's first stock
  const panelTicker = preview ?? (selected && items.some((i) => i.ticker === selected) ? selected : rows[0]?.item.ticker ?? null);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 lg:items-start">
    <div className="min-w-0">
      {/* Title */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {editing ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") finishEditing(); }}
            aria-label="List name"
            className="min-w-0 flex-1 text-[28px] font-semibold tracking-tight text-[#0A0A0A] border-b-2 border-[#2D8CFF] focus:outline-none bg-transparent"
          />
        ) : (
          <h1 className="text-[32px] font-semibold tracking-tight text-[#0A0A0A] truncate">{list.name}</h1>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {!editing && items.length > 0 && (
            <button
              onClick={() => fetchQuotes(items.map((i) => i.ticker), true)}
              disabled={loading}
              title="Refresh prices"
              aria-label="Refresh prices"
              className="p-2 text-[#2D8CFF] hover:bg-[#EAF4FF] rounded-full disabled:opacity-50 transition-colors"
            >
              <svg className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            onClick={editing ? finishEditing : startEditing}
            className={`px-4 py-1.5 rounded-full text-[14px] font-semibold transition-colors ${editing ? "bg-[#2D8CFF] text-white hover:bg-[#1A73E0]" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"}`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0 mb-4" role="tablist" aria-label="Watchlists">
        {lists.map((l) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={l.id === list.id}
            onClick={() => setActiveId(l.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-semibold transition-colors ${
              l.id === list.id ? "bg-[#2D8CFF] text-white" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"
            }`}
          >
            {l.name}
          </button>
        ))}
        {creating ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
            onBlur={() => (newName.trim() ? createList() : setCreating(false))}
            placeholder="List name"
            aria-label="New list name"
            className="shrink-0 w-36 px-3.5 py-1.5 rounded-full text-[14px] border border-[#2D8CFF] focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-semibold text-[#737373] hover:bg-[#F7F7F8] transition-colors"
          >
            + New list
          </button>
        )}
      </div>

      {/* Add a stock */}
      {!editing && (
        <div className="relative mb-2">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3] pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <TickerAutocomplete
            value={query}
            onChange={setQuery}
            onSelect={(t) => openPreview(t)}
            onKeyDown={(e) => { if (e.key === "Enter") openPreview(query); }}
            placeholder="Add a stock"
            inputClassName="w-full pl-10 pr-8 py-2.5 text-[15px] bg-[#F7F7F8] border border-transparent rounded-full focus:outline-none focus:bg-white focus:border-[#2D8CFF]"
          />
        </div>
      )}

      {/* Column header: sort on the left, what the pill shows on the right */}
      {items.length > 0 && !editing && (
        <div className="flex items-center justify-between py-2 text-[13px]">
          <label className="flex items-center gap-1 text-[#737373]">
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent font-semibold text-[#525252] focus:outline-none cursor-pointer">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <button
            onClick={() => setShow((s) => (s === "today" ? "since" : "today"))}
            title="Switch between today's move and the move since you added each stock"
            className="font-semibold text-[#2D8CFF] hover:underline"
          >
            {show === "today" ? "Today" : "Since added"} ⇅
          </button>
        </div>
      )}

      {/* Stocks */}
      {items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[16px] font-semibold text-[#0A0A0A]">Nothing here yet</p>
          <p className="text-[14px] text-[#737373] mt-1">Search above to add a stock, or tap + Watch in the screener or on any stock page.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#F0F0F0] border-t border-[#F0F0F0]">
          {rows.map((r) => {
            const note = r.item.note || r.item.thesis || "";
            if (editing) {
              return (
                <li key={r.item.ticker} className="flex items-start gap-3 py-3">
                  <button
                    onClick={() => removeFromList(r.item.ticker)}
                    aria-label={`Remove ${r.item.ticker}`}
                    title={`Remove ${r.item.ticker} from ${list.name}`}
                    className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-[#F04E23] text-white flex items-center justify-center text-[16px] leading-none hover:bg-[#D9401A]"
                  >
                    −
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-[#0A0A0A]">{r.item.ticker} <span className="text-[13px] font-normal text-[#737373]">{r.name}</span></p>
                    <input
                      defaultValue={note}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== note) updateInList(r.item.ticker, r.item.note || !r.item.thesis ? { note: v, updatedAt: new Date().toISOString() } : { thesis: v, updatedAt: new Date().toISOString() });
                      }}
                      placeholder="Add a note"
                      aria-label={`Note for ${r.item.ticker}`}
                      className="mt-1 w-full px-3 py-1.5 text-[14px] bg-[#F7F7F8] border border-transparent rounded-lg focus:outline-none focus:bg-white focus:border-[#2D8CFF]"
                    />
                  </div>
                </li>
              );
            }
            const value = show === "today" ? r.today : r.since;
            const shown = wide && r.item.ticker === panelTicker;
            return (
              <li key={r.item.ticker}>
                <Link
                  href={`/stock/${encodeURIComponent(r.item.ticker)}`}
                  // On a laptop a click shows the stock in the panel; its "Full research" link opens the page
                  onClick={(e) => { if (wide) { e.preventDefault(); setSelected(r.item.ticker); setPreview(null); } }}
                  aria-current={shown ? "true" : undefined}
                  className={`flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg transition-colors ${shown ? "bg-[#F2F8FF]" : "hover:bg-[#FAFAFA]"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-[#0A0A0A]">{r.item.ticker}</p>
                    <p className="text-[13px] text-[#737373] truncate">{note || r.name || " "}</p>
                  </div>
                  <Sparkline closes={r.spark} />
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-semibold text-[#0A0A0A] tabular-nums mb-0.5">{formatMoney(r.price, r.currency)}</p>
                    <ChangePill v={value} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <div className="mt-6 pt-4 border-t border-[#F0F0F0]">
          <button onClick={deleteList} className="text-[14px] font-semibold text-[#F04E23] hover:underline">Delete this list</button>
        </div>
      )}

      {!editing && sources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-6">
          {sources.map(([source, s]) => <SourceTag key={source} source={`Prices: ${source}`} asOf={s.asOf} cached={s.cached} />)}
          <span className="text-[11px] text-[#A3A3A3]">Charts show the last {SPARK_DAYS} trading days</span>
        </div>
      )}

    </div>

      {/* Laptop: quick look beside the list */}
      <aside className="hidden lg:block lg:sticky lg:top-24" aria-label="Quick look">
        {panelTicker ? (
          <TickerPreview
            key={panelTicker}
            ticker={panelTicker}
            watching={list.items.some((i) => i.ticker === panelTicker)}
            listName={list.name}
            onAdd={addPreviewed}
            onClose={preview ? () => setPreview(null) : undefined}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E5E5E5] p-6 text-center text-[13px] text-[#737373]">
            Search for a stock to see a quick look here.
          </div>
        )}
      </aside>

      {/* Phone and tablet: look-up drawer */}
      {preview && !wide && (
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
