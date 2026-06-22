"use client";

import { useState, useEffect } from "react";
import { PortfolioPosition } from "@/lib/types";
import { getPortfolio, savePortfolio } from "@/lib/localStorage";

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);

  useEffect(() => {
    setPositions(getPortfolio());
  }, []);

  function addPosition(position: PortfolioPosition) {
    const updated = [...positions, position];
    setPositions(updated);
    savePortfolio(updated);
  }

  function removePosition(id: string) {
    const updated = positions.filter((p) => p.id !== id);
    setPositions(updated);
    savePortfolio(updated);
  }

  return { positions, addPosition, removePosition };
}
