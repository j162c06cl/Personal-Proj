"use client";

import { useState } from "react";
import { PortfolioPosition } from "@/lib/types";
import { SECTOR_COLORS } from "@/lib/presets";

interface Props {
  initial?: PortfolioPosition;
  onSave: (position: PortfolioPosition) => void;
  onCancel: () => void;
}

const SECTORS = Object.keys(SECTOR_COLORS);

const inputCls =
  "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function PositionForm({ initial, onSave, onCancel }: Props) {
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "Technology");
  const [purchasePrice, setPurchasePrice] = useState(initial ? String(initial.purchasePrice) : "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? "");
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "");
  const [lookingUp, setLookingUp] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [error, setError] = useState("");

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = yesterday.toISOString().split("T")[0];

  async function lookupTicker() {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLookingUp(true);
    setError("");
    try {
      const res = await fetch(`/api/quote?ticker=${t}`);
      const data = await res.json();
      if (data.name && !data.error) {
        setName(data.name);
        setTicker(t);
      } else {
        setError(`Could not find "${t}"`);
      }
    } catch {
      setError("Lookup failed.");
    }
    setLookingUp(false);
  }

  async function fetchPriceOnDate() {
    const t = ticker.trim().toUpperCase();
    if (!t || !purchaseDate) { setError("Enter a ticker and date first."); return; }
    setFetchingPrice(true);
    setError("");
    try {
      const res = await fetch(`/api/historical?ticker=${t}&from=${purchaseDate}`);
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setPurchasePrice(data.closingPrice.toFixed(2)); }
    } catch {
      setError("Failed to fetch price.");
    }
    setFetchingPrice(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Enter a ticker symbol."); return; }
    if (!name.trim()) { setError("Enter a name or use Lookup."); return; }
    if (!purchasePrice || parseFloat(purchasePrice) <= 0) { setError("Enter a valid purchase price."); return; }
    if (!purchaseDate) { setError("Select a purchase date."); return; }
    if (!quantity || parseFloat(quantity) <= 0) { setError("Enter a valid quantity."); return; }

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      ticker: t,
      name: name.trim(),
      sector,
      purchasePrice: parseFloat(purchasePrice),
      purchaseDate,
      quantity: parseFloat(quantity),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">
            {initial ? "Edit Position" : "Add Position"}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ticker Symbol</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupTicker(); } }}
                placeholder="e.g. AAPL"
                className={`${inputCls} font-mono tracking-wider`}
              />
              <button
                type="button"
                onClick={lookupTicker}
                disabled={lookingUp || !ticker.trim()}
                className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-medium px-3 py-2 rounded-lg border border-gray-300 whitespace-nowrap transition-colors"
              >
                {lookingUp ? "..." : "Lookup"}
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Company / Fund Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc."
              className={inputCls}
            />
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)} className={inputCls}>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date</label>
            <input
              type="date"
              max={maxDate}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Purchase Price */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price (USD)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder="e.g. 150.00"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                onClick={fetchPriceOnDate}
                disabled={fetchingPrice}
                className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-medium px-3 py-2 rounded-lg border border-gray-300 whitespace-nowrap transition-colors"
              >
                {fetchingPrice ? "..." : "Fetch"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Set a date first, then Fetch to auto-fill the historical price.</p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Shares</label>
            <input
              type="number"
              min="0.0001"
              step="any"
              placeholder="e.g. 10"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              {initial ? "Save Changes" : "Add Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
