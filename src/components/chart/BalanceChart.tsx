"use client";

import { useEffect, useRef, useState } from "react";
import { formatBarTime } from "./drawing";

const HEIGHT = 180;
const PAD = { left: 70, right: 14, top: 14, bottom: 24 };
const LINE = "#2D8CFF";
const INK = "#0A0A0A";
const MUTED = "#A3A3A3";
const GRID = "#F0F0F0";

/** Round numbers for the price axis */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * The account balance at each close (closed trades plus open positions), as one line, with the
 * starting balance, the largest drawdown and, optionally, where the testing period begins.
 */
export default function BalanceChart({
  values, from, times, intraday, capital, money, drawdown, splitAt, title,
}: {
  values: number[];
  /** Bar index of values[0] */
  from: number;
  times: number[];
  intraday: boolean;
  capital: number;
  money: (v: number) => string;
  drawdown: { from: number; to: number; pct: number } | null;
  /** Bar index where testing begins, marked on the whole-history view */
  splitAt?: number;
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = values.length;
  const lo = Math.min(capital, ...values), hi = Math.max(capital, ...values);
  const pad = (hi - lo) * 0.08 || capital * 0.01;
  const yMin = lo - pad, yMax = hi + pad;
  const plotW = Math.max(1, width - PAD.left - PAD.right), plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (k: number) => PAD.left + (n > 1 ? (k / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const when = (k: number) => formatBarTime(times[from + k], intraday);
  const path = values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values[n - 1] ?? capital;
  const dd = drawdown && drawdown.pct > 0 ? { a: drawdown.from - from, b: drawdown.to - from, pct: drawdown.pct } : null;
  const split = splitAt !== undefined && splitAt > from && splitAt - from < n ? splitAt - from : null;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, k)));
  }

  const summary = `${title}: from ${money(capital)} to ${money(last)}${dd ? `; largest drop ${dd.pct.toFixed(1)}% from ${when(dd.a)} to ${when(dd.b)}` : ""}.`;

  return (
    <figure className="mt-2">
      <figcaption className="text-[12px] font-semibold text-[#0A0A0A]">{title}</figcaption>
      <div ref={box} className="relative mt-1" style={{ height: HEIGHT }}>
        {width > 0 && n > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block">
            {ticks(yMin, yMax).map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED}>{money(t)}</text>
              </g>
            ))}
            {dd && (
              <g>
                <rect x={x(dd.a)} y={PAD.top} width={Math.max(1, x(dd.b) - x(dd.a))} height={plotH} fill={INK} opacity={0.05} />
                <text x={x(dd.a) + 4} y={PAD.top + 10} fontSize={10} fill="#525252">Max drawdown −{dd.pct.toFixed(1)}%</text>
              </g>
            )}
            {split !== null && (
              <g>
                <line x1={x(split)} x2={x(split)} y1={PAD.top} y2={PAD.top + plotH} stroke={MUTED} strokeDasharray="3 3" />
                <text x={x(split) + 4} y={PAD.top + plotH - 4} fontSize={10} fill="#525252">Testing →</text>
              </g>
            )}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(capital)} y2={y(capital)} stroke={MUTED} strokeDasharray="4 3" />
            <text x={width - PAD.right} y={y(capital) - 4} textAnchor="end" fontSize={10} fill="#525252">Start {money(capital)}</text>
            <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
            <text x={PAD.left} y={HEIGHT - 6} fontSize={10} fill={MUTED}>{when(0)}</text>
            <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={10} fill={MUTED}>{when(n - 1)}</text>
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={MUTED} />
                <circle cx={x(hover)} cy={y(values[hover])} r={4} fill={LINE} stroke="#FFFFFF" strokeWidth={2} />
              </g>
            )}
            <rect
              x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent"
              onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] shadow-sm tabular-nums"
            style={x(hover) > width / 2 ? { right: width - x(hover) + 8 } : { left: x(hover) + 8 }}
          >
            <div className="text-[#525252]">{when(hover)}</div>
            <div className="font-semibold text-[#0A0A0A]">{money(values[hover])}</div>
            <div className="text-[#525252]">
              {values[hover] >= capital ? "+" : "−"}{((Math.abs(values[hover] - capital) / capital) * 100).toFixed(1)}% vs start
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}
