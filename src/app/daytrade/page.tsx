"use client";

import { useState, useEffect, useCallback } from "react";
import TickerAutocomplete from "@/components/TickerAutocomplete";
import { getDayTradeEntries, saveDayTradeEntries } from "@/lib/localStorage";
import { DayTradeEntry } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/formatters";

interface EntryWithLive extends DayTradeEntry {
  currentPrice: number | null;
  dollarChange: number | null;
  percentChange: number | null;
  error?: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function DaysSinceBadge({ iso }: { iso: string }) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return <span className="text-xs text-[#A3A3A3]">Today</span>;
  if (days === 1) return <span className="text-xs text-[#A3A3A3]">1 day ago</span>;
  return <span className="text-xs text-[#A3A3A3]">{days} days ago</span>;
}

export default function DayTradePage() {
  const [entries, setEntries] = useState<EntryWithLive[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<{ ticker: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const enrichEntries = useCallback(async (base: DayTradeEntry[]): Promise<EntryWithLive[]> => {
    if (base.length === 0) return [];
    const tickers = base.map((e) => e.ticker).join(",");
    try {
      const res = await fetch(`/api/quote?ticker=${encodeURIComponent(tickers)}`);
      const data = await res.json();
      // API returns a single object for one ticker, array for multiple
      const quotes: { ticker: string; price: number | null; error?: string }[] =
        Array.isArray(data) ? data : [data];
      const quoteMap: Record<string, { price: number | null; error?: string }> = {};
      for (const q of quotes) {
        quoteMap[q.ticker] = { price: q.price, error: q.error };
      }
      return base.map((e) => {
        const q = quoteMap[e.ticker];
        const current = q?.price ?? null;
        const dollar = current !== null ? current - e.addedPrice : null;
        const pct = dollar !== null ? (dollar / e.addedPrice) * 100 : null;
        return { ...e, currentPrice: current, dollarChange: dollar, percentChange: pct, error: q?.error };
      });
    } catch {
      return base.map((e) => ({ ...e, currentPrice: null, dollarChange: null, percentChange: null }));
    }
  }, []);

  useEffect(() => {
    const saved = getDayTradeEntries();
    enrichEntries(saved).then(setEntries);
  }, [enrichEntries]);

  async function handleRefresh() {
    setRefreshing(true);
    const base = entries.map(({ currentPrice: _, dollarChange: __, percentChange: ___, error: ____, ...e }) => e);
    const enriched = await enrichEntries(base);
    setEntries(enriched);
    setRefreshing(false);
  }

  async function handleAdd() {
    if (!selectedTicker) {
      setAddError("Search for and select a stock first.");
      return;
    }
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch(`/api/quote?ticker=${encodeURIComponent(selectedTicker.ticker)}`);
      const quote = await res.json();
      if (!quote || quote.price === null) {
        setAddError("Could not fetch current price. Try again.");
        setAdding(false);
        return;
      }
      const newEntry: DayTradeEntry = {
        id: crypto.randomUUID(),
        ticker: selectedTicker.ticker,
        name: selectedTicker.name,
        addedAt: new Date().toISOString(),
        addedPrice: quote.price,
      };
      const saved = getDayTradeEntries();
      const updated = [...saved, newEntry];
      saveDayTradeEntries(updated);
      const enriched = await enrichEntries(updated);
      setEntries(enriched);
      setTickerInput("");
      setSelectedTicker(null);
    } catch {
      setAddError("Something went wrong. Please try again.");
    }
    setAdding(false);
  }

  function handleDelete(id: string) {
    const updated = entries
      .filter((e) => e.id !== id)
      .map(({ currentPrice: _, dollarChange: __, percentChange: ___, error: ____, ...e }) => e);
    saveDayTradeEntries(updated);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const totalTracked = entries.length;
  const winners = entries.filter((e) => (e.percentChange ?? 0) > 0).length;
  const losers = entries.filter((e) => (e.percentChange ?? 0) < 0).length;

  return (
    <div className="min-h-screen bg-[#F7F7F8]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0A0A0A]">Day Trade Tracker</h1>
            <p className="text-sm text-[#A3A3A3] mt-0.5">
              Add a stock to lock in its price — track performance over time.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || entries.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E5E5E5] bg-white text-sm font-medium text-[#525252] hover:text-[#0A0A0A] hover:border-[#C0C0C0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh Prices"}
          </button>
        </div>

        {/* Summary cards */}
        {totalTracked > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tracked", value: totalTracked, color: "text-[#0A0A0A]" },
              { label: "Winning", value: winners, color: "text-[#22C55E]" },
              { label: "Losing", value: losers, color: "text-[#EF4444]" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-[#E5E5E5] px-4 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <p className="text-xs text-[#A3A3A3] uppercase tracking-wide font-medium">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add Stock */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-sm font-semibold text-[#0A0A0A] mb-3">Add Stock to Track</h2>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <TickerAutocomplete
                value={tickerInput}
                onChange={(v) => { setTickerInput(v); if (!v) setSelectedTicker(null); setAddError(null); }}
                onSelect={(ticker, name) => { setSelectedTicker({ ticker, name }); setAddError(null); }}
                placeholder="Search ticker or company name..."
                inputClassName="w-full px-3 py-2.5 rounded-xl border border-[#E5E5E5] text-sm text-[#0A0A0A] placeholder:text-[#A3A3A3] focus:outline-none focus:ring-2 focus:ring-[#1F65F0]/20 focus:border-[#1F65F0] transition-colors"
              />
              {addError && <p className="text-xs text-[#EF4444] mt-1.5">{addError}</p>}
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !selectedTicker}
              className="px-5 py-2.5 rounded-xl bg-[#1F65F0] text-white text-sm font-semibold hover:bg-[#1a56d4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {adding ? "Adding..." : "Add Stock"}
            </button>
          </div>
          {selectedTicker && (
            <p className="text-xs text-[#525252] mt-2">
              Will lock in live price for <span className="font-semibold text-[#0A0A0A]">{selectedTicker.ticker}</span> — {selectedTicker.name}
            </p>
          )}
        </div>

        {/* Table */}
        {entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.04)] py-16 text-center">
            <svg className="w-10 h-10 text-[#E5E5E5] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm font-medium text-[#525252]">No stocks tracked yet</p>
            <p className="text-xs text-[#A3A3A3] mt-1">Search for a stock above and click Add Stock to start tracking.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    {["Ticker", "Company", "Added", "Added Price", "Current Price", "$ Change", "% Change", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#A3A3A3] uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const up = (e.percentChange ?? 0) > 0;
                    const down = (e.percentChange ?? 0) < 0;
                    const changeColor = up ? "text-[#22C55E]" : down ? "text-[#EF4444]" : "text-[#525252]";
                    return (
                      <tr key={e.id} className={`border-b border-[#F3F3F3] hover:bg-[#FAFAFA] transition-colors ${i === entries.length - 1 ? "border-0" : ""}`}>
                        <td className="px-4 py-3.5 font-bold text-[#0A0A0A] font-mono">{e.ticker}</td>
                        <td className="px-4 py-3.5 text-[#525252] max-w-[180px] truncate">{e.name}</td>
                        <td className="px-4 py-3.5">
                          <div className="text-[#0A0A0A] text-xs font-medium">{formatTimestamp(e.addedAt)}</div>
                          <DaysSinceBadge iso={e.addedAt} />
                        </td>
                        <td className="px-4 py-3.5 font-medium text-[#0A0A0A]">{formatCurrency(e.addedPrice)}</td>
                        <td className="px-4 py-3.5 font-medium text-[#0A0A0A]">
                          {e.error ? <span className="text-[#A3A3A3] text-xs">Error</span> : formatCurrency(e.currentPrice)}
                        </td>
                        <td className={`px-4 py-3.5 font-medium ${changeColor}`}>
                          {e.dollarChange !== null ? (e.dollarChange >= 0 ? "+" : "") + formatCurrency(e.dollarChange) : "—"}
                        </td>
                        <td className={`px-4 py-3.5 font-semibold ${changeColor}`}>
                          {e.percentChange !== null ? formatPercent(e.percentChange) : "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="p-1.5 rounded-lg text-[#A3A3A3] hover:text-[#EF4444] hover:bg-red-50 transition-colors"
                            title="Remove from tracker"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-[#F3F3F3]">
              {entries.map((e) => {
                const up = (e.percentChange ?? 0) > 0;
                const down = (e.percentChange ?? 0) < 0;
                const changeColor = up ? "text-[#22C55E]" : down ? "text-[#EF4444]" : "text-[#525252]";
                const bgColor = up ? "bg-green-50" : down ? "bg-red-50" : "bg-[#F7F7F8]";
                return (
                  <div key={e.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0A0A0A] font-mono">{e.ticker}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bgColor} ${changeColor}`}>
                            {e.percentChange !== null ? formatPercent(e.percentChange) : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-[#525252] truncate mt-0.5">{e.name}</p>
                        <p className="text-xs text-[#A3A3A3] mt-1">{formatTimestamp(e.addedAt)}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1.5 rounded-lg text-[#A3A3A3] hover:text-[#EF4444] hover:bg-red-50 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[
                        { label: "Added Price", value: formatCurrency(e.addedPrice) },
                        { label: "Current", value: e.error ? "Error" : formatCurrency(e.currentPrice) },
                        { label: "$ Change", value: e.dollarChange !== null ? (e.dollarChange >= 0 ? "+" : "") + formatCurrency(e.dollarChange) : "—", color: changeColor },
                      ].map((s) => (
                        <div key={s.label} className="bg-[#F7F7F8] rounded-xl p-2.5">
                          <p className="text-[10px] text-[#A3A3A3] font-medium uppercase tracking-wide">{s.label}</p>
                          <p className={`text-sm font-semibold mt-0.5 ${s.color ?? "text-[#0A0A0A]"}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
