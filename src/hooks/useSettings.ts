"use client";

import { useEffect, useState } from "react";
import { Settings, Sourced } from "@/lib/types";
import { loadSettings, saveSettings, subscribeSettings } from "@/lib/store";
import { getUsdSgd } from "@/lib/data";
import { formatCurrency } from "@/lib/formatters";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
    return subscribeSettings(setSettings);
  }, []);

  return { settings, saveSettings };
}

/**
 * Converts USD amounts into the user's base currency. Until the FX rate has
 * loaded (or if it can't be fetched) amounts stay in USD and are labelled US$.
 */
export function useMoney() {
  const { settings } = useSettings();
  const [fx, setFx] = useState<Sourced<number> | null>(null);
  const wantSgd = settings?.baseCurrency === "SGD";

  useEffect(() => {
    if (wantSgd && !fx) getUsdSgd().then(setFx);
  }, [wantSgd, fx]);

  const currency = wantSgd && fx ? "SGD" : "USD";
  const rate = currency === "SGD" && fx ? fx.value : 1;

  return {
    currency,
    fx: currency === "SGD" ? fx : null,
    convert: (usd: number | null) => (usd === null ? null : usd * rate),
    fmt: (usd: number | null) => formatCurrency(usd === null ? null : usd * rate, currency),
  };
}
