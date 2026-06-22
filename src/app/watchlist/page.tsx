"use client";

import { useState, useEffect, useCallback } from "react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { WatchlistEntryWithData } from "@/lib/types";
import AddToWatchlistForm from "@/components/AddToWatchlistForm";
import WatchlistTable from "@/components/WatchlistTable";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function WatchlistPage() {
  const { entries, addEntry, removeEntry } = useWatchlist();
  const [enriched, setEnriched] = useState<WatchlistEntryWithData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (entries.length === 0) { setEnriched([]); return; }
    setLoading(true);
    try {
      const tickers = entries.map((e) => e.ticker).join(",");
      const res = await fetch(`/api/quote?ticker=${tickers}`);
      const data = await res.json();
      const dataArray = Array.isArray(data) ? data : [data];
      const byTicker = Object.fromEntries(dataArray.map((d: { ticker: string }) => [d.ticker, d]));
      setEnriched(entries.map((e) => ({ ...e, ...(byTicker[e.ticker] || { price: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: "Not found" }) })) as WatchlistEntryWithData[]);
    } catch {
      setEnriched(entries.map((e) => ({ ...e, price: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: "Failed" })));
    }
    setLoading(false);
  }, [entries]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Watchlist</h1>
          <p className="text-gray-400 text-sm mt-1">Track stocks and ETFs you're watching</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <AddToWatchlistForm onAdd={(entry) => { addEntry(entry); }} />

      {loading && enriched.length === 0 ? (
        <LoadingSpinner text="Fetching market data..." />
      ) : (
        <WatchlistTable entries={enriched} onRemove={removeEntry} />
      )}
    </div>
  );
}
