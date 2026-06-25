"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { SCREENER_UNIVERSE } from "@/lib/screenerUniverse";
import { QuoteData } from "@/lib/types";

interface StockWithData {
  ticker: string;
  name: string;
  sector: string;
  changePercent: number | null;
  marketCap: number | null;
}

interface Box { x: number; y: number; w: number; h: number; }
interface SqItem { id: string; val: number; }

type SqNode = SqItem & Box;

// ── Squarified treemap ──────────────────────────────────────────────────────
function squarify(items: SqItem[], box: Box): SqNode[] {
  const out: SqNode[] = [];
  if (!items.length || box.w < 1 || box.h < 1) return out;

  const total = items.reduce((s, i) => s + i.val, 0);
  if (total === 0) return out;

  const scale = (box.w * box.h) / total;

  function lay(nodes: SqItem[], x: number, y: number, w: number, h: number) {
    if (!nodes.length || w < 1 || h < 1) return;
    if (nodes.length === 1) { out.push({ ...nodes[0], x, y, w, h }); return; }

    const isWide = w >= h;
    const s = isWide ? h : w;  // short side

    let row: SqItem[] = [];
    let rowA = 0;
    let bestWR = Infinity;
    let splitAt = 0;

    for (let i = 0; i < nodes.length; i++) {
      const cand = nodes[i];
      const newRow = [...row, cand];
      const newA = rowA + cand.val * scale;
      const rowLen = newA / s;
      const wr = newRow.reduce((mx, n) => {
        const nLen = (n.val * scale / newA) * s;
        return Math.max(mx, Math.max(rowLen / nLen, nLen / rowLen));
      }, 0);

      if (i === 0 || wr <= bestWR) {
        row = newRow; rowA = newA; bestWR = wr; splitAt = i + 1;
      } else break;
    }

    const rowLen = rowA / s;
    let off = isWide ? y : x;
    for (const n of row) {
      const nLen = (n.val * scale / rowA) * s;
      out.push(isWide
        ? { ...n, x, y: off, w: rowLen, h: nLen }
        : { ...n, x: off, y, w: nLen, h: rowLen });
      off += nLen;
    }

    const rem = nodes.slice(splitAt);
    if (rem.length) {
      if (isWide) lay(rem, x + rowLen, y, w - rowLen, h);
      else lay(rem, x, y + rowLen, w, h - rowLen);
    }
  }

  lay(items, box.x, box.y, box.w, box.h);
  return out;
}

// ── Color scale (Finviz-style: dark red → red → gray → green → dark green) ─
function cellColor(p: number | null): string {
  if (p === null) return "#4b5563";
  if (p >=  5)   return "#14532d";
  if (p >=  3)   return "#166534";
  if (p >=  1)   return "#15803d";
  if (p >=  0.5) return "#16a34a";
  if (p >= -0.5) return "#374151";  // neutral dark gray
  if (p >= -1)   return "#991b1b";
  if (p >= -3)   return "#b91c1c";
  if (p >= -5)   return "#dc2626";
  return "#ef4444";
}

const SECTOR_ORDER = [
  "Technology", "Financials", "Healthcare", "Consumer Disc.",
  "Communication", "Industrials", "Consumer Staples", "Energy",
  "Real Estate", "Utilities", "Materials", "ETF",
];

const GAP = 2;       // px between sector blocks
const INNER_GAP = 1; // px between stock cells
const HEADER = 18;   // px for sector label bar

