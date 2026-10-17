// Watchlist groups: every stock files itself under its sector, and funds under "ETFs".
import { normaliseSector } from "./rules";
import { SCREENER_UNIVERSE, SG_UNIVERSE } from "./screenerUniverse";

/** Display order of watchlist groups; anything unrecognised goes under "Other" */
export const CATEGORY_ORDER = [
  "ETFs", "Technology", "Communication", "Consumer Disc.", "Consumer Staples", "Healthcare",
  "Financials", "Energy", "Industrials", "Materials", "Real Estate", "Utilities", "Other",
];

const FUND_TYPES = new Set(["ETF", "MUTUALFUND"]);

/**
 * Category from what the provider says about the security. Returns null when there isn't
 * enough to decide yet (e.g. fundamentals not loaded), so callers can fall back or wait.
 */
export function categoryFrom(info: { quoteType?: string | null; sector?: string | null }): string | null {
  if (info.quoteType && FUND_TYPES.has(info.quoteType.toUpperCase())) return "ETFs";
  const sector = normaliseSector(info.sector);
  if (sector) return CATEGORY_ORDER.includes(sector) ? sector : "Other";
  return info.quoteType ? "Other" : null;
}

/** Instant guess for well-known tickers, so most rows are grouped before any lookup */
export function knownCategory(ticker: string): string | null {
  const s = SCREENER_UNIVERSE.find((u) => u.ticker === ticker) ?? SG_UNIVERSE.find((u) => u.ticker === ticker);
  if (!s) return null;
  return s.type === "ETF" ? "ETFs" : s.sector;
}
