"use client";

import { useState, useEffect, useRef } from "react";
import { SearchResult, CalculatorResult } from "@/lib/types";

interface Props {
  onResult: (result: CalculatorResult) => void;
  onClear: () => void;
}

export default function CalculatorForm({ onResult, onClear }: Props) {
  const [amount, setAmount] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    onClear();
    if (!selected) { setError("Please select a stock from the suggestions."); return; }
    if (!amount || parseFloat(amount) <= 0) { setError("Please enter a valid investment amount."); return; }
    if (!date) { setError("Please select a purchase date."); return; }
    if (date >= new Date().toISOString().split("T")[0]) { setError("Purchase date must be in the past."); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/historical?ticker=${selected.ticker}&from=${date}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }

      const investmentAmount = parseFloat(amount);
      const sharesOwned = investmentAmount / data.closingPrice;
      const currentValue = sharesOwned * data.currentPrice;
      const profitLoss = currentValue - investmentAmount;
      const percentReturn = (profitLoss / investmentAmount) * 100;

      onResult({
        ticker: selected.ticker,
        purchaseDate: date,
        actualDate: data.actualDate,
        priceAtPurchase: data.closingPrice,
        currentPrice: data.currentPrice,
        sharesOwned,
        currentValue,
        profitLoss,
        percentReturn,
        investmentAmount,
      });
    } catch {
      setError("Failed to fetch data. Please try again.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Investment Amount (USD)</label>
          <input
            type="number"
            min="1"
            step="any"
            placeholder="e.g. 10000"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); onClear(); }}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="relative">
          <label className="block text-xs text-gray-400 mb-1">Stock / ETF</label>
          <input
            type="text"
            placeholder="Search ticker or name..."
            value={selected ? `${selected.ticker} — ${selected.name}` : query}
            onChange={(e) => { setSelected(null); setQuery(e.target.value); onClear(); }}
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

        <div>
          <label className="block text-xs text-gray-400 mb-1">Purchase Date</label>
          <input
            type="date"
            max={maxDate}
            value={date}
            onChange={(e) => { setDate(e.target.value); onClear(); }}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
        >
          {loading ? "Calculating..." : "Calculate"}
        </button>
      </div>
      {error && <p className="mt-3 text-red-400 text-xs">{error}</p>}
    </form>
  );
}
