"use client";

import { useEffect, useRef, useState } from "react";
import { addToWatchlist } from "@/lib/store";
import { WatchIntent, WatchlistItem } from "@/lib/types";

export const INTENTS: { value: WatchIntent; label: string; hint: string }[] = [
  { value: "long-term", label: "Long-term", hint: "Candidate to hold for years" },
  { value: "swing",     label: "Swing",     hint: "Setup to trade over days to weeks" },
  { value: "research",  label: "Research later", hint: "Looks interesting; not evaluated yet" },
];

export const intentLabel = (i: WatchIntent) => INTENTS.find((x) => x.value === i)?.label ?? i;

/**
 * "Watch" button with a small popover to choose intent and record why the stock is being added.
 * Shows "Watching" when the stock is already on the watchlist.
 */
export default function WatchButton({
  ticker,
  current,
  defaultIntent = "research",
  defaultNote = "",
  onSaved,
  size = "md",
}: {
  ticker: string;
  current: WatchlistItem | null;
  defaultIntent?: WatchIntent;
  defaultNote?: string;
  onSaved?: (items: WatchlistItem[]) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<WatchIntent>(current?.intent ?? defaultIntent);
  const [note, setNote] = useState(current?.note || defaultNote);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setIntent(current?.intent ?? defaultIntent);
    setNote(current?.note || defaultNote);
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    const items = await addToWatchlist({ ticker, intent, note: note.trim() });
    setSaving(false);
    setOpen(false);
    onSaved?.(items);
  }

  const btn = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-[13px]";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`${btn} rounded-xl font-semibold border transition-colors whitespace-nowrap ${
          current
            ? "bg-[#EBF2FF] text-[#1F65F0] border-[#C7DAFE] hover:bg-[#DCE8FF]"
            : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
        }`}
      >
        {current ? `✓ Watching · ${intentLabel(current.intent)}` : "+ Watch"}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 bg-white border border-[#E5E5E5] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-4 text-left">
          <p className="text-[13px] font-bold text-[#0A0A0A] mb-3">{current ? `Edit ${ticker} on watchlist` : `Add ${ticker} to watchlist`}</p>
          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Intent</p>
          <div className="space-y-1 mb-3">
            {INTENTS.map((o) => (
              <label key={o.value} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${intent === o.value ? "bg-[#F5F8FF]" : "hover:bg-[#F7F7F8]"}`}>
                <input type="radio" name={`intent-${ticker}`} checked={intent === o.value} onChange={() => setIntent(o.value)} className="mt-1 accent-[#1F65F0]" />
                <span>
                  <span className="text-[13px] font-semibold text-[#0A0A0A]">{o.label}</span>
                  <span className="block text-[11px] text-[#525252]">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Reason added</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What caught your eye? e.g. pulled back to its 50-day average"
            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#1F65F0] resize-none"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-[13px] text-[#525252] border border-[#E5E5E5] rounded-xl hover:border-[#0A0A0A]">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 text-[13px] bg-[#1F65F0] text-white rounded-xl font-semibold hover:bg-[#1550D8] disabled:opacity-50">
              {saving ? "Saving…" : current ? "Save" : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
