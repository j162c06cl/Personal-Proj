"use client";

import { useState, useEffect, useRef } from "react";
import { SearchResult, WatchlistEntry } from "@/lib/types";

const CATEGORY_SUGGESTIONS = ["Tech", "Long-Term", "ETF", "REIT", "Dividend", "Growth", "Speculative", "Finance", "Healthcare", "Energy"];

interface Props {
  onAdd: (entry: WatchlistEntry) => void;
}

export default function AddToWatchlistForm({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) return;
    if (query.length < 1) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSuggestions(data.results || []);
    }, 300);
  }, [query, selected]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) { setError("Please select a stock from the suggestions."); return; }
    if (!category.trim()) { setError("Please enter a category."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/quote?ticker=${selected.ticker}`);
      const data = await res.json();
      if (data.error) { setError("Ticker not found. Try again."); setLoading(false); return; }
      const entry: WatchlistEntry = {
        id: crypto.randomUUID(),
        ticker: selected.ticker,
        name: data.name || selected.name,
        category: category.trim(),
        addedAt: new Date().toISOString(),
      };
      onAdd(entry);
      setQuery(""); setSelected(null); setCategory(""); setSuggestions([]);
    } catch {
      setError("Failed to fetch stock data. Try again.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-6">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Add to Watchlist</h2>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search ticker or name..."
            value={selected ? `${selected.ticker} — ${selected.name}` : query}
            onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          {suggestions.length > 0 && !selected && (
            <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <li
                  key={s.ticker}
                  onClick={() => { setSelected(s); setQuery(""); setSuggestions([]); }}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 flex justify-between"
                >
                  <span className="font-medium text-white">{s.ticker}</span>
                  <span className="text-gray-400 truncate ml-2">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="relative sm:w-44">
          <input
            type="text"
            list="categories"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <datalist id="categories">
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
    </form>
  );
}
