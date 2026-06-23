"use client";

import { useState, useEffect, useCallback } from "react";
import { WATCHLIST_PRESETS, WATCHLIST_CATEGORIES } from "@/lib/presets";
import { WatchlistEntryWithData } from "@/lib/types";
import WatchlistTable from "@/components/WatchlistTable";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function WatchlistPage() {
  const [enriched, setEnriched] = useState<WatchlistEntryWithData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("MAG 7");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tickers = WATCHLIST_PRESETS.map((e) => e.ticker).join(",");
      const res = await fetch(`/api/quote?ticker=${tickers}`);
      const data = await res.json();
      const dataArray = Array.isArray(data) ? data : [data];
      const byTicker = Object.fromEntries(dataArray.map((d: { ticker: string }) => [d.ticker, d]));
      setEnriched(WATCHLIST_PRESETS.map((e) => ({
        id: e.ticker,
        addedAt: "",
        ...e,
        ...(byTicker[e.ticker] || { price: null, change: null, changePercent: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: "Not found" }),
      })) as WatchlistEntryWithData[]);
    } catch {
      setEnriched(WATCHLIST_PRESETS.map((e) => ({ id: e.ticker, addedAt: "", ...e, price: null, change: null, changePercent: null, marketCap: null, peRatio: null, revenue: null, netIncome: null, error: "Failed" })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = enriched.filter((e) => e.category === activeCategory);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Watchlist</h1>
          <p className="text-gray-400 text-sm mt-1">Live prices for popular stocks and ETFs</p>
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

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {WATCHLIST_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner text="Fetching market data..." />
      ) : (
        <WatchlistTable entries={filtered} />
      )}
    </div>
  );
}
