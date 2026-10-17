"use client";

import { useState, useEffect } from "react";
import { PortfolioPosition } from "@/lib/types";
import { loadPortfolio, savePortfolio } from "@/lib/store";

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadPortfolio().then((p) => {
      setPositions(p);
      setReady(true);
    });
  }, []);

  function commit(next: PortfolioPosition[]) {
    setPositions(next);
    savePortfolio(next);
  }

  function addPosition(position: PortfolioPosition) {
    commit([...positions, position]);
  }

  function updatePosition(updated: PortfolioPosition) {
    commit(positions.map((p) => (p.id === updated.id ? updated : p)));
  }

  function removePosition(id: string) {
    commit(positions.filter((p) => p.id !== id));
  }

  /** Fills in details on several positions at once (e.g. exchange and currency once looked up) */
  function patchPositions(patches: Record<string, Partial<PortfolioPosition>>) {
    setPositions((prev) => {
      const next = prev.map((p) => (patches[p.id] ? { ...p, ...patches[p.id] } : p));
      savePortfolio(next);
      return next;
    });
  }

  return { positions, ready, addPosition, updatePosition, removePosition, patchPositions };
}
