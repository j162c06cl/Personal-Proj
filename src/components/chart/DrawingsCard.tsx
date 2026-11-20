"use client";

import { useState } from "react";
import { NOTE_MAX } from "@/lib/marketData/annotations";
import { formatPercent } from "@/lib/formatters";
import PanelCard from "./PanelCard";
import { formatBarTime } from "./drawing";

export interface TrendlineRow {
  id: string;
  a: { time: number; price: number };
  b: { time: number; price: number };
  /** Bars between the two points, or null when a point is outside the loaded bars */
  bars: number | null;
}

export interface NoteRow {
  id: string;
  time: number;
  text: string;
  /** False when its bar is outside the loaded bars, so it isn't drawn */
  onChart: boolean;
}

const linkButton = "text-[12px] font-semibold text-[#2D8CFF] hover:underline";
const deleteButton = "text-[12px] font-semibold text-[#F04E23] hover:underline";

/** The reader's trendlines and notes on this timeframe */
export default function DrawingsCard({
  timeframeLabel,
  trendlines,
  notes,
  elsewhere,
  intraday,
  price,
  onRemoveTrendline,
  onUpdateNote,
  onRemoveNote,
}: {
  timeframeLabel: string;
  trendlines: TrendlineRow[];
  notes: NoteRow[];
  /** Trendlines and notes drawn on other timeframes, by timeframe label */
  elsewhere: { label: string; count: number }[];
  intraday: boolean;
  price: (v: number) => string;
  onRemoveTrendline: (id: string) => void;
  onUpdateNote: (id: string, text: string) => void;
  onRemoveNote: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const when = (t: number) => formatBarTime(t, intraday);
  const offChart = <span className="text-[#B45309]"> · outside the loaded bars</span>;

  return (
    <PanelCard title="Trendlines & notes" aside={`${timeframeLabel} chart`}>
      {!trendlines.length && !notes.length && (
        <p className="text-[12px] text-[#525252]">
          Nothing drawn on the {timeframeLabel} chart yet. Use <b>Trendline</b> or <b>Note</b> above the chart.
        </p>
      )}

      {trendlines.length > 0 && (
        <ul className="divide-y divide-[#F0F0F0]">
          {trendlines.map((t) => (
            <li key={t.id} className="py-2 flex items-start gap-2.5">
              <span aria-hidden className="mt-2 shrink-0 w-4 h-0.5 bg-[#0A0A0A] -rotate-12" />
              <div className="min-w-0 flex-1 text-[12px] tabular-nums">
                <p className="text-[#0A0A0A]">
                  {price(t.a.price)} → {price(t.b.price)}{" "}
                  <span className="text-[#525252]">({formatPercent(((t.b.price - t.a.price) / t.a.price) * 100)})</span>
                </p>
                <p className="text-[11px] text-[#A3A3A3]">
                  {when(t.a.time)} to {when(t.b.time)}
                  {t.bars === null ? offChart : ` · ${t.bars} bars`}
                </p>
              </div>
              <button onClick={() => onRemoveTrendline(t.id)} className={deleteButton} aria-label={`Delete trendline from ${price(t.a.price)} to ${price(t.b.price)}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className={`divide-y divide-[#F0F0F0] ${trendlines.length ? "border-t border-[#F0F0F0]" : ""}`}>
          {notes.map((n) => (
            <li key={n.id} className="py-2">
              <p className="text-[11px] text-[#A3A3A3]">
                <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-[#2D8CFF] mr-1.5 align-middle" />
                {when(n.time)}
                {!n.onChart && offChart}
              </p>
              {editing === n.id ? (
                <form
                  className="mt-1 space-y-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) { onUpdateNote(n.id, draft.trim()); setEditing(null); }
                  }}
                >
                  <textarea
                    aria-label="Note text" autoFocus rows={3} maxLength={NOTE_MAX} value={draft} onChange={(e) => setDraft(e.target.value)}
                    className="w-full px-2 py-1 text-[13px] border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]"
                  />
                  <div className="flex gap-3">
                    <button type="submit" disabled={!draft.trim()} className="px-3 py-1 text-[12px] font-semibold bg-[#2D8CFF] text-white rounded-full disabled:opacity-40">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className={linkButton}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-2.5 mt-0.5">
                  <p className="flex-1 min-w-0 text-[13px] text-[#0A0A0A] whitespace-pre-wrap break-words">{n.text}</p>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditing(n.id); setDraft(n.text); }} className={linkButton} aria-label="Edit note">Edit</button>
                    <button onClick={() => onRemoveNote(n.id)} className={deleteButton} aria-label="Delete note">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {elsewhere.length > 0 && (
        <p className="mt-2 text-[11px] text-[#A3A3A3]">
          Also drawn on other timeframes: {elsewhere.map((e) => `${e.label} (${e.count})`).join(", ")}. Trendlines and notes stay
          on the timeframe they were drawn on; your levels show on all of them.
        </p>
      )}
    </PanelCard>
  );
}
