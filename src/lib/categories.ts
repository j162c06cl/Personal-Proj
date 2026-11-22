// Watchlist groups: every stock files itself under its sector, and funds under "ETFs".
import { normaliseSector } from "./rules";
import { SCREENER_UNIVERSE, SG_UNIVERSE } from "./screenerUniverse";

/** Display order of watchlist groups; anything unrecognised goes under "Other" */
export const CATEGORY_ORDER = [
  "ETFs", "Technology", "Communication", "Consumer Disc.", "Consumer Staples", "Healthcare",
  "Financials", "Energy", "Industrials", "Materials", "Real Estate", "Utilities", "Other",
];

/**
 * A colour per group, for the watchlist's badges and sector tags: a pale background with darker
 * text of the same hue. Plain green and red are left out, since they mean up and down.
 */
const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  "ETFs": { bg: "#EEF2F6", fg: "#334155" },
  "Technology": { bg: "#EAF2FF", fg: "#1D4ED8" },
  "Communication": { bg: "#F3EEFF", fg: "#6D28D9" },
  "Consumer Disc.": { bg: "#FFF1E7", fg: "#C2410C" },
  "Consumer Staples": { bg: "#E6F7F5", fg: "#0F766E" },
  "Healthcare": { bg: "#FDEEF6", fg: "#BE185D" },
  "Financials": { bg: "#EEF0FF", fg: "#4338CA" },
  "Energy": { bg: "#FEF9E7", fg: "#A16207" },
  "Industrials": { bg: "#F4F1EE", fg: "#57534E" },
  "Materials": { bg: "#E6F6FB", fg: "#0E7490" },
  "Real Estate": { bg: "#FAEEFC", fg: "#A21CAF" },
  "Utilities": { bg: "#E8F4FD", fg: "#0369A1" },
};
const NEUTRAL = { bg: "#F0F0F0", fg: "#525252" };

/** Badge and tag colours for a group; grey for "Other" or a stock not grouped yet */
export const categoryColor = (category: string | null | undefined) => (category && CATEGORY_COLORS[category]) || NEUTRAL;

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
