"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TickerLink from "@/components/TickerLink";
import TickerPreview from "@/components/TickerPreview";
import SourceTag from "@/components/SourceTag";
import { INTENTS } from "@/components/WatchButton";
import { ResearchStatus, WatchlistItem } from "@/lib/types";
import { loadWatchlist, saveWatchlist } from "@/lib/store";
import { getFundamentals, getQuotes, QuoteMap } from "@/lib/data";
import { CATEGORY_ORDER, categoryFrom, knownCategory } from "@/lib/categories";
import { formatCurrency, formatPercent } from "@/lib/formatters";

const STATUSES: { value: ResearchStatus; label: string; cls: string; dot: string }[] = [
  { value: "not-started", label: "Not started", cls: "bg-[#F7F7F8] text-[#525252] border-[#E5E5E5]", dot: "bg-[#D4D4D4]" },
  { value: "researching", label: "Researching", cls: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]", dot: "bg-[#F59E0B]" },
  { value: "done",        label: "Done",        cls: "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]", dot: "bg-[#22C55E]" },
];

const categoryOf = (i: WatchlistItem) => i.category ?? knownCategory(i.ticker) ?? "Other";

/** Details for one watched stock: plan, note and research status, all optional */
function ItemDetails({ item, onChange, onRemove }: { item: WatchlistItem; onChange: (patch: Partial<WatchlistItem>) => void; onRemove: () => void }) {
  const [note, setNote] = useState(item.note);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setNote(item.note), [item.note]);

  return (
    <div className="px-4 pb-4 pt-1 bg-[#FAFBFF] border-t border-[#F0F0F0] space-y-3">
      <div>
        <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Plan</p>
        <div className="flex flex-wrap gap-1.5">
          {INTENTS.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange({ intent: o.value })}
              title={o.hint}
              className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
                item.intent === o.value ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#0A0A0A]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Why you&apos;re watching</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note.trim() !== item.note) onChange({ note: note.trim() }); }}
          rows={2}
          placeholder="Optional. What caught your eye?"
          className="w-full px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] resize-none"
        />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Research</span>
          <select
            value={item.status}
            onChange={(e) => onChange({ status: e.target.value as ResearchStatus })}
            className={`text-[12px] font-semibold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${STATUSES.find((s) => s.value === item.status)!.cls}`}
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#A3A3A3]">
            Added {new Date(item.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {item.legacyList && ` · from ${item.legacyList}`}
          </span>
          {confirm ? (
            <span className="inline-flex items-center gap-1.5">
              <button onClick={onRemove} className="text-[12px] px-2.5 py-1 bg-[#EF4444] text-white rounded-lg font-semibold">Remove</button>
              <button onClick={() => setConfirm(false)} className="text-[12px] px-2.5 py-1 border border-[#E5E5E5] rounded-lg">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirm(true)} className="text-[12px] font-semibold text-[#A3A3A3] hover:text-[#EF4444]">Remove</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  function openPreview(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (t) setPreview(t);
  }

  function addPreviewed(category: string | null) {
    if (!items || !preview) return;
    if (!items.some((i) => i.ticker === preview)) {
      commit([...items, {
        ticker: preview, intent: "research", note: "", status: "not-started",
        addedAt: new Date().toISOString(), ...(category ? { category } : {}),
      }]);
      fetchQuotes([preview]);
    }
    setExpanded(preview);
  }

  const groups = useMemo(() => {
    const by: Record<string, WatchlistItem[]> = {};
    for (const i of items ?? []) (by[categoryOf(i)] ??= []).push(i);
    return CATEGORY_ORDER.filter((c) => by[c]?.length).map((c) => ({ name: c, items: by[c].sort((a, b) => a.ticker.localeCompare(b.ticker)) }));
  }, [items]);

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

  return (
    <div className="max-w-[1280px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Watchlist</h1>
          <p className="text-[14px] text-[#525252] mt-1">
            {items.length} stock{items.length !== 1 ? "s" : ""}, grouped automatically by sector. Search to look one up before adding it.
          </p>
        </div>
        <button
          onClick={() => fetchQuotes(items.map((i) => i.ticker), true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-[14px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#0A0A0A] hover:text-[#0A0A0A] px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Search → preview → add */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-2xl">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3] pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <TickerAutocomplete
            value={query}
            onChange={setQuery}
            onSelect={(t) => { openPreview(t); setQuery(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { openPreview(query); setQuery(""); } }}
            placeholder="Search a ticker or company, e.g. AMD or Nvidia"
            inputClassName="w-full pl-10 pr-9 py-3 text-[14px] bg-white border border-[#E5E5E5] rounded-2xl focus:outline-none focus:border-[#1F65F0] focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)]"
          />
        </div>
        {preview && (
          <div className="max-w-2xl">
            <TickerPreview
              key={preview}
              ticker={preview}
              watching={items.some((i) => i.ticker === preview)}
              onAdd={addPreviewed}
              onClose={() => setPreview(null)}
            />
          </div>
        )}
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 text-center text-[13px] text-[#525252]">
          Your watchlist is empty. Search for a stock above, or use + Watch in the screener or on a research page.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {groups.map((g) => (
            <section key={g.name} className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
              <div className="flex items-baseline gap-2 px-4 py-3 border-b border-[#F0F0F0]">
                <h2 className="text-[15px] font-bold text-[#0A0A0A]">{g.name}</h2>
                <span className="text-[12px] text-[#A3A3A3]">{g.items.length}</span>
              </div>
              <ul className="divide-y divide-[#F0F0F0]">
                {g.items.map((item) => {
                  const q = quotes[item.ticker]?.value;
                  const isOpen = expanded === item.ticker;
                  const status = STATUSES.find((s) => s.value === item.status)!;
                  const intent = INTENTS.find((o) => o.value === item.intent);
                  return (
                    <li key={item.ticker} className={preview === item.ticker ? "bg-[#F5F8FF]" : ""}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpanded(isOpen ? null : item.ticker)}
                        onKeyDown={(e) => { if (e.key === "Enter") setExpanded(isOpen ? null : item.ticker); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#FAFAFA] cursor-pointer"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} title={`Research: ${status.label}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <TickerLink ticker={item.ticker} />
                            {item.intent !== "research" && intent && (
                              <span className="text-[10px] font-semibold text-[#525252] bg-[#F0F0F0] rounded px-1.5 py-0.5">{intent.label}</span>
                            )}
                          </div>
                          <p className="text-[12px] text-[#525252] truncate">{item.note || q?.name || ""}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[13px] font-semibold tabular-nums text-[#0A0A0A]">{q?.price != null ? formatCurrency(q.price) : "—"}</p>
                          <p className={`text-[12px] font-semibold tabular-nums ${q?.changePercent == null ? "text-[#A3A3A3]" : q.changePercent >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                            {q?.changePercent != null ? formatPercent(q.changePercent) : "—"}
                          </p>
                        </div>
                        <svg className={`w-4 h-4 text-[#A3A3A3] shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      {isOpen && (
                        <ItemDetails
                          item={item}
                          onChange={(patch) => update(item.ticker, patch)}
                          onRemove={() => { commit(items.filter((i) => i.ticker !== item.ticker)); setExpanded(null); }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {sources.map(([source, s]) => <SourceTag key={source} source={`Prices: ${source}`} asOf={s.asOf} cached={s.cached} />)}
        </div>
      )}
    </div>
  );
}
