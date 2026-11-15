// User data persisted on-device in IndexedDB. Pages go through these helpers,
// never through localStorage or db.ts directly.

import { dbGet, dbSet } from "./db";
import { DEFAULT_WATCHLISTS, PORTFOLIO_PRESETS } from "./presets";
import { DEFAULT_BENCHMARKS, normalizeBenchmarks } from "./ratings";
import { PortfolioPosition, SavedScreen, Settings, WatchIntent, WatchTag, Watchlist, WatchlistDef, WatchlistItem } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: "USD",
  profile: { strategy: "long-term", researchMinutes: 15, sectors: [] },
  benchmarks: DEFAULT_BENCHMARKS,
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

// ── Watchlists (named lists of intent-tagged items) ─────────────────────────

/** Best guess at intent from an old list's name; the user can change it per stock. */
function intentForListName(name: string): WatchIntent {
  const n = name.toLowerCase();
  if (n.includes("swing") || n.includes("trade")) return "swing";
  if (/long|core|etf|dividend|reit|income|retire/.test(n)) return "long-term";
  return "research";
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Fills fields added since an item was saved (tag replaced the old research status). */
export function normaliseItem(i: WatchlistItem): WatchlistItem {
  const tag: WatchTag = i.tag
    ?? (i.status === "researching" ? "researching" : i.status === "done" ? "watching" : i.intent === "research" ? "researching" : "watching");
  const { status: _legacy, ...rest } = i; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, tag, note: i.note ?? "" };
}

export function newItem(ticker: string, fields: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    intent: "research",
    tag: "researching",
    note: "",
    addedAt: new Date().toISOString(),
    ...fields,
    ticker: ticker.trim().toUpperCase(),
  };
}

/** Converts v2 named lists into intent-tagged items, keeping the old list name on each item. */
export function listsToItems(lists: WatchlistDef[]): WatchlistItem[] {
  const seen = new Set<string>();
  const items: WatchlistItem[] = [];
  for (const l of lists) {
    for (const t of l.tickers) {
      if (seen.has(t)) continue;
      seen.add(t);
      items.push(newItem(t, { intent: intentForListName(l.name), tag: "watching", legacyList: l.name }));
    }
  }
  return items;
}

/** v2 named lists become real lists again, each item's intent guessed from the list name. */
export function defsToWatchlists(defs: WatchlistDef[]): Watchlist[] {
  const now = new Date().toISOString();
  return defs.map((d) => ({
    id: d.id || newId(),
    name: d.name,
    createdAt: now,
    items: Array.from(new Set(d.tickers)).map((t) => newItem(t, { intent: intentForListName(d.name), tag: "watching" })),
  }));
}

export function itemsToWatchlists(items: WatchlistItem[]): Watchlist[] {
  return [{ id: "main", name: "My watchlist", createdAt: new Date().toISOString(), items: items.map(normaliseItem) }];
}

export async function loadWatchlists(): Promise<Watchlist[]> {
  await ensureMigrated();
  const stored = await dbGet<Watchlist[]>("kv", "watchlists_v4");
  if (stored) return stored.map((l) => ({ ...l, items: l.items.map(normaliseItem) }));
  // Older saves: one flat intent-tagged list (v3), named ticker lists (v2), or nothing yet
  const flat = await dbGet<WatchlistItem[]>("kv", "watchlist");
  const defs = await dbGet<WatchlistDef[]>("kv", "watchlists");
  const lists = flat ? itemsToWatchlists(flat) : defsToWatchlists(defs ?? DEFAULT_WATCHLISTS);
  await saveWatchlists(lists);
  return lists;
}

export function saveWatchlists(lists: Watchlist[]): Promise<void> {
  return dbSet("kv", "watchlists_v4", lists);
}

/** Every watched stock across all lists, once each (first list wins), for context lookups. */
export function flattenLists(lists: Watchlist[]): WatchlistItem[] {
  const seen = new Set<string>();
  const out: WatchlistItem[] = [];
  for (const l of lists) for (const i of l.items) if (!seen.has(i.ticker)) { seen.add(i.ticker); out.push(i); }
  return out;
}

export async function loadWatchlist(): Promise<WatchlistItem[]> {
  return flattenLists(await loadWatchlists());
}

/** Adds a stock to one list (or updates it there). Returns all lists. */
export async function addToWatchlist(listId: string, item: Partial<WatchlistItem> & { ticker: string }): Promise<Watchlist[]> {
  const lists = await loadWatchlists();
  const t = item.ticker.trim().toUpperCase();
  const next = lists.map((l) => {
    if (l.id !== listId) return l;
    const existing = l.items.find((i) => i.ticker === t);
    const items = existing
      ? l.items.map((i) => (i.ticker === t ? { ...i, ...item, ticker: t, note: item.note || i.note, updatedAt: new Date().toISOString() } : i))
      : [...l.items, newItem(t, item)];
    return { ...l, items };
  });
  await saveWatchlists(next);
  return next;
}

