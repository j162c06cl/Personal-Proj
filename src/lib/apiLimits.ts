// What the app's API routes accept. Each route checks its inputs with these before asking a
// data provider, so a malformed or oversized request gets a 400 instead of upstream calls.
import { isValidTicker } from "@/lib/marketData/types";

/** Most tickers one /api/quote request takes. lib/data.ts asks in batches of this size. */
export const MAX_QUOTE_TICKERS = 20;
/** Longest search text: enough for any company name or ticker */
export const MAX_SEARCH_LENGTH = 50;
/** Longest company name the news route takes */
export const MAX_NAME_LENGTH = 200;

/** A ticker from a query parameter, trimmed and upper-cased, or null if missing or malformed */
export function readTicker(raw: string | null | undefined): string | null {
  const t = raw?.trim().toUpperCase() ?? "";
  return isValidTicker(t) ? t : null;
}

/**
 * The comma-separated tickers of a quote request, in the order given. A malformed entry is
 * kept as-is for the route to answer "Not found", so one bad watchlist entry doesn't fail the
 * whole batch; only a missing list or one over the limit is an error.
 */
export function readTickerList(raw: string | null | undefined): { tickers: string[] } | { error: string } {
  const tickers = (raw ?? "").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (!tickers.length) return { error: "A ticker is required." };
  if (tickers.length > MAX_QUOTE_TICKERS) return { error: `At most ${MAX_QUOTE_TICKERS} tickers per request.` };
  return { tickers };
}
