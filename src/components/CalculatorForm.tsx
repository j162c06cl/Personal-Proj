"use client";

import { useState } from "react";
import { CalculatorResult } from "@/lib/types";

interface Props {
  onResult: (result: CalculatorResult) => void;
  onClear: () => void;
}

export default function CalculatorForm({ onResult, onClear }: Props) {
  const [amount, setAmount] = useState("");
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = yesterday.toISOString().split("T")[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); onClear();
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Please enter a ticker symbol (e.g. AAPL, VOO)."); return; }
    if (!amount || parseFloat(amount) <= 0) { setError("Please enter a valid investment amount."); return; }
    if (!date) { setError("Please select a purchase date."); return; }
    if (date >= new Date().toISOString().split("T")[0]) { setError("Purchase date must be in the past."); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/historical?ticker=${encodeURIComponent(t)}&from=${date}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      const investmentAmount = parseFloat(amount);
      const sharesOwned = investmentAmount / data.closingPrice;
      const currentValue = sharesOwned * data.currentPrice;
      const profitLoss = currentValue - investmentAmount;
      const percentReturn = (profitLoss / investmentAmount) * 100;
      onResult({ ticker: t, purchaseDate: date, actualDate: data.actualDate, priceAtPurchase: data.closingPrice, currentPrice: data.currentPrice, sharesOwned, currentValue, profitLoss, percentReturn, investmentAmount });
    } catch {
      setError("Failed to fetch data. Please try again.");
    }
    setLoading(false);
  }

  const inputCls = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Investment Amount (USD)</label>
          <input type="number" min="1" step="any" placeholder="e.g. 10000" value={amount}
            onChange={(e) => { setAmount(e.target.value); onClear(); }} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ticker Symbol</label>
          <input type="text" placeholder="e.g. AAPL, VOO, MSFT" value={ticker}
            onChange={(e) => { setTicker(e.target.value.toUpperCase()); onClear(); }}
            className={inputCls + " uppercase"} autoCapitalize="characters" />
          <p className="text-xs text-gray-400 mt-1">US stocks and ETFs only. See Watchlist for examples.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Purchase Date</label>
          <input type="date" max={maxDate} value={date}
            onChange={(e) => { setDate(e.target.value); onClear(); }} className={inputCls} />
        </div>
        <button type="submit" disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm">
          {loading ? "Calculating..." : "Calculate Return"}
        </button>
      </div>
      {error && <p className="mt-3 text-red-500 text-xs">{error}</p>}
    </form>
  );
}
