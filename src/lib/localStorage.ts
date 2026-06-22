import { WatchlistEntry, PortfolioPosition } from "./types";

export function getWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem("watchlist");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(entries: WatchlistEntry[]): void {
  try {
    localStorage.setItem("watchlist", JSON.stringify(entries));
  } catch {
    console.warn("localStorage unavailable");
  }
}

export function getPortfolio(): PortfolioPosition[] {
  try {
    const raw = localStorage.getItem("portfolio");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePortfolio(positions: PortfolioPosition[]): void {
  try {
    localStorage.setItem("portfolio", JSON.stringify(positions));
  } catch {
    console.warn("localStorage unavailable");
  }
}
