"use client";

import { useState, useEffect, useCallback } from "react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { PortfolioPositionWithData } from "@/lib/types";
import AddPositionForm from "@/components/AddPositionForm";
import PortfolioTable from "@/components/PortfolioTable";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function PortfolioPage() {
  const { positions, addPosition, removePosition } = usePortfolio();
  const [enriched, setEnriched] = useState<PortfolioPositionWithData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (positions.length === 0) { setEnriched([]); return; }
    setLoading(true);
    try {
      const tickers = Array.from(new Set(positions.map((p) => p.ticker))).join(",");
      const res = await fetch(`/api/quote?ticker=${tickers}`);
      const data = await res.json();
      const dataArray = Array.isArray(data) ? data : [data];
      const byTicker = Object.fromEntries(dataArray.map((d: { ticker: string; price: number | null }) => [d.ticker, d]));
      setEnriched(positions.map((p) => {
        const q = byTicker[p.ticker];
        if (!q || q.price === null) return { ...p, currentPrice: null, currentValue: null, profitLoss: null, percentReturn: null, error: "Data unavailable" };
        const currentPrice = q.price;
        const currentValue = currentPrice * p.quantity;
        const profitLoss = (currentPrice - p.purchasePrice) * p.quantity;
        const percentReturn = ((currentPrice - p.purchasePrice) / p.purchasePrice) * 100;
        return { ...p, currentPrice, currentValue, profitLoss, percentReturn };
      }));
    } catch {
      setEnriched(positions.map((p) => ({ ...p, currentPrice: null, currentValue: null, profitLoss: null, percentReturn: null, error: "Failed" })));
    }
    setLoading(false);
  }, [positions]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Test Portfolio</h1>
          <p className="text-gray-400 text-sm mt-1">Simulate a portfolio without real money</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors flex items-center gap-1">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <AddPositionForm onAdd={addPosition} />

      {loading && enriched.length === 0 ? (
        <LoadingSpinner text="Fetching market data..." />
      ) : (
        <PortfolioTable positions={enriched} onRemove={removePosition} />
      )}
    </div>
  );
}
