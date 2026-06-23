"use client";

import { useState, useEffect, useRef } from "react";
import { SearchResult, PortfolioPosition } from "@/lib/types";

interface Props {
  onAdd: (position: PortfolioPosition) => void;
}

export default function AddPositionForm({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = yesterday.toISOString().split("T")[0];

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

  async function fetchPriceOnDate() {
    if (!selected || !purchaseDate) { setError("Select a stock and date first."); return; }
    setFetchingPrice(true);
    setError("");
    try {
      const res = await fetch(`/api/historical?ticker=${selected.ticker}&from=${purchaseDate}`);
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setPurchasePrice(data.closingPrice.toFixed(2)); }
    } catch { setError("Failed to fetch price."); }
    setFetchingPrice(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) { setError("Please select a stock."); return; }
    if (!purchasePrice || parseFloat(purchasePrice) <= 0) { setError("Please enter a valid purchase price."); return; }
    if (!purchaseDate) { setError("Please select a purchase date."); return; }
    if (!quantity || parseFloat(quantity) <= 0) { setError("Please enter a valid quantity."); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/quote?ticker=${selected.ticker}`);
      const data = await res.json();
      const position: PortfolioPosition = {
        id: crypto.randomUUID(),
        ticker: selected.ticker,
        name: data.name || selected.name,
        sector: "Other",
        purchasePrice: parseFloat(purchasePrice),
        purchaseDate,
        quantity: parseFloat(quantity),
      };
      onAdd(position);
      setQuery(""); setSelected(null); setPurchasePrice(""); setPurchaseDate(""); setQuantity(""); setSuggestions([]);
    } catch { setError("Failed to add position. Try again."); }
    setLoading(false);
  }

  const inputCls = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Position</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Stock / ETF</label>
          <input
            type="text"
            placeholder="Search ticker or name..."
            value={selected ? `${selected.ticker} — ${selected.name}` : query}
            onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
            className={inputCls}
          />
          {suggestions.length > 0 && !selected && (
            <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <li key={s.ticker} onClick={() => { setSelected(s); setQuery(""); setSuggestions([]); }}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 flex justify-between">
                  <span className="font-semibold text-emerald-600">{s.ticker}</span>
                  <span className="text-gray-500 truncate ml-2">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date</label>
          <input type="date" max={maxDate} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price (USD)</label>
          <div className="flex gap-2">
            <input type="number" min="0.01" step="any" placeholder="e.g. 150.00" value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className={inputCls} />
            <button type="button" onClick={fetchPriceOnDate} disabled={fetchingPrice}
              className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap border border-gray-300">
              {fetchingPrice ? "..." : "Fetch"}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity (Shares)</label>
          <input type="number" min="0.0001" step="any" placeholder="e.g. 10" value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputCls} />
        </div>

        <div className="sm:col-span-2">
          <button type="submit" disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
            {loading ? "Adding..." : "Add Position"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-red-500 text-xs">{error}</p>}
    </form>
  );
}
