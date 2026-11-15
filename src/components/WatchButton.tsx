"use client";

import { useEffect, useRef, useState } from "react";
import { addToWatchlist, loadWatchlists, newId, saveWatchlists } from "@/lib/store";
import { WatchIntent, WatchTag, Watchlist, WatchlistItem } from "@/lib/types";

export const INTENTS: { value: WatchIntent; label: string; hint: string }[] = [
  { value: "long-term", label: "Long-term", hint: "Candidate to hold for years" },
  { value: "swing",     label: "Swing",     hint: "Setup to trade over days to weeks" },
  { value: "research",  label: "Undecided", hint: "Not sure which strategy fits yet" },
];

export const TAGS: { value: WatchTag; label: string; cls: string }[] = [
  { value: "researching", label: "Researching", cls: "bg-[#F5F3FF] text-[#5B21B6] border-[#DDD6FE]" },
  { value: "watching",    label: "Watching",    cls: "bg-[#EAF4FF] text-[#0B5CB5] border-[#BBD9FF]" },
  { value: "setup-ready", label: "Setup ready", cls: "bg-[#E7F8EC] text-[#007A2B] border-[#B5E8C4]" },
  { value: "archived",    label: "Archived",    cls: "bg-[#F5F5F5] text-[#525252] border-[#E5E5E5]" },
];

export const intentLabel = (i: WatchIntent) => INTENTS.find((x) => x.value === i)?.label ?? i;
export const tagInfo = (t: WatchTag) => TAGS.find((x) => x.value === t) ?? TAGS[0];

/** Lists that contain the ticker, and the item on the first of them */
export function watchedIn(lists: Watchlist[] | null, ticker: string): { lists: Watchlist[]; item: WatchlistItem | null } {
  const on = (lists ?? []).filter((l) => l.items.some((i) => i.ticker === ticker));
  return { lists: on, item: on[0]?.items.find((i) => i.ticker === ticker) ?? null };
}

/**
 * "Watch" button with a popover to choose the list, strategy and status, and record why the
 * stock is being added. Shows which lists already hold the stock.
 */
export default function WatchButton({
  ticker,
  lists,
  defaultIntent = "research",
  defaultNote = "",
  meta,
  onSaved,
  size = "md",
}: {
  ticker: string;
  /** All watchlists; the button loads them itself when not given */
  lists?: Watchlist[] | null;
  defaultIntent?: WatchIntent;
  defaultNote?: string;
  /** Listing details saved with a new item */
  meta?: Partial<Pick<WatchlistItem, "exchange" | "currency" | "addedPrice" | "category">>;
  onSaved?: (lists: Watchlist[]) => void;
  size?: "sm" | "md";
}) {
  const [own, setOwn] = useState<Watchlist[] | null>(null);
  const all = lists ?? own;
  const [open, setOpen] = useState(false);
  const [listId, setListId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [intent, setIntent] = useState<WatchIntent>(defaultIntent);
  const [tag, setTag] = useState<WatchTag>("researching");
  const [note, setNote] = useState(defaultNote);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lists === undefined) loadWatchlists().then(setOwn);
  }, [lists]);

  const { lists: onLists } = watchedIn(all, ticker);

  // Prefill from the chosen list's entry when the stock is already there
  useEffect(() => {
    if (!open || !all) return;
    const existing = all.find((l) => l.id === listId)?.items.find((i) => i.ticker === ticker);
    setIntent(existing?.intent ?? defaultIntent);
    setTag(existing?.tag ?? (defaultIntent === "swing" && defaultNote ? "setup-ready" : "researching"));
    setNote(existing?.note || defaultNote);
  }, [open, listId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    if (all && !all.some((l) => l.id === listId)) setListId(onLists[0]?.id ?? all[0]?.id ?? "__new");
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    let target = listId;
    if (target === "__new" || !all?.length) {
      const name = newName.trim() || "My watchlist";
      const created: Watchlist = { id: newId(), name, createdAt: new Date().toISOString(), items: [] };
      await saveWatchlists([...(await loadWatchlists()), created]);
      target = created.id;
    }
    const next = await addToWatchlist(target, { ticker, intent, tag, note: note.trim(), ...meta });
    setOwn(next);
    setSaving(false);
    setOpen(false);
    onSaved?.(next);
  }

  const btn = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-[13px]";
  const watching = onLists.length > 0;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={watching ? `On ${onLists.map((l) => l.name).join(", ")}` : "Add to a watchlist"}
        className={`${btn} rounded-xl font-semibold border transition-colors whitespace-nowrap ${
          watching
            ? "bg-[#EAF4FF] text-[#2D8CFF] border-[#BBD9FF] hover:bg-[#DCE8FF]"
            : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#2D8CFF] hover:text-[#0A0A0A]"
        }`}
      >
        {watching ? `✓ Watching${onLists.length > 1 ? ` · ${onLists.length} lists` : size === "md" ? ` · ${onLists[0].name}` : ""}` : "+ Watch"}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 bg-white border border-[#E5E5E5] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-4 text-left">
          <p className="text-[13px] font-bold text-[#0A0A0A] mb-3">Watch {ticker}</p>

          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">List</p>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="w-full mb-2 px-2.5 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#2D8CFF]"
          >
            {(all ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.items.some((i) => i.ticker === ticker) ? " (already on it)" : ""}</option>
            ))}
            <option value="__new">+ New list…</option>
          </select>
          {listId === "__new" && (
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New list name"
              className="w-full mb-2 px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#2D8CFF]"
            />
          )}

          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5 mt-1">Strategy</p>
          <div className="flex gap-1 mb-3">
            {INTENTS.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.hint}
                onClick={() => setIntent(o.value)}
                className={`flex-1 px-2 py-1.5 rounded-full text-[12px] font-semibold border ${intent === o.value ? "bg-[#2D8CFF] text-white border-[#2D8CFF]" : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3]"}`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Status</p>
          <div className="grid grid-cols-2 gap-1 mb-3">
            {TAGS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTag(t.value)}
                className={`px-2 py-1 rounded-lg text-[12px] font-semibold border ${tag === t.value ? t.cls + " ring-2 ring-[#2D8CFF]/30" : "bg-white text-[#737373] border-[#E5E5E5] hover:border-[#A3A3A3]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1.5">Reason added</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What caught your eye? e.g. pulled back to its 50-day average"
            className="w-full px-3 py-2 text-[13px] bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:border-[#2D8CFF] resize-none"
          />
          <p className="text-[11px] text-[#A3A3A3] mt-1">Add a thesis, target and invalidation level on the Watchlist page.</p>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-[13px] text-[#525252] border border-[#E5E5E5] rounded-xl hover:border-[#2D8CFF]">Cancel</button>
            <button onClick={save} disabled={saving || !all} className="px-3 py-1.5 text-[13px] bg-[#2D8CFF] text-white rounded-full font-semibold hover:bg-[#1A73E0] disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
