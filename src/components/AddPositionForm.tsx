"use client";

import { useState } from "react";
import { PortfolioPosition } from "@/lib/types";
import { SECTOR_COLORS } from "@/lib/presets";
import TickerAutocomplete from "@/components/TickerAutocomplete";

interface Props {
  initial?: PortfolioPosition;
  onSave: (position: PortfolioPosition) => void;
  onCancel: () => void;
}

const SECTORS = Object.keys(SECTOR_COLORS);

const inputCls =
  "w-full bg-black/[0.05] border-none rounded-[10px] px-3 py-2.5 text-[13px] text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,113,227,0.2)] transition-all";

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

  // suppress unused warning
  void lookingUp;

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
      <div className="bg-white rounded-[22px] shadow-[0_24px_80px_rgba(0,0,0,0.2),0_0_1px_rgba(0,0,0,0.05)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] sticky top-0 bg-white rounded-t-[22px]">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f]">
            {initial ? "Edit Position" : "Add Position"}
          </h2>
          <button onClick={onCancel} className="text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">Ticker Symbol</label>
            <TickerAutocomplete
              value={ticker}
              onChange={setTicker}
              onSelect={(t, n) => { setTicker(t); setName(n); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupTicker(); } }}
              placeholder="e.g. AAPL"
              inputClassName={`${inputCls} font-mono tracking-wider`}
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">Company / Fund Name</label>
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
            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)} className={inputCls}>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">Purchase Date</label>
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
            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">Purchase Price (USD)</label>
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
                className="text-[11px] bg-black/[0.05] hover:bg-black/[0.08] disabled:opacity-50 text-[#1d1d1f] font-semibold px-3 py-2.5 rounded-[10px] whitespace-nowrap transition-colors"
              >
                {fetchingPrice ? "…" : "Fetch"}
              </button>
            </div>
            <p className="text-[11px] text-[#6e6e73] mt-1">Set a date first, then Fetch to auto-fill the historical price.</p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">Shares</label>
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

          {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-[13px] text-[#1d1d1f] bg-black/[0.05] rounded-[10px] hover:bg-black/[0.08] font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-[13px] bg-[#0071e3] hover:bg-[#0058b0] text-white rounded-[10px] font-semibold transition-colors"
            >
              {initial ? "Save Changes" : "Add Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
