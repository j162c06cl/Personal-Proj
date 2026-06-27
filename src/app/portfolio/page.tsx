"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { SECTOR_COLORS } from "@/lib/presets";
import { PortfolioPosition, PortfolioPositionWithData } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import PortfolioTable from "@/components/PortfolioTable";
import PositionForm from "@/components/AddPositionForm";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

type QuoteMap = Record<string, { price: number | null; error?: string }>;

function shortNum(v: number) {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

const tooltipStyle = {
  fontSize: 11,
  borderRadius: 12,
  border: "1px solid #E5E5E5",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

export default function PortfolioPage() {
  const { positions, ready, addPosition, updatePosition, removePosition } = usePortfolio();
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quote?ticker=${tickers.join(",")}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [data];
      setQuotes((prev) => {
        const next = { ...prev };
        arr.forEach((d: { ticker: string; price: number | null; error?: string }) => {
          next[d.ticker] = { price: d.price, error: d.error };
        });
        return next;
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready || !positions.length) return;
    const tickers = Array.from(new Set(positions.map((p) => p.ticker)));
    fetchQuotes(tickers);
  }, [ready, positions, fetchQuotes]);

  const enriched: PortfolioPositionWithData[] = useMemo(() => {
    return positions.map((p) => {
      const q = quotes[p.ticker];
      if (!q || q.price === null) {
        return { ...p, currentPrice: null, currentValue: null, profitLoss: null, percentReturn: null, error: q?.error ?? "Loading" };
      }
      const currentPrice = q.price;
      const currentValue = currentPrice * p.quantity;
      const profitLoss = (currentPrice - p.purchasePrice) * p.quantity;
      const percentReturn = ((currentPrice - p.purchasePrice) / p.purchasePrice) * 100;
      return { ...p, currentPrice, currentValue, profitLoss, percentReturn };
    });
  }, [positions, quotes]);

  const totalInvested = enriched.reduce((s, p) => s + p.purchasePrice * p.quantity, 0);
  const totalCurrent = enriched.reduce((s, p) => s + (p.currentValue ?? p.purchasePrice * p.quantity), 0);
  const totalPL = totalCurrent - totalInvested;
  const totalReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const isUp = totalPL >= 0;

  const sectorAllocation = useMemo(() => {
    const bySector: Record<string, number> = {};
    enriched.forEach((p) => {
      const val = p.currentValue ?? p.purchasePrice * p.quantity;
      bySector[p.sector] = (bySector[p.sector] ?? 0) + val;
    });
    const total = Object.values(bySector).reduce((s, v) => s + v, 0);
    return Object.entries(bySector)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [enriched]);

  const plChartData = useMemo(() =>
    enriched
      .filter((p) => p.profitLoss !== null)
      .map((p) => ({
        ticker: p.ticker,
        pl: parseFloat((p.profitLoss ?? 0).toFixed(2)),
        fill: (p.profitLoss ?? 0) >= 0 ? "#22C55E" : "#EF4444",
      })),
    [enriched]
  );

  const valueChartData = useMemo(() =>
    enriched
      .filter((p) => p.currentValue !== null)
      .map((p) => ({
        ticker: p.ticker,
        "Cost Basis": parseFloat((p.purchasePrice * p.quantity).toFixed(2)),
        "Current Value": parseFloat((p.currentValue ?? p.purchasePrice * p.quantity).toFixed(2)),
      })),
    [enriched]
  );

  function handleSave(position: PortfolioPosition) {
    if (editingPosition) {
      updatePosition(position);
    } else {
      addPosition(position);
    }
    setShowForm(false);
    setEditingPosition(null);
  }

  function handleEdit(pos: PortfolioPositionWithData) {
    const { currentPrice, currentValue, profitLoss, percentReturn, error, ...base } = pos;
    void currentPrice; void currentValue; void profitLoss; void percentReturn; void error;
    setEditingPosition(base);
    setShowForm(true);
  }

  function handleOpenAdd() {
    setEditingPosition(null);
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingPosition(null);
  }

  function handleRefresh() {
    const tickers = Array.from(new Set(positions.map((p) => p.ticker)));
    fetchQuotes(tickers);
  }

  if (!ready) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Portfolio</h1>
          <p className="text-[14px] text-[#525252] mt-1">
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-[14px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#0A0A0A] hover:text-[#0A0A0A] px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 text-[14px] bg-[#1F65F0] text-white rounded-xl hover:bg-[#1550D8] font-semibold flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Position
          </button>
        </div>
      </div>

      {/* Empty state */}
      {positions.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-[#EBF2FF] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#1F65F0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-[14px] text-[#525252] mb-5">No positions yet. Add your first holding to get started.</p>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-[#1F65F0] text-white text-[14px] rounded-xl hover:bg-[#1550D8] font-semibold transition-colors"
          >
            Add First Position
          </button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total Invested", value: formatCurrency(totalInvested), color: "text-[#0A0A0A]" },
              { label: "Current Value",  value: formatCurrency(totalCurrent),  color: "text-[#0A0A0A]" },
              { label: "Total P&L",      value: formatCurrency(totalPL),       color: isUp ? "text-[#22C55E]" : "text-[#EF4444]" },
              { label: "Total Return",   value: formatPercent(totalReturn),    color: isUp ? "text-[#22C55E]" : "text-[#EF4444]" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-5 border border-[#E5E5E5] hover:border-[#C8C8C8] hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)] transition-all duration-200">
                <p className="text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">{s.label}</p>
                <p className={`text-[17px] font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {loading && enriched.every((e) => e.currentPrice === null) ? (
            <LoadingSpinner text="Fetching market data…" />
          ) : (
            <PortfolioTable positions={enriched} onEdit={handleEdit} onDelete={removePosition} />
          )}

          {/* Charts */}
          {enriched.some((e) => e.currentPrice !== null) && (
            <div className="mt-6 space-y-5">
              {plChartData.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
                  <h2 className="text-[15px] font-semibold text-[#0A0A0A] mb-1">P&L by Position</h2>
                  <p className="text-[11px] text-[#525252] mb-4">Profit or loss per holding in dollars</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={plChartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                      <XAxis dataKey="ticker" tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={shortNum} tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v) => [formatCurrency(v as number), "P&L"]}
                        contentStyle={tooltipStyle}
                      />
                      <Bar dataKey="pl" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {plChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} fillOpacity={0.9} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {valueChartData.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
                  <h2 className="text-[15px] font-semibold text-[#0A0A0A] mb-1">Cost Basis vs Current Value</h2>
                  <p className="text-[11px] text-[#525252] mb-4">What you paid vs what each position is worth today</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={valueChartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                      <XAxis dataKey="ticker" tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={shortNum} tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v) => [formatCurrency(v as number)]}
                        contentStyle={tooltipStyle}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Cost Basis" fill="#D4D4D4" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="Current Value" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {sectorAllocation.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
                  <h2 className="text-[15px] font-semibold text-[#0A0A0A] mb-1">Sector Allocation</h2>
                  <p className="text-[11px] text-[#525252] mb-4">Portfolio weight by sector at current value</p>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-full sm:w-60 h-60 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={sectorAllocation}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={100}
                            dataKey="value"
                            nameKey="name"
                            paddingAngle={2}
                          >
                            {sectorAllocation.map((entry) => (
                              <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] ?? "#9ca3af"} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v) => [formatCurrency(v as number)]}
                            contentStyle={tooltipStyle}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2 w-full">
                      {sectorAllocation.map((a) => (
                        <div key={a.name} className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[a.name] ?? "#9ca3af" }} />
                          <div className="flex items-center justify-between flex-1 min-w-0">
                            <span className="text-[13px] text-[#0A0A0A] truncate">{a.name}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="w-20 bg-[#F0F0F0] rounded-full h-1.5 hidden sm:block">
                                <div className="h-1.5 rounded-full" style={{ width: `${a.pct}%`, backgroundColor: SECTOR_COLORS[a.name] ?? "#9ca3af" }} />
                              </div>
                              <span className="text-[13px] font-semibold text-[#0A0A0A] w-10 text-right">{a.pct.toFixed(1)}%</span>
                              <span className="text-[11px] text-[#525252] w-20 text-right">{formatCurrency(a.value)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showForm && (
        <PositionForm
          initial={editingPosition ?? undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
