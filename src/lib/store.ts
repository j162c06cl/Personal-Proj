// User data persisted on-device in IndexedDB. Pages go through these helpers,
// never through localStorage or db.ts directly.

import { dbGet, dbSet } from "./db";
import { DEFAULT_WATCHLISTS, PORTFOLIO_PRESETS } from "./presets";
import { PortfolioPosition, Settings, WatchlistDef } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  apiKeys: { anthropic: "" },
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

export async function loadWatchlists(): Promise<WatchlistDef[]> {
  await ensureMigrated();
  return (await dbGet<WatchlistDef[]>("kv", "watchlists")) ?? DEFAULT_WATCHLISTS;
}

export function saveWatchlists(lists: WatchlistDef[]): Promise<void> {
  return dbSet("kv", "watchlists", lists);
}

// ── Settings (shared across components via a tiny subscription) ────────────

let settingsCache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  return {
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...partial?.apiKeys },
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
  version: 1;
  exportedAt: string;
  portfolio: PortfolioPosition[];
  watchlists: WatchlistDef[];
  settings: Omit<Settings, "apiKeys">;
}

// API keys are deliberately left out so a backup file is safe to keep in cloud storage.
export async function exportBackup(): Promise<Backup> {
  const [portfolio, watchlists, settings] = await Promise.all([loadPortfolio(), loadWatchlists(), loadSettings()]);
  return {
    app: "investor-research",
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolio,
    watchlists,
    settings: { baseCurrency: settings.baseCurrency, profile: settings.profile },
  };
}

export async function importBackup(raw: unknown): Promise<{ positions: number; lists: number }> {
  const b = raw as Partial<Backup>;
  if (!b || b.app !== "investor-research" || !Array.isArray(b.portfolio) || !Array.isArray(b.watchlists)) {
    throw new Error("This file isn't an Investor Research backup.");
  }
  await savePortfolio(b.portfolio);
  await saveWatchlists(b.watchlists);
  if (b.settings) {
    const current = await loadSettings();
    await saveSettings(mergeSettings({ ...b.settings, apiKeys: current.apiKeys }));
  }
  return { positions: b.portfolio.length, lists: b.watchlists.length };
}
