"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PORTFOLIO_PRESETS, SECTOR_COLORS } from "@/lib/presets";
import { PortfolioPositionWithData } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import PortfolioTable from "@/components/PortfolioTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function PortfolioPage() {
  const [enriched, setEnriched] = useState<PortfolioPositionWithData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tickers = Array.from(new Set(PORTFOLIO_PRESETS.map((p) => p.ticker))).join(",");
      const res = await fetch(`/api/quote?ticker=${tickers}`);
      const data = await res.json();
      const dataArray = Array.isArray(data) ? data : [data];
      const byTicker = Object.fromEntries(dataArray.map((d: { ticker: string; price: number | null }) => [d.ticker, d]));
      setEnriched(PORTFOLIO_PRESETS.map((p) => {
        const q = byTicker[p.ticker];
        if (!q || q.price === null) return { ...p, currentPrice: null, currentValue: null, profitLoss: null, percentReturn: null, error: "Data unavailable" };
        const currentPrice = q.price;
        const currentValue = currentPrice * p.quantity;
        const profitLoss = (currentPrice - p.purchasePrice) * p.quantity;
        const percentReturn = ((currentPrice - p.purchasePrice) / p.purchasePrice) * 100;
        return { ...p, currentPrice, currentValue, profitLoss, percentReturn };
      }));
    } catch {
      setEnriched(PORTFOLIO_PRESETS.map((p) => ({ ...p, currentPrice: null, currentValue: null, profitLoss: null, percentReturn: null, error: "Failed" })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allocation = useMemo(() => {
    const bySector: Record<string, number> = {};
    enriched.forEach((p) => {
      const val = p.currentValue ?? p.purchasePrice * p.quantity;
      bySector[p.sector] = (bySector[p.sector] ?? 0) + val;
    });
    const total = Object.values(bySector).reduce((s, v) => s + v, 0);
    return Object.entries(bySector)
      .map(([sector, value]) => ({ name: sector, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [enriched]);

  const totalInvested = enriched.reduce((s, p) => s + p.purchasePrice * p.quantity, 0);
  const totalCurrent = enriched.reduce((s, p) => s + (p.currentValue ?? p.purchasePrice * p.quantity), 0);
  const totalPL = totalCurrent - totalInvested;
  const totalReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const isUp = totalPL >= 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sample Portfolio</h1>
          <p className="text-gray-500 text-sm mt-1">8 popular stocks & ETFs — bought Jan 2022, held to today</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 font-medium">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Invested",  value: formatCurrency(totalInvested), color: "text-gray-900" },
          { label: "Current Value",   value: formatCurrency(totalCurrent),  color: "text-gray-900" },
          { label: "Total P&L",       value: formatCurrency(totalPL),       color: isUp ? "text-emerald-600" : "text-red-500" },
          { label: "Total Return",    value: formatPercent(totalReturn),    color: isUp ? "text-emerald-600" : "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner text="Fetching market data..." />
      ) : (
        <>
          <PortfolioTable positions={enriched} />

          {/* Allocation chart */}
          {allocation.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Portfolio Allocation by Sector</h2>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-full sm:w-64 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={allocation} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name">
                        {allocation.map((entry) => (
                          <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] ?? "#9ca3af"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 w-full">
                  {allocation.map((a) => (
                    <div key={a.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[a.name] ?? "#9ca3af" }} />
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="text-sm text-gray-700 truncate">{a.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                            <div className="h-1.5 rounded-full" style={{ width: `${a.pct}%`, backgroundColor: SECTOR_COLORS[a.name] ?? "#9ca3af" }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-900 w-10 text-right">{a.pct.toFixed(1)}%</span>
                          <span className="text-xs text-gray-500 w-20 text-right">{formatCurrency(a.value)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
