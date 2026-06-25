"use client";

import { useState, useEffect } from "react";
import { PortfolioPosition } from "@/lib/types";
import { getPortfolio, savePortfolio } from "@/lib/localStorage";
import { PORTFOLIO_PRESETS } from "@/lib/presets";

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("portfolio");
      if (raw === null) {
        savePortfolio(PORTFOLIO_PRESETS);
        setPositions(PORTFOLIO_PRESETS);
      } else {
        setPositions(JSON.parse(raw));
      }
    } catch {
      setPositions(PORTFOLIO_PRESETS);
    }
    setReady(true);
  }, []);

  function addPosition(position: PortfolioPosition) {
    const updated = [...positions, position];
    setPositions(updated);
    savePortfolio(updated);
  }

  function updatePosition(updated: PortfolioPosition) {
    const next = positions.map((p) => (p.id === updated.id ? updated : p));
    setPositions(next);
    savePortfolio(next);
  }

  function removePosition(id: string) {
    const updated = positions.filter((p) => p.id !== id);
    setPositions(updated);
    savePortfolio(updated);
  }

  return { positions, ready, addPosition, updatePosition, removePosition };
}
