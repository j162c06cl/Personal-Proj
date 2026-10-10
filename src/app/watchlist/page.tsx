"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import TickerLink from "@/components/TickerLink";
import SourceTag from "@/components/SourceTag";
import { INTENTS } from "@/components/WatchButton";
import { ResearchStatus, WatchIntent, WatchlistItem } from "@/lib/types";
import { loadWatchlist, saveWatchlist } from "@/lib/store";
import { getQuotes, QuoteMap } from "@/lib/data";
import { formatCurrency, formatPercent } from "@/lib/formatters";

const STATUSES: { value: ResearchStatus; label: string; cls: string }[] = [
  { value: "not-started", label: "Not started", cls: "bg-[#F7F7F8] text-[#525252] border-[#E5E5E5]" },
  { value: "researching", label: "Researching", cls: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]" },
  { value: "done",        label: "Done",        cls: "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]" },
];

function NoteCell({ item, onSave }: { item: WatchlistItem; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note);

  useEffect(() => { if (!editing) setDraft(item.note); }, [item.note, editing]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft.trim() !== item.note) onSave(draft.trim()); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(item.note); setEditing(false); }
        }}
        placeholder="Why did you add it?"
        className="w-full px-2 py-1 text-[13px] bg-white border border-[#1F65F0] rounded-lg focus:outline-none"
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="text-left w-full group" title="Click to edit">
      {item.note ? (
        <span className="text-[13px] text-[#262626] line-clamp-2">{item.note}</span>
      ) : (
        <span className="text-[12px] text-[#A3A3A3] group-hover:text-[#1F65F0]">+ Add a reason</span>
      )}
    </button>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ResearchStatus | "all">("all");
  const [addTicker, setAddTicker] = useState("");
  const [addIntent, setAddIntent] = useState<WatchIntent>("research");
  const [addNote, setAddNote] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

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
    if (!items) return;
    commit(items.map((i) => (i.ticker === ticker ? { ...i, ...patch } : i)));
  }

  function handleAdd() {
    const t = addTicker.trim().toUpperCase();
    if (!t || !items) return;
    if (items.some((i) => i.ticker === t)) {
      update(t, { intent: addIntent, ...(addNote.trim() ? { note: addNote.trim() } : {}) });
    } else {
      commit([...items, { ticker: t, intent: addIntent, note: addNote.trim(), status: "not-started", addedAt: new Date().toISOString() }]);
      fetchQuotes([t]);
    }
    setAddTicker("");
    setAddNote("");
  }

  const visible = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (statusFilter === "all" || i.status === statusFilter) &&
      (!q || i.ticker.toLowerCase().includes(q) || (quotes[i.ticker]?.value.name ?? "").toLowerCase().includes(q) || i.note.toLowerCase().includes(q))
    );
  }, [items, search, statusFilter, quotes]);

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

  const counts = (s: ResearchStatus | "all") => (s === "all" ? items.length : items.filter((i) => i.status === s).length);

  return (
    <div className="max-w-[1280px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Watchlist</h1>
          <p className="text-[14px] text-[#525252] mt-1">Grouped by why you&apos;re watching. Note the reason and track your research.</p>
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

      {/* Add */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-4 mb-5 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Ticker</label>
          <TickerAutocomplete
            value={addTicker}
            onChange={setAddTicker}
            onSelect={(t) => setAddTicker(t)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="e.g. AMD"
            inputClassName="px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] w-36 font-mono tracking-wide"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Intent</label>
          <select
            value={addIntent}
            onChange={(e) => setAddIntent(e.target.value as WatchIntent)}
            className="px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0]"
          >
            {INTENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Reason added</label>
          <input
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="What caught your eye?"
            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0]"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!addTicker.trim()}
          className="px-4 py-2 text-[13px] bg-[#1F65F0] text-white rounded-xl hover:bg-[#1550D8] disabled:opacity-40 font-semibold"
        >
          + Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center bg-[#EBEBEB] rounded-xl p-1 gap-0.5">
          {([{ value: "all", label: "All" }, ...STATUSES] as { value: ResearchStatus | "all"; label: string }[]).map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                statusFilter === s.value ? "bg-white text-[#0A0A0A] font-semibold shadow-sm border border-[#E5E5E5]" : "text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              {s.label} <span className="text-[11px] text-[#A3A3A3] ml-0.5">{counts(s.value)}</span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickers, names or notes…"
          className="px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] w-64"
        />
      </div>

      {/* Groups */}
      <div className="space-y-5">
        {INTENTS.map((intent) => {
          const group = visible.filter((i) => i.intent === intent.value);
          const total = items.filter((i) => i.intent === intent.value).length;
          return (
            <section key={intent.value} className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
              <div className="flex items-baseline gap-3 px-5 py-3.5 border-b border-[#F0F0F0]">
                <h2 className="text-[16px] font-bold text-[#0A0A0A]">{intent.label}</h2>
                <span className="text-[12px] text-[#A3A3A3]">{total} stock{total !== 1 ? "s" : ""}</span>
                <span className="text-[12px] text-[#525252] hidden sm:inline">· {intent.hint}</span>
              </div>
              {group.length === 0 ? (
                <p className="px-5 py-5 text-[13px] text-[#A3A3A3]">
                  {total ? "No stocks match the current filter." : "Nothing here yet. Add a stock above, or use + Watch in the screener or on a research page."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed" style={{ minWidth: 860 }}>
                    {/* Fixed widths so columns line up across the three intent groups */}
                    <colgroup>
                      <col style={{ width: "19%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "32%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "4%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-[#F7F7F8] border-b border-[#F0F0F0]">
                        {["Stock", "Price", "Today", "Reason added", "Research", "Move to", ""].map((h, i) => (
                          <th key={i} className={`px-4 py-2 text-[11px] font-semibold text-[#525252] uppercase tracking-wider ${h === "Price" || h === "Today" ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0F0]">
                      {group.map((item) => {
                        const q = quotes[item.ticker]?.value;
                        const status = STATUSES.find((s) => s.value === item.status)!;
                        return (
                          <tr key={item.ticker} className="hover:bg-[#FAFAFA] align-top">
                            <td className="px-4 py-3">
                              <TickerLink ticker={item.ticker} />
                              <p className="text-[12px] text-[#525252] truncate">{q?.name ?? ""}</p>
                              {item.legacyList && (
                                <span className="text-[10px] text-[#A3A3A3]" title="The list it was on before watchlists were grouped by intent">from {item.legacyList}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#0A0A0A] whitespace-nowrap">{q?.price != null ? formatCurrency(q.price) : "—"}</td>
                            <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${q?.changePercent == null ? "text-[#A3A3A3]" : q.changePercent >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                              {q?.changePercent != null ? formatPercent(q.changePercent) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <NoteCell item={item} onSave={(note) => update(item.ticker, { note })} />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.status}
                                onChange={(e) => update(item.ticker, { status: e.target.value as ResearchStatus })}
                                className={`text-[12px] font-semibold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${status.cls}`}
                              >
                                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.intent}
                                onChange={(e) => update(item.ticker, { intent: e.target.value as WatchIntent })}
                                className="text-[12px] px-2 py-1 rounded-lg border border-[#E5E5E5] bg-white text-[#525252] focus:outline-none cursor-pointer"
                              >
                                {INTENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {pendingRemove === item.ticker ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <button onClick={() => { commit(items.filter((i) => i.ticker !== item.ticker)); setPendingRemove(null); }} className="text-[11px] px-2 py-0.5 bg-[#EF4444] text-white rounded-lg font-semibold">Remove</button>
                                  <button onClick={() => setPendingRemove(null)} className="text-[11px] px-2 py-0.5 border border-[#E5E5E5] rounded-lg">Cancel</button>
                                </span>
                              ) : (
                                <button onClick={() => setPendingRemove(item.ticker)} className="text-[#A3A3A3] hover:text-[#EF4444] text-[16px] leading-none" title={`Remove ${item.ticker}`}>×</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {sources.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {sources.map(([source, s]) => <SourceTag key={source} source={`Prices: ${source}`} asOf={s.asOf} cached={s.cached} />)}
        </div>
      )}
    </div>
  );
}
