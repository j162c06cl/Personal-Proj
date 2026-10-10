"use client";

import { useState, useEffect, useCallback } from "react";
import WatchlistTable from "@/components/WatchlistTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import SourceTag from "@/components/SourceTag";
import { WatchlistDef, WatchlistEntryWithData } from "@/lib/types";
import { loadWatchlists, saveWatchlists } from "@/lib/store";
import { getQuotes, QuoteMap } from "@/lib/data";

export default function WatchlistPage() {
  const [lists, setLists] = useState<WatchlistDef[]>([]);
  const [activeId, setActiveId] = useState("");
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [addTicker, setAddTicker] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [pendingDeleteListId, setPendingDeleteListId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    loadWatchlists().then((stored) => {
      setLists(stored);
      setActiveId(stored[0]?.id ?? "");
      setReady(true);
    });
  }, []);

  const fetchQuotes = useCallback(async (tickers: string[], force = false) => {
    if (!tickers.length) return;
    setLoading(true);
    const map = await getQuotes(tickers, { force });
    setQuotes((prev) => ({ ...prev, ...map }));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready || !lists.length) return;
    const all = Array.from(new Set(lists.flatMap((l) => l.tickers)));
    fetchQuotes(all);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const activeList = lists.find((l) => l.id === activeId);

  const entries: WatchlistEntryWithData[] = (activeList?.tickers ?? []).map((ticker) => {
    const q = quotes[ticker]?.value;
    return {
      id: ticker,
      ticker,
      name: q?.name ?? ticker,
      category: activeList?.name ?? "",
      addedAt: "",
      price: q?.price ?? null,
      open: q?.open ?? null,
      change: q?.change ?? null,
      changePercent: q?.changePercent ?? null,
      weekHigh52: q?.weekHigh52 ?? null,
      weekLow52: q?.weekLow52 ?? null,
      marketCap: q?.marketCap ?? null,
      volume: q?.volume ?? null,
      avgVolume: q?.avgVolume ?? null,
      dayHigh: q?.dayHigh ?? null,
      dayLow: q?.dayLow ?? null,
      pe: q?.pe ?? null,
      divYield: q?.divYield ?? null,
      error: q?.error,
    };
  });

  const filtered = search
    ? entries.filter(
        (e) =>
          e.ticker.toLowerCase().includes(search.toLowerCase()) ||
          e.name.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  function applyLists(updated: WatchlistDef[]) {
    setLists(updated);
    saveWatchlists(updated);
  }

  function handleAddTicker() {
    const t = addTicker.trim().toUpperCase();
    if (!t || !activeList || activeList.tickers.includes(t)) {
      setAddTicker("");
      return;
    }
    const updated = lists.map((l) =>
      l.id === activeId ? { ...l, tickers: [...l.tickers, t] } : l
    );
    applyLists(updated);
    setAddTicker("");
    if (!quotes[t]) fetchQuotes([t]);
  }

  function handleDeleteTicker(ticker: string) {
    const updated = lists.map((l) =>
      l.id === activeId ? { ...l, tickers: l.tickers.filter((t) => t !== ticker) } : l
    );
    applyLists(updated);
  }

  function handleAddList() {
    const name = newListName.trim();
    if (!name) return;
    const id = `list-${Date.now()}`;
    const updated = [...lists, { id, name, tickers: [] }];
    applyLists(updated);
    setActiveId(id);
    setCreatingList(false);
    setNewListName("");
  }

  function handleDeleteList(listId: string) {
    if (lists.length <= 1) return;
    setPendingDeleteListId(listId);
  }

  function confirmDeleteList() {
    if (!pendingDeleteListId) return;
    const updated = lists.filter((l) => l.id !== pendingDeleteListId);
    applyLists(updated);
    if (activeId === pendingDeleteListId) setActiveId(updated[0].id);
    setPendingDeleteListId(null);
  }

  function cancelDeleteList() {
    setPendingDeleteListId(null);
  }

  function handleRefresh() {
    const all = Array.from(new Set(lists.flatMap((l) => l.tickers)));
    fetchQuotes(all, true);
  }

  // Newest timestamp per provider across the active list
  const sourceRows = Object.entries(
    (activeList?.tickers ?? []).reduce<Record<string, { asOf: string; cached: boolean }>>((acc, t) => {
      const q = quotes[t];
      if (q && (!acc[q.source] || q.asOf > acc[q.source].asOf)) acc[q.source] = { asOf: q.asOf, cached: q.cached };
      return acc;
    }, {})
  );

  if (!ready) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Watchlist</h1>
          <p className="text-[14px] text-[#525252] mt-1">Track stocks with live market data</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-[14px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#0A0A0A] hover:text-[#0A0A0A] px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => { setEditMode((v) => !v); setPendingDeleteListId(null); }}
            className={`text-[14px] font-semibold px-4 py-2 rounded-xl border transition-colors ${
              editMode
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A] hover:bg-[#333]"
                : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
            }`}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {/* Tabs — contained pill group like reference design */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center bg-[#EBEBEB] rounded-xl p-1 gap-0.5">
          {lists.map((l) => (
            <div key={l.id} className="flex items-center">
              <button
                onClick={() => { setActiveId(l.id); setSearch(""); setPendingDeleteListId(null); }}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  activeId === l.id
                    ? "bg-white text-[#0A0A0A] font-semibold shadow-sm border border-[#E5E5E5]"
                    : "text-[#525252] hover:text-[#0A0A0A]"
                }`}
              >
                {l.name}
                {l.tickers.length > 0 && (
                  <span className={`ml-1.5 text-[11px] ${activeId === l.id ? "text-[#525252]" : "text-[#A3A3A3]"}`}>
                    {l.tickers.length}
                  </span>
                )}
              </button>
              {editMode && lists.length > 1 && (
                <button
                  onClick={() => handleDeleteList(l.id)}
                  className="ml-0.5 w-5 h-5 flex items-center justify-center text-[#A3A3A3] hover:text-[#EF4444] transition-colors"
                  title={`Delete "${l.name}"`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Pending list-delete confirmation */}
        {pendingDeleteListId && (() => {
          const name = lists.find((l) => l.id === pendingDeleteListId)?.name ?? "";
          return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-[13px]">
              <span className="text-[#EF4444] font-medium">Delete &quot;{name}&quot;?</span>
              <button onClick={confirmDeleteList} className="px-2.5 py-1 bg-[#EF4444] text-white rounded-lg text-[11px] font-semibold hover:bg-[#DC2626] transition-colors">
                Delete
              </button>
              <button onClick={cancelDeleteList} className="px-2.5 py-1 bg-white border border-[#E5E5E5] text-[#0A0A0A] rounded-lg text-[11px] font-medium hover:bg-[#F7F7F8] transition-colors">
                Cancel
              </button>
            </div>
          );
        })()}

        {creatingList ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddList();
                if (e.key === "Escape") { setCreatingList(false); setNewListName(""); }
              }}
              placeholder="List name…"
              autoFocus
              className="px-3 py-1.5 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] w-32 transition-all"
            />
            <button onClick={handleAddList} className="px-3 py-1.5 text-[13px] bg-[#1F65F0] text-white rounded-xl hover:bg-[#1550D8] font-semibold transition-colors">
              Create
            </button>
            <button
              onClick={() => { setCreatingList(false); setNewListName(""); }}
              className="px-3 py-1.5 text-[13px] text-[#525252] border border-[#E5E5E5] bg-white rounded-xl hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingList(true)}
            className="px-3 py-1.5 text-[13px] font-medium text-[#525252] border border-[#E5E5E5] bg-white rounded-xl hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
          >
            + New List
          </button>
        )}
      </div>

      {/* Controls: search + add ticker */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols or names…"
            className="pl-9 pr-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] w-full transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <TickerAutocomplete
            value={addTicker}
            onChange={setAddTicker}
            onSelect={(ticker) => { setAddTicker(ticker); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddTicker(); }}
            placeholder="Ticker symbol…"
            inputClassName="px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] w-40 font-mono tracking-wide transition-all"
          />
          <button
            onClick={handleAddTicker}
            disabled={!addTicker.trim()}
            className="px-4 py-2 text-[13px] bg-[#1F65F0] text-white rounded-xl hover:bg-[#1550D8] disabled:opacity-40 font-semibold whitespace-nowrap transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Table */}
      {loading && entries.length === 0 ? (
        <LoadingSpinner text="Fetching market data…" />
      ) : (
        <WatchlistTable entries={filtered} onDelete={editMode ? handleDeleteTicker : undefined} editMode={editMode} />
      )}
      {sourceRows.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {sourceRows.map(([source, s]) => (
            <SourceTag key={source} source={`Prices: ${source}`} asOf={s.asOf} cached={s.cached} />
          ))}
        </div>
      )}
    </div>
  );
}
