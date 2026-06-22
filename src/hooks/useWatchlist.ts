"use client";

import { useState, useEffect } from "react";
import { WatchlistEntry } from "@/lib/types";
import { getWatchlist, saveWatchlist } from "@/lib/localStorage";

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  useEffect(() => {
    setEntries(getWatchlist());
  }, []);

  function addEntry(entry: WatchlistEntry) {
    const updated = [...entries, entry];
    setEntries(updated);
    saveWatchlist(updated);
  }

  function removeEntry(id: string) {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveWatchlist(updated);
  }

  return { entries, addEntry, removeEntry };
}