/** Adds several stocks to one list, skipping any already on it. Returns all lists. */
export async function addManyToWatchlist(listId: string, items: (Partial<WatchlistItem> & { ticker: string })[]): Promise<Watchlist[]> {
  const lists = await loadWatchlists();
  const next = lists.map((l) => {
    if (l.id !== listId) return l;
    const have = new Set(l.items.map((i) => i.ticker));
    const added = items.filter((i) => !have.has(i.ticker.toUpperCase())).map((i) => newItem(i.ticker, i));
    return { ...l, items: [...l.items, ...added] };
  });
  await saveWatchlists(next);
  return next;
}

// ── Saved screens ───────────────────────────────────────────────────────────

/** Filters that only make sense for short-term trading */
const SWING_ONLY = ["relVolume", "change", "float"];

export async function loadScreens(): Promise<SavedScreen[]> {
  const stored = await dbGet<SavedScreen[]>("kv", "screens");
  if (stored) return stored;
  // Screener presets used to live in localStorage as { name, filters }
  const legacy = readLegacy<{ name: string; filters: Record<string, string> }[]>("screener_presets_v1") ?? [];
  const screens: SavedScreen[] = legacy.map((p) => ({
    id: newId(),
    name: p.name,
    strategy: SWING_ONLY.some((k) => p.filters[k]) ? "swing" : "long-term",
    market: "US",
    setup: null,
    filters: Object.fromEntries(Object.entries(p.filters).filter(([, v]) => v)),
    updatedAt: new Date().toISOString(),
  }));
  await saveScreens(screens);
  return screens;
}

export function saveScreens(screens: SavedScreen[]): Promise<void> {
  return dbSet("kv", "screens", screens);
}

// ── Settings (shared across components via a tiny subscription) ────────────

let settingsCache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

// Only known fields are kept, so settings saved by older versions (e.g. an API key) are dropped on next save
function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  return {
    baseCurrency: partial?.baseCurrency ?? DEFAULT_SETTINGS.baseCurrency,
    profile: { ...DEFAULT_SETTINGS.profile, ...partial?.profile },
    benchmarks: normalizeBenchmarks(partial?.benchmarks),
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

/** Backups made before the rename carry the old app id; both are accepted on import */
type BackupAppId = "the-dip" | "investor-research";
const BACKUP_APP_IDS: readonly string[] = ["the-dip", "investor-research"];

export interface Backup {
  app: BackupAppId;
  version: 3;
  exportedAt: string;
  portfolio: PortfolioPosition[];
  watchlists: Watchlist[];
  screens: SavedScreen[];
  settings: Settings;
}

/** Older backups: v1 stored named ticker lists, v2 one flat intent-tagged list */
interface OlderBackup {
  app: BackupAppId;
  version: 1 | 2;
  portfolio: PortfolioPosition[];
  watchlists?: WatchlistDef[];
  watchlist?: WatchlistItem[];
  settings?: Settings;
}

export async function exportBackup(): Promise<Backup> {
  const [portfolio, watchlists, screens, settings] = await Promise.all([loadPortfolio(), loadWatchlists(), loadScreens(), loadSettings()]);
  return {
    app: "the-dip",
    version: 3,
    exportedAt: new Date().toISOString(),
    portfolio,
    watchlists,
    screens,
    settings: { baseCurrency: settings.baseCurrency, profile: settings.profile, benchmarks: settings.benchmarks },
  };
}

/** Turns any backup version's watchlist data into lists */
export function backupLists(b: Partial<Backup> | Partial<OlderBackup>): Watchlist[] | null {
  if (b.version === 3 && Array.isArray(b.watchlists)) {
    return (b.watchlists as Watchlist[]).map((l) => ({ ...l, items: l.items.map(normaliseItem) }));
  }
  const old = b as Partial<OlderBackup>;
  if (Array.isArray(old.watchlist)) return itemsToWatchlists(old.watchlist);
  if (Array.isArray(old.watchlists)) return defsToWatchlists(old.watchlists);
  return null;
}

export async function importBackup(raw: unknown): Promise<{ positions: number; watched: number }> {
  const b = raw as Partial<Backup> | Partial<OlderBackup>;
  if (!b || !BACKUP_APP_IDS.includes(b.app as string) || !Array.isArray(b.portfolio)) {
    throw new Error("This file isn't a backup from The Dip.");
  }
  const lists = backupLists(b);
  if (!lists) throw new Error("This backup has no watchlist data.");
  await savePortfolio(b.portfolio);
  await saveWatchlists(lists);
  if (b.version === 3 && Array.isArray((b as Partial<Backup>).screens)) await saveScreens((b as Backup).screens);
  if (b.settings) await saveSettings(mergeSettings(b.settings));
  return { positions: b.portfolio.length, watched: flattenLists(lists).length };
}