// ── Component ───────────────────────────────────────────────────────────────
export default function StockHeatmap() {
  const [stocks, setStocks] = useState<StockWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; stock: StockWithData } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(700);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Fetch quotes
  const fetchData = useCallback(async () => {
    setLoading(true);
    const tickers = SCREENER_UNIVERSE.map((s) => s.ticker);
    const BATCH = 20;
    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += BATCH)
      batches.push(tickers.slice(i, i + BATCH));

    try {
      const responses = await Promise.all(
        batches.map((b) => fetch(`/api/quote?ticker=${b.join(",")}`).then((r) => r.json()))
      );
      const flat: QuoteData[] = responses.flat();
      const map = new Map(flat.map((d) => [d.ticker, d]));

      setStocks(
        SCREENER_UNIVERSE.map((s) => {
          const d = map.get(s.ticker);
          return {
            ticker: s.ticker,
            name: s.name,
            sector: s.sector,
            changePercent: d?.changePercent ?? null,
            marketCap: d?.marketCap ?? null,
          };
        })
      );
    } catch {
      setStocks(
        SCREENER_UNIVERSE.map((s) => ({ ticker: s.ticker, name: s.name, sector: s.sector, changePercent: null, marketCap: null }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Layout computation ────────────────────────────────────────────────────
  const boxH = Math.round(boxW * 0.58);

  const { sectorBoxes, stockCells } = useMemo(() => {
    if (!stocks.length || boxW < 10 || boxH < 10)
      return { sectorBoxes: [] as (SqNode & { sector: string })[], stockCells: [] as (SqNode & StockWithData)[] };

    // Sector sizing: sum of market caps (fallback to count)
    const sectorCaps: Record<string, number> = {};
    stocks.forEach((s) => {
      const cap = s.marketCap ?? 1e9; // fallback 1B
      sectorCaps[s.sector] = (sectorCaps[s.sector] ?? 0) + cap;
    });

    const sectorItems: SqItem[] = SECTOR_ORDER
      .filter((sec) => sectorCaps[sec] > 0)
      .map((sec) => ({ id: sec, val: sectorCaps[sec] }));

    const mainBox: Box = { x: 0, y: 0, w: boxW, h: boxH };
    const rawSectors = squarify(sectorItems, mainBox);
    const sBoxes = rawSectors.map((n) => ({ ...n, sector: n.id }));

    // Stock cells within each sector
    const cells: (SqNode & StockWithData)[] = [];

    sBoxes.forEach((sb) => {
      const inner: Box = {
        x: sb.x + GAP,
        y: sb.y + HEADER + GAP,
        w: sb.w - GAP * 2,
        h: sb.h - HEADER - GAP * 2,
      };
      if (inner.w < 4 || inner.h < 4) return;

      const sectorStocks = stocks.filter((s) => s.sector === sb.sector);
      const stockItems: SqItem[] = sectorStocks.map((s) => ({
        id: s.ticker,
        val: s.marketCap ?? 1e9,
      }));

      const rawCells = squarify(stockItems, inner);
      rawCells.forEach((rc) => {
        const stock = sectorStocks.find((s) => s.ticker === rc.id);
        if (stock) cells.push({ ...rc, ...stock, x: rc.x + INNER_GAP, y: rc.y + INNER_GAP, w: rc.w - INNER_GAP * 2, h: rc.h - INNER_GAP * 2 });
      });
    });

    return { sectorBoxes: sBoxes, stockCells: cells };
  }, [stocks, boxW, boxH]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = stockCells.find((c) => mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h);
    if (hit) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, stock: hit });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Stock Heatmap</h2>
          <p className="text-xs text-gray-400 mt-0.5">Sized by market cap · colored by today&apos;s % change</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 flex items-center gap-1 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Map */}
      <div ref={containerRef} className="relative bg-gray-950" style={{ height: boxH }}>
        {loading && stocks.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-6 h-6 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-xs text-gray-500">Fetching market data…</span>
            </div>
          </div>
        ) : (
          <svg
            width={boxW}
            height={boxH}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
            className="block"
          >
            {/* Sector backgrounds + labels */}
            {sectorBoxes.map((sb) => (
              <g key={sb.sector}>
                <rect x={sb.x} y={sb.y} width={sb.w} height={sb.h} fill="#111827" />
                <rect x={sb.x} y={sb.y} width={sb.w} height={HEADER} fill="#1f2937" />
                <text
                  x={sb.x + 5}
                  y={sb.y + HEADER - 5}
                  fill="#9ca3af"
                  fontSize={Math.min(11, Math.max(8, sb.w / 12))}
                  fontWeight={600}
                  fontFamily="system-ui,sans-serif"
                >
                  {sb.sector}
                </text>
              </g>
            ))}

            {/* Stock cells */}
            {stockCells.map((cell) => {
              const bg = cellColor(cell.changePercent);
              const cw = Math.max(0, cell.w);
              const ch = Math.max(0, cell.h);
              const showTicker = cw >= 24 && ch >= 16;
              const showPct = cw >= 28 && ch >= 28;
              const tickerSize = Math.max(7, Math.min(12, cw / 5));
              const pctSize = Math.max(7, Math.min(11, cw / 6));
              const midX = cell.x + cw / 2;
              const midY = cell.y + ch / 2;

              return (
                <g key={cell.ticker}>
                  <rect x={cell.x} y={cell.y} width={cw} height={ch} fill={bg} rx={2} />
                  {showTicker && (
                    <text
                      x={midX}
                      y={showPct ? midY - pctSize * 0.6 : midY + tickerSize * 0.35}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={tickerSize}
                      fontWeight={700}
                      fontFamily="system-ui,sans-serif"
                    >
                      {cell.ticker}
                    </text>
                  )}
                  {showPct && (
                    <text
                      x={midX}
                      y={midY + pctSize * 1.1}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.8)"
                      fontSize={pctSize}
                      fontFamily="system-ui,sans-serif"
                    >
                      {cell.changePercent !== null
                        ? `${cell.changePercent >= 0 ? "+" : ""}${cell.changePercent.toFixed(2)}%`
                        : "—"}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Tooltip */}
            {tooltip && (() => {
              const { x, y, stock } = tooltip;
              const tw = 160;
              const th = 58;
              const tx = Math.min(x + 12, boxW - tw - 8);
              const ty = Math.min(y + 12, boxH - th - 8);
              const pct = stock.changePercent;
              const pctStr = pct !== null
                ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
                : "—";
              const pctColor = pct === null ? "#9ca3af" : pct >= 0 ? "#4ade80" : "#f87171";
              return (
                <g>
                  <rect x={tx} y={ty} width={tw} height={th} fill="#1f2937" rx={6} opacity={0.97} />
                  <text x={tx + 10} y={ty + 18} fill="#ffffff" fontSize={12} fontWeight={700} fontFamily="system-ui,sans-serif">
                    {stock.ticker}
                  </text>
                  <text x={tx + 10} y={ty + 33} fill="#9ca3af" fontSize={9.5} fontFamily="system-ui,sans-serif">
                    {stock.name.length > 22 ? stock.name.slice(0, 22) + "…" : stock.name}
                  </text>
                  <text x={tx + 10} y={ty + 48} fill={pctColor} fontSize={11} fontWeight={600} fontFamily="system-ui,sans-serif">
                    {pctStr}  ·  {stock.sector}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 px-5 py-2.5 border-t border-gray-100">
        {[
          { color: "#14532d", label: "≥+5%" },
          { color: "#16a34a", label: "+1–5%" },
          { color: "#374151", label: "Flat" },
          { color: "#b91c1c", label: "−1–5%" },
          { color: "#ef4444", label: "≤−5%" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
