"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { SECTOR_COLORS } from "@/lib/presets";
import { PortfolioPosition, PortfolioPositionWithData } from "@/lib/types";
import { getFxToUsd, getQuotes, QuoteMap } from "@/lib/data";
import { defaultCurrency } from "@/lib/markets";
import { useMoney } from "@/hooks/useSettings";
import { PortfolioDay, PortfolioSummary } from "@/components/portfolio/PortfolioToday";
import GrowthChart from "@/components/portfolio/GrowthChart";
import PortfolioTable from "@/components/PortfolioTable";
import PositionForm from "@/components/AddPositionForm";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

function shortNum(v: number, symbol: string) {
  if (Math.abs(v) >= 1000) return `${symbol}${(v / 1000).toFixed(1)}k`;
  return `${symbol}${v.toFixed(0)}`;
}

const tooltipStyle = {
  fontSize: 11,
  borderRadius: 12,
  border: "1px solid #E5E5E5",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

export default function PortfolioPage() {
  const { positions: rawPositions, ready, addPosition, updatePosition, removePosition, patchPositions } = usePortfolio();
  const [fx, setFx] = useState<Record<string, number>>({ USD: 1 });
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const money = useMoney();
  const sym = money.currency === "SGD" ? "S$" : "$";

  const storeQuotes = useCallback((map: QuoteMap) => {
    setQuotes((prev) => ({ ...prev, ...map }));
    setQuotesLoaded(true);
  }, []);

  useEffect(() => {
    if (!ready || !rawPositions.length) return;
    const tickers = Array.from(new Set(rawPositions.map((p) => p.ticker)));
    getQuotes(tickers).then(storeQuotes);
  }, [ready, rawPositions, storeQuotes]);

  // Every position records its listing's exchange and currency, filled in from the quote once known
  useEffect(() => {
    const patches: Record<string, Partial<PortfolioPosition>> = {};
    for (const p of rawPositions) {
      const q = quotes[p.ticker]?.value;
      if (q?.currency && (!p.currency || (!p.exchange && q.exchange))) patches[p.id] = { currency: q.currency, ...(q.exchange ? { exchange: q.exchange } : {}) };
    }
    if (Object.keys(patches).length) patchPositions(patches);
  }, [quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const ccyOf = useCallback((p: PortfolioPosition) => p.currency ?? quotes[p.ticker]?.value.currency ?? defaultCurrency(p.ticker), [quotes]);
  const currencies = useMemo(() => Array.from(new Set(rawPositions.map(ccyOf))).filter((c) => !(c in fx)), [rawPositions, ccyOf, fx]);
  useEffect(() => {
    for (const c of currencies) getFxToUsd(c).then((r) => { if (r) setFx((prev) => ({ ...prev, [c]: r.value })); });
  }, [currencies.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Totals add up holdings from different markets, so everything below works in US dollars.
  // Costs convert at today's rate, so a non-USD cost basis is approximate.
  const rateOf = useCallback((p: PortfolioPosition) => fx[ccyOf(p)] ?? 1, [fx, ccyOf]);
  const positions = useMemo(() => rawPositions.map((p) => ({ ...p, purchasePrice: p.purchasePrice * rateOf(p) })), [rawPositions, rateOf]);
  const usdQuotes: QuoteMap = useMemo(() => {
    const out: QuoteMap = { ...quotes };
    for (const p of rawPositions) {
      const q = quotes[p.ticker];
      const r = rateOf(p);
      if (!q || r === 1) continue;
      const v = q.value;
      const conv = (n: number | null) => (n === null ? null : n * r);
      out[p.ticker] = { ...q, value: { ...v, price: conv(v.price), change: conv(v.change), open: conv(v.open), dayHigh: conv(v.dayHigh), dayLow: conv(v.dayLow), weekHigh52: conv(v.weekHigh52), weekLow52: conv(v.weekLow52) } };
    }
    return out;
  }, [quotes, rawPositions, rateOf]);
  const nonUsd = useMemo(() => Array.from(new Set(rawPositions.map(ccyOf).filter((c) => c !== "USD"))), [rawPositions, ccyOf]);
  const toUsd = useMemo(() => Object.fromEntries(rawPositions.map((p) => [p.ticker, rateOf(p)])), [rawPositions, rateOf]);

  const enriched: PortfolioPositionWithData[] = useMemo(() => {
    return positions.map((p) => {
      const q = usdQuotes[p.ticker]?.value;
      if (!q || q.price === null) {
        return { ...p, currentPrice: null, currentValue: null, profitLoss: null, percentReturn: null, error: q?.error ?? "Loading" };
      }
      const currentPrice = q.price;
      const currentValue = currentPrice * p.quantity;
      const profitLoss = (currentPrice - p.purchasePrice) * p.quantity;
      const percentReturn = ((currentPrice - p.purchasePrice) / p.purchasePrice) * 100;
      return { ...p, currentPrice, currentValue, profitLoss, percentReturn };
    });
  }, [positions, usdQuotes]);

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
        fill: (p.profitLoss ?? 0) >= 0 ? "#00B341" : "#F04E23",
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
    // Edit the saved position, in its own currency, not the converted copy shown in the table
    setEditingPosition(rawPositions.find((p) => p.id === pos.id) ?? null);
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

  async function handleRefresh() {
    const tickers = Array.from(new Set(positions.map((p) => p.ticker)));
    if (!tickers.length) return;
    setLoading(true);
    storeQuotes(await getQuotes(tickers, { force: true }));
    setLoading(false);
  }

  if (!ready) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[#0A0A0A]">Portfolio</h1>
          <p className="text-[14px] text-[#525252] mt-1">
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-[14px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#2D8CFF] hover:text-[#0A0A0A] px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 text-[14px] bg-[#2D8CFF] text-white rounded-full hover:bg-[#1A73E0] font-semibold flex items-center gap-1.5 transition-colors"
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
          <div className="w-16 h-16 bg-[#EAF4FF] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#2D8CFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-[14px] text-[#525252] mb-5">No positions yet. Add your first holding to get started.</p>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-[#2D8CFF] text-white text-[14px] rounded-full hover:bg-[#1A73E0] font-semibold transition-colors"
          >
            Add First Position
          </button>
        </div>
      ) : (
        <>
          <PortfolioSummary positions={positions} quotes={quotesLoaded ? usdQuotes : null} />

          <div className="mt-5">
            <GrowthChart positions={positions} quotes={usdQuotes} toUsd={toUsd} />
          </div>

          <h2 className="text-[20px] font-semibold tracking-tight text-[#0A0A0A] mt-10 mb-4">Your holdings today</h2>
          <PortfolioDay positions={positions} quotes={quotesLoaded ? usdQuotes : null} />

          <h2 className="text-[20px] font-semibold tracking-tight text-[#0A0A0A] mt-10 mb-4">Positions</h2>
          {/* Table */}
          {(loading || !quotesLoaded) && enriched.every((e) => e.currentPrice === null) ? (
            <LoadingSpinner text="Fetching market data…" />
          ) : (
            <PortfolioTable positions={enriched} onEdit={handleEdit} onDelete={removePosition} fmt={money.fmt} />
          )}
          {nonUsd.length > 0 && (
            <p className="text-[11px] text-[#A3A3A3] mt-2">
              Holdings listed in {nonUsd.join(", ")} are converted at today&apos;s exchange rate
              {nonUsd.filter((c) => !(c in fx)).length ? " (rate still loading)" : ""}, so their cost basis is approximate. Returns in % are in each listing&apos;s own currency.
            </p>
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
                      <YAxis tickFormatter={(v: number) => shortNum(money.convert(v) ?? v, sym)} tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v) => [money.fmt(v as number), "P&L"]}
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
                      <YAxis tickFormatter={(v: number) => shortNum(money.convert(v) ?? v, sym)} tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v) => [money.fmt(v as number)]}
                        contentStyle={tooltipStyle}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Cost Basis" fill="#D4D4D4" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="Current Value" fill="#00B341" radius={[4, 4, 0, 0]} maxBarSize={32} />
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
                            formatter={(v) => [money.fmt(v as number)]}
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
                              <span className="text-[11px] text-[#525252] w-20 text-right">{money.fmt(a.value)}</span>
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
