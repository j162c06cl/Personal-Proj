// User data persisted on-device in IndexedDB. Pages go through these helpers,
// never through localStorage or db.ts directly.

import { dbGet, dbSet } from "./db";
import { DEFAULT_WATCHLISTS, PORTFOLIO_PRESETS } from "./presets";
import { PortfolioPosition, Settings, WatchIntent, WatchlistDef, WatchlistItem } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: "USD",
  profile: { strategy: "long-term", researchMinutes: 15, sectors: [] },
};

// ── One-time migration from the old localStorage keys ──────────────────────

let migration: Promise<void> | null = null;

function readLegacy<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function ensureMigrated(): Promise<void> {
  if (migration) return migration;
  migration = (async () => {
    if (await dbGet<boolean>("kv", "migrated_v1")) return;
    const portfolio = readLegacy<PortfolioPosition[]>("portfolio");
    const watchlists = readLegacy<WatchlistDef[]>("watchlists_v2");
    if (portfolio && (await dbGet("kv", "portfolio")) === undefined) await dbSet("kv", "portfolio", portfolio);
    if (watchlists && (await dbGet("kv", "watchlists")) === undefined) await dbSet("kv", "watchlists", watchlists);
    await dbSet("kv", "migrated_v1", true);
  })();
  return migration;
}

// ── Portfolio / watchlists ──────────────────────────────────────────────────

export async function loadPortfolio(): Promise<PortfolioPosition[]> {
  await ensureMigrated();
  const stored = await dbGet<PortfolioPosition[]>("kv", "portfolio");
  if (stored) return stored;
  await dbSet("kv", "portfolio", PORTFOLIO_PRESETS);
  return PORTFOLIO_PRESETS;
}

export function savePortfolio(positions: PortfolioPosition[]): Promise<void> {
  return dbSet("kv", "portfolio", positions);
}

// ── Watchlist (grouped by intent) ──────────────────────────────────────────

/** Best guess at intent from an old list's name; the user can change it per stock. */
function intentForListName(name: string): WatchIntent {
  const n = name.toLowerCase();
  if (n.includes("swing") || n.includes("trade")) return "swing";
  if (/long|core|etf|dividend|reit|income|retire/.test(n)) return "long-term";
  return "research";
}

/** Converts v2 named lists into intent-tagged items, keeping the old list name on each item. */
export function listsToItems(lists: WatchlistDef[]): WatchlistItem[] {
  const seen = new Set<string>();
  const items: WatchlistItem[] = [];
  for (const l of lists) {
    for (const t of l.tickers) {
      if (seen.has(t)) continue;
      seen.add(t);
      items.push({ ticker: t, intent: intentForListName(l.name), note: "", status: "not-started", addedAt: new Date().toISOString(), legacyList: l.name });
    }
  }
  return items;
}

export async function loadWatchlist(): Promise<WatchlistItem[]> {
  await ensureMigrated();
  const stored = await dbGet<WatchlistItem[]>("kv", "watchlist");
  if (stored) return stored;
  const legacy = await dbGet<WatchlistDef[]>("kv", "watchlists");
  const items = listsToItems(legacy ?? DEFAULT_WATCHLISTS);
  await dbSet("kv", "watchlist", items);
  return items;
}

export function saveWatchlist(items: WatchlistItem[]): Promise<void> {
  return dbSet("kv", "watchlist", items);
}

/** Adds a stock (or updates its intent/note if already there). Returns the new list. */
export async function addToWatchlist(item: Pick<WatchlistItem, "ticker" | "intent" | "note">): Promise<WatchlistItem[]> {
  const items = await loadWatchlist();
  const t = item.ticker.trim().toUpperCase();
  const existing = items.find((i) => i.ticker === t);
  const next = existing
    ? items.map((i) => (i.ticker === t ? { ...i, intent: item.intent, note: item.note || i.note } : i))
    : [...items, { ticker: t, intent: item.intent, note: item.note, status: "not-started" as const, addedAt: new Date().toISOString() }];
  await saveWatchlist(next);
  return next;
}

// ── Settings (shared across components via a tiny subscription) ────────────

let settingsCache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

// Only known fields are kept, so settings saved by older versions (e.g. an API key) are dropped on next save
function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  return {
    baseCurrency: partial?.baseCurrency ?? DEFAULT_SETTINGS.baseCurrency,
    profile: { ...DEFAULT_SETTINGS.profile, ...partial?.profile },
  };
}

export async function loadSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache;
  await ensureMigrated();
  settingsCache = mergeSettings(await dbGet<Partial<Settings>>("kv", "settings"));
  return settingsCache;
}

export async function saveSettings(next: Settings): Promise<void> {
  settingsCache = next;
  listeners.forEach((fn) => fn(next));
  await dbSet("kv", "settings", next);
}

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── Backup ──────────────────────────────────────────────────────────────────

export interface Backup {
  app: "investor-research";
  version: 2;
  exportedAt: string;
  portfolio: PortfolioPosition[];
  watchlist: WatchlistItem[];
  settings: Settings;
}

/** Version 1 backups stored named lists instead of intent-tagged items */
interface BackupV1 {
  app: "investor-research";
  version: 1;
  portfolio: PortfolioPosition[];
  watchlists: WatchlistDef[];
  settings?: Settings;
}

export async function exportBackup(): Promise<Backup> {
  const [portfolio, watchlist, settings] = await Promise.all([loadPortfolio(), loadWatchlist(), loadSettings()]);
  return {
    app: "investor-research",
    version: 2,
    exportedAt: new Date().toISOString(),
    portfolio,
    watchlist,
    settings: { baseCurrency: settings.baseCurrency, profile: settings.profile },
  };
}

export async function importBackup(raw: unknown): Promise<{ positions: number; watched: number }> {
  const b = raw as Partial<Backup> & Partial<BackupV1>;
  if (!b || b.app !== "investor-research" || !Array.isArray(b.portfolio)) {
    throw new Error("This file isn't an Investor Research backup.");
  }
  const watchlist = Array.isArray(b.watchlist) ? b.watchlist : Array.isArray(b.watchlists) ? listsToItems(b.watchlists) : null;
  if (!watchlist) throw new Error("This backup has no watchlist data.");
  await savePortfolio(b.portfolio);
  await saveWatchlist(watchlist);
  if (b.settings) await saveSettings(mergeSettings(b.settings));
  return { positions: b.portfolio.length, watched: watchlist.length };
}
