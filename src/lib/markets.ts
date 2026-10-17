// Markets the app supports, and money formatting in a listing's own currency.
// Every listing carries its exchange and currency explicitly; nothing assumes USD.

import type { Market } from "./types";

export interface MarketDef {
  id: Market;
  label: string;
  /** Yahoo exchange codes that belong to this market */
  exchanges: string[];
  /** Usual trading currency; individual listings may differ (e.g. USD-quoted SGX stocks) */
  currency: string;
  /** Ticker suffix Yahoo uses for the market ("" for US) */
  suffix: string;
}

export const MARKETS: MarketDef[] = [
  { id: "US", label: "United States", exchanges: ["NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS", "NAS", "NYS"], currency: "USD", suffix: "" },
  { id: "SG", label: "Singapore", exchanges: ["SES"], currency: "SGD", suffix: ".SI" },
];

/** Other major exchanges search may return; their listings work everywhere a ticker is accepted */
export const INTERNATIONAL_EXCHANGES = ["LSE", "HKG", "TOR", "ASX", "JPX", "GER", "FRA", "PAR", "AMS", "KSC", "TAI", "NSI", "BSE"];

export const SEARCHABLE_EXCHANGES = new Set([...MARKETS.flatMap((m) => m.exchanges), ...INTERNATIONAL_EXCHANGES]);

/** Best guess at a ticker's market from its symbol; listing metadata overrides it when known */
export function marketOf(ticker: string): Market | null {
  const t = ticker.toUpperCase();
  if (t.endsWith(".SI")) return "SG";
  if (!t.includes(".") && !t.startsWith("^") && !t.includes("=")) return "US";
  return null;
}

/** Currency to assume before the provider has told us */
export function defaultCurrency(ticker: string): string {
  return MARKETS.find((m) => m.id === marketOf(ticker))?.currency ?? "USD";
}

const SYMBOLS: Record<string, string> = { USD: "$", SGD: "S$", EUR: "€", GBP: "£", JPY: "¥", HKD: "HK$", AUD: "A$", CAD: "C$" };

export const currencySymbol = (ccy: string | null | undefined) => SYMBOLS[ccy ?? "USD"] ?? `${ccy} `;

/** A price in the listing's own currency, e.g. "S$74.11" or "GBp 512.00" */
export function formatMoney(n: number | null | undefined, ccy: string | null | undefined = "USD", digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}${currencySymbol(ccy)}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Large amounts (market cap, revenue) in the listing's currency, e.g. "S$210.8B" */
export function formatBig(n: number | null | undefined, ccy: string | null | undefined = "USD"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const s = currencySymbol(ccy);
  if (abs >= 1e12) return `${sign}${s}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${s}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${s}${(abs / 1e6).toFixed(1)}M`;
  return formatMoney(n, ccy, 0);
}
