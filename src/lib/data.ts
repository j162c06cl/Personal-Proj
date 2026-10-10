// The single data layer every screen calls. It:
//   • fetches through our own /api routes (which proxy the upstream providers)
//   • caches results in IndexedDB with a per-call max age
//   • de-duplicates identical in-flight requests
//   • tags every value with its source and timestamp (Sourced<T>)
//   • records per-feed health for the data status panel

import { dbClear, dbGet, dbKeys, dbSet } from "./db";
import { ChartData, ChartRange, Fundamentals, MarketIndex, QuoteData, SectorPerf, Sourced } from "./types";

interface CacheEntry<T> {
  value: T;
  source: string;
  asOf: string;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// ── Feed health ─────────────────────────────────────────────────────────────

export interface FeedStatus {
  feed: string;
  source: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  errorMessage: string | null;
}

const STATUS_KEY = "__feed_status";
let statusCache: Record<string, FeedStatus> | null = null;

async function recordStatus(feed: string, ok: boolean, detail: string) {
  statusCache ??= (await dbGet<Record<string, FeedStatus>>("cache", STATUS_KEY)) ?? {};
  const prev = statusCache[feed] ?? { feed, source: null, lastSuccess: null, lastError: null, errorMessage: null };
  const now = new Date().toISOString();
  statusCache[feed] = ok
    ? { ...prev, source: detail, lastSuccess: now }
    : { ...prev, lastError: now, errorMessage: detail };
  await dbSet("cache", STATUS_KEY, statusCache);
}

export async function getDataStatus(): Promise<{ feeds: FeedStatus[]; cacheEntries: number }> {
  statusCache ??= (await dbGet<Record<string, FeedStatus>>("cache", STATUS_KEY)) ?? {};
  const keys = await dbKeys("cache");
  return { feeds: Object.values(statusCache), cacheEntries: keys.filter((k) => k !== STATUS_KEY).length };
}

export async function clearCache(): Promise<void> {
  await dbClear("cache");
  statusCache = {};
}

// ── Generic cached fetch ────────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

function isFresh(entry: CacheEntry<unknown> | undefined, maxAgeMs: number) {
  return !!entry && Date.now() - new Date(entry.asOf).getTime() < maxAgeMs;
}

/**
 * Returns a cached value if it's younger than maxAgeMs, otherwise runs fetcher.
 * If the fetch fails, stale cache is returned (marked cached) rather than nothing.
 */
export async function cached<T>(
  feed: string,
  key: string,
  maxAgeMs: number,
  fetcher: () => Promise<{ value: T; source: string; asOf?: string }>,
  opts: { force?: boolean } = {}
): Promise<Sourced<T> | null> {
  const hit = await dbGet<CacheEntry<T>>("cache", key);
  if (!opts.force && hit && isFresh(hit, maxAgeMs)) return { ...hit, cached: true };

  if (!inflight.has(key)) {
    inflight.set(
      key,
      fetcher()
        .then(async (r) => {
          const entry: CacheEntry<T> = { value: r.value, source: r.source, asOf: r.asOf ?? new Date().toISOString() };
          await dbSet("cache", key, entry);
          recordStatus(feed, true, r.source);
          return entry;
        })
        .finally(() => inflight.delete(key))
    );
  }

  try {
    const entry = (await inflight.get(key)) as CacheEntry<T>;
    return { ...entry, cached: false };
  } catch (e) {
    recordStatus(feed, false, e instanceof Error ? e.message : "Request failed");
    return hit ? { ...hit, cached: true } : null;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.split("?")[0]} returned ${r.status}`);
  return r.json();
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export type QuoteMap = Record<string, Sourced<QuoteData>>;

/** Quotes for many tickers. Fresh ones come from cache; the rest are fetched in batches of 20. */
export async function getQuotes(
  tickers: string[],
  opts: { maxAgeMs?: number; force?: boolean } = {}
): Promise<QuoteMap> {
  const maxAge = opts.maxAgeMs ?? MINUTE;
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
  const out: QuoteMap = {};
  const stale: Record<string, CacheEntry<QuoteData>> = {};
  const toFetch: string[] = [];

  await Promise.all(
    unique.map(async (t) => {
      const hit = await dbGet<CacheEntry<QuoteData>>("cache", `quote:${t}`);
      if (!opts.force && hit && isFresh(hit, maxAge)) out[t] = { ...hit, cached: true };
      else {
        if (hit) stale[t] = hit;
        toFetch.push(t);
      }
    })
  );

  const batches: string[][] = [];
  for (let i = 0; i < toFetch.length; i += 20) batches.push(toFetch.slice(i, i + 20));

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const data = await getJson<QuoteData | QuoteData[]>(`/api/quote?ticker=${encodeURIComponent(batch.join(","))}`);
        const arr = Array.isArray(data) ? data : [data];
        for (const q of arr) {
          if (!q?.ticker) continue;
          const entry: CacheEntry<QuoteData> = {
            value: q,
            source: q.source ?? "Unknown",
            asOf: q.asOf ?? new Date().toISOString(),
          };
          if (q.price !== null) await dbSet("cache", `quote:${q.ticker}`, entry);
          out[q.ticker] = q.price === null && stale[q.ticker] ? { ...stale[q.ticker], cached: true } : { ...entry, cached: false };
        }
        const sources = Array.from(new Set(arr.map((q) => q.source).filter(Boolean)));
        recordStatus("Quotes", true, sources.join(", ") || "Unknown");
      } catch (e) {
        recordStatus("Quotes", false, e instanceof Error ? e.message : "Request failed");
        for (const t of batch) if (stale[t]) out[t] = { ...stale[t], cached: true };
      }
    })
  );

  return out;
}

export async function getQuote(ticker: string, opts: { maxAgeMs?: number; force?: boolean } = {}) {
  const map = await getQuotes([ticker], opts);
  return map[ticker.trim().toUpperCase()] ?? null;
}

// ── Market overview ─────────────────────────────────────────────────────────

export interface MarketSnapshot {
  indices: (MarketIndex & { source?: string | null })[];
  sectors: (SectorPerf & { source?: string | null })[];
}

export function getMarket(opts: { force?: boolean } = {}) {
  return cached<MarketSnapshot>(
    "Market",
    "market",
    MINUTE,
    async () => {
      const d = await getJson<MarketSnapshot & { lastUpdated: string }>("/api/market");
      const sources = Array.from(new Set([...d.indices, ...d.sectors].map((x) => x.source).filter(Boolean)));
      return { value: { indices: d.indices, sectors: d.sectors }, source: sources.join(", ") || "Unknown", asOf: d.lastUpdated };
    },
    opts
  );
}

// ── Research page: price history + fundamentals ──────────────────────────────

export function getChart(ticker: string, range: ChartRange, opts: { force?: boolean } = {}) {
  const t = ticker.trim().toUpperCase();
  return cached<ChartData>(
    "Price history",
    `chart:${t}:${range}`,
    15 * MINUTE,
    async () => {
      const d = await getJson<ChartData & { source: string; asOf: string }>(
        `/api/chart?ticker=${encodeURIComponent(t)}&range=${range}`
      );
      const { source, asOf, ...value } = d;
      return { value, source, asOf };
    },
    opts
  );
}

export function getFundamentals(ticker: string, opts: { force?: boolean } = {}) {
  const t = ticker.trim().toUpperCase();
  return cached<Fundamentals>(
    "Fundamentals",
    `fundamentals:${t}`,
    6 * 60 * MINUTE,
    async () => {
      const d = await getJson<Fundamentals & { source: string; asOf: string }>(
        `/api/fundamentals?ticker=${encodeURIComponent(t)}`
      );
      const { source, asOf, ...value } = d;
      return { value, source, asOf };
    },
    opts
  );
}

// ── FX ──────────────────────────────────────────────────────────────────────

/** USD → SGD rate. Yahoo quotes "SGD=X" as SGD per 1 USD. Cached for an hour. */
export function getUsdSgd() {
  return cached<number>("FX", "fx:USDSGD", 60 * MINUTE, async () => {
    const q = await getJson<QuoteData>("/api/quote?ticker=SGD%3DX");
    if (!q.price) throw new Error("No USD/SGD rate available");
    return { value: q.price, source: q.source ?? "Unknown", asOf: q.asOf };
  });
}
