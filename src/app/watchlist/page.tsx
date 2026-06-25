"use client";

import { useState, useEffect, useCallback } from "react";
import WatchlistTable from "@/components/WatchlistTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { WatchlistEntryWithData } from "@/lib/types";

interface WatchlistDef {
  id: string;
  name: string;
  tickers: string[];
}

const DEFAULT_WATCHLISTS: WatchlistDef[] = [
  { id: "stocks",   name: "Stocks",   tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"] },
  { id: "etf",      name: "ETF",      tickers: ["VOO", "SPY", "QQQ", "VTI", "SCHD", "VGT"] },
  { id: "reit",     name: "REIT",     tickers: ["O", "AMT", "WELL", "VICI", "PSA", "PLD"] },
  { id: "dividend", name: "Dividend", tickers: ["JNJ", "KO", "PG", "PEP", "MCD", "T"] },
];

const LS_KEY = "watchlists_v2";

function loadLists(): WatchlistDef[] {
  try {
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : DEFAULT_WATCHLISTS;
  } catch { return DEFAULT_WATCHLISTS; }
}

function saveLists(lists: WatchlistDef[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(lists)); } catch {}
}

type QuoteMap = Record<string, WatchlistEntryWithData>;

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

  useEffect(() => {
    const stored = loadLists();
    setLists(stored);
    setActiveId(stored[0]?.id ?? "");
    setReady(true);
  }, []);

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quote?ticker=${tickers.join(",")}`);
      const data = await res.json();
      const arr: WatchlistEntryWithData[] = Array.isArray(data) ? data : [data];
      setQuotes((prev) => {
        const next = { ...prev };
        arr.forEach((d) => { if (d.ticker) next[d.ticker] = d; });
        return next;
      });
    } catch {}
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
    const q = quotes[ticker];
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
    saveLists(updated);
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
    fetchQuotes(all);
  }

  if (!ready) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Watchlist</h1>
          <p className="text-gray-500 text-sm mt-1">Track stocks with live market data</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1.5 font-medium transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {lists.map((l) => (
          <div key={l.id} className="flex items-center gap-0.5">
            <button
              onClick={() => { setActiveId(l.id); setSearch(""); setPendingDeleteListId(null); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeId === l.id
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {l.name}
              {l.tickers.length > 0 && (
                <span className={`ml-1.5 text-xs ${activeId === l.id ? "text-blue-100" : "text-gray-400"}`}>
                  {l.tickers.length}
                </span>
              )}
            </button>
            {activeId === l.id && lists.length > 1 && (
              <button
                onClick={() => handleDeleteList(l.id)}
                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                title="Delete this watchlist"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}

        {/* Pending list-delete confirmation */}
        {pendingDeleteListId && (() => {
          const name = lists.find((l) => l.id === pendingDeleteListId)?.name ?? "";
          return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-sm">
              <span className="text-red-700 font-medium">Delete &quot;{name}&quot;?</span>
              <button onClick={confirmDeleteList} className="px-2 py-0.5 bg-red-500 text-white rounded-md text-xs font-medium hover:bg-red-600">
                Delete
              </button>
              <button onClick={cancelDeleteList} className="px-2 py-0.5 bg-white text-gray-600 rounded-md text-xs font-medium border border-gray-200 hover:bg-gray-50">
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
              placeholder="List name..."
              autoFocus
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
            />
            <button onClick={handleAddList} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              Create
            </button>
            <button
              onClick={() => { setCreatingList(false); setNewListName(""); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingList(true)}
            className="px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-full hover:bg-blue-50 font-medium transition-colors"
          >
            + New List
          </button>
        )}
      </div>

      {/* Controls: search + add ticker */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols or names..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={addTicker}
            onChange={(e) => setAddTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddTicker(); }}
            placeholder="Ticker symbol..."
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 font-mono tracking-wide"
          />
          <button
            onClick={handleAddTicker}
            disabled={!addTicker.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium whitespace-nowrap transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Table */}
      {loading && entries.length === 0 ? (
        <LoadingSpinner text="Fetching market data..." />
      ) : (
        <WatchlistTable entries={filtered} onDelete={handleDeleteTicker} />
      )}
    </div>
  );
}
