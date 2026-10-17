"use client";

import { useState } from "react";
import { PortfolioPosition } from "@/lib/types";
import { getQuote } from "@/lib/data";
import { defaultCurrency } from "@/lib/markets";
import { SECTOR_COLORS } from "@/lib/presets";
import TickerAutocomplete from "@/components/TickerAutocomplete";

interface Props {
  initial?: PortfolioPosition;
  onSave: (position: PortfolioPosition) => void;
  onCancel: () => void;
}

const SECTORS = Object.keys(SECTOR_COLORS);

const inputCls =
  "w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-[13px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#1F65F0] focus:bg-white focus:shadow-[0_0_0_3px_rgba(31,101,240,0.12)] transition-all";

export default function PositionForm({ initial, onSave, onCancel }: Props) {
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "Technology");
  const [purchasePrice, setPurchasePrice] = useState(initial ? String(initial.purchasePrice) : "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? "");
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "");
  const [listing, setListing] = useState<{ exchange?: string; currency?: string }>({ exchange: initial?.exchange, currency: initial?.currency });
  const [lookingUp, setLookingUp] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [error, setError] = useState("");

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
      const data = (await getQuote(t))?.value;
      if (data?.name && !data.error) {
        setName(data.name);
        setTicker(t);
        setListing({ exchange: data.exchange ?? undefined, currency: data.currency ?? undefined });
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

  // Record the listing's exchange and currency as soon as a ticker is picked
  async function pick(t: string, n: string) {
    setTicker(t);
    setName(n);
    setError("");
    const q = (await getQuote(t))?.value;
    if (q) setListing({ exchange: q.exchange ?? undefined, currency: q.currency ?? undefined });
  }

  const ccy = listing.currency ?? defaultCurrency(ticker || "X");

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
      ...(listing.exchange ? { exchange: listing.exchange } : {}),
      currency: ccy,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5] sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-[15px] font-semibold text-[#0A0A0A]">
            {initial ? "Edit Position" : "Add Position"}
          </h2>
          <button onClick={onCancel} className="text-[#A3A3A3] hover:text-[#0A0A0A] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Ticker Symbol</label>
            <TickerAutocomplete
              value={ticker}
              onChange={setTicker}
              onSelect={(t, n) => { pick(t, n); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupTicker(); } }}
              placeholder="e.g. AAPL"
              inputClassName={`${inputCls} font-mono tracking-wider`}
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Company / Fund Name</label>
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
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)} className={inputCls}>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Purchase Date</label>
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
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Purchase Price ({ccy}){listing.exchange ? ` · ${listing.exchange}` : ""}</label>
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
                className="text-[11px] bg-[#F7F7F8] border border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A] disabled:opacity-50 text-[#525252] font-semibold px-3 py-2.5 rounded-xl whitespace-nowrap transition-colors"
              >
                {fetchingPrice ? "…" : "Fetch"}
              </button>
            </div>
            <p className="text-[11px] text-[#525252] mt-1">Set a date first, then Fetch to auto-fill the historical price.</p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">Shares</label>
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

          {error && <p className="text-[12px] text-[#EF4444]">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-[13px] text-[#525252] border border-[#E5E5E5] bg-white rounded-xl hover:border-[#0A0A0A] hover:text-[#0A0A0A] font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-[13px] bg-[#1F65F0] hover:bg-[#1550D8] text-white rounded-xl font-semibold transition-colors"
            >
              {initial ? "Save Changes" : "Add Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
