// Shared helpers for the browser tests.
import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

// ── Recorded chart data ─────────────────────────────────────────────────────

const FIXTURES = join(__dirname, "fixtures");
const cache = new Map<string, Buffer>();

/**
 * Serves /api/candles from e2e/fixtures (real bars recorded by record-fixtures.mjs) for the
 * tickers and timeframes recorded there. Anything else goes to the app as usual, and a test
 * can still route its own made-up tickers, since page routes run before context routes.
 */
export async function serveRecordedCandles(target: BrowserContext | Page) {
  await target.route("**/api/candles?*", async (route) => {
    const u = new URL(route.request().url());
    const key = `${u.searchParams.get("ticker")}_${u.searchParams.get("timeframe")}`;
    let body = cache.get(key);
    if (!body) {
      const file = join(FIXTURES, `${key}.json.gz`);
      if (!existsSync(file)) return route.fallback();
      body = gunzipSync(readFileSync(file));
      cache.set(key, body);
    }
    await route.fulfill({ contentType: "application/json", body });
  });
}

/** A recorded series, for tests that check the page against their own calculation */
export function recorded(ticker: string, timeframe: string): { candles: { time: number; open: number; high: number; low: number; close: number; volume: number | null }[] } {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURES, `${ticker}_${timeframe}.json.gz`))).toString("utf8"));
}

/** A second browser context (e.g. a phone) that sees the same recorded data */
export async function newContext(browser: Browser, options: BrowserContextOptions = {}) {
  const ctx = await browser.newContext(options);
  await serveRecordedCandles(ctx);
  return ctx;
}

export const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

// ── Errors ──────────────────────────────────────────────────────────────────

/** Collects page errors and console errors (404/502 responses are expected in some tests) */
export function trackErrors(page: Page, into: string[] = [], label = "") {
  page.on("pageerror", (e) => into.push(`${label}pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of (404|502)/.test(m.text())) into.push(`${label}${m.text()}`);
  });
  return into;
}

/**
 * The test function to import in specs: every context it makes serves the recorded chart
 * data, and `errors` collects the page's errors for a final check.
 */
export const test = base.extend<{ errors: string[] }>({
  context: async ({ context }, use) => {
    await serveRecordedCandles(context);
    await use(context);
  },
  errors: async ({ page }, use) => {
    await use(trackErrors(page));
  },
});
export { expect };

// ── Checks ──────────────────────────────────────────────────────────────────

/**
 * One named check. Failures are recorded and the test carries on, so a run reports every
 * failing check, not just the first.
 */
export function check(name: string, ok: unknown, detail?: unknown) {
  const d = detail === undefined || detail === null || detail === "" ? "" : `  — ${String(detail)}`;
  expect.soft(Boolean(ok), `${name}${d}`).toBe(true);
}

/** The last check in a suite: nothing went wrong in the browser along the way */
export function checkNoErrors(errors: string[]) {
  check("no page errors or unexpected console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
}

// ── Page helpers ────────────────────────────────────────────────────────────

export async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error(`No bounding box for ${l}`);
  return b;
}

/** A number from displayed text such as "$1,234.50", "−2.1%" or "3.0×" */
export const num = (s: unknown) => parseFloat(String(s).replace(/−/g, "-").replace(/[^0-9.\-]/g, ""));

/** How far the page scrolls sideways (should be 0 at any width) */
export const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Starts a fresh browser on the daily chart, with no saved settings (only on the first load) */
export async function startOnDaily(p: Page) {
  await p.addInitScript(() => {
    if (!sessionStorage.getItem("init")) {
      localStorage.clear();
      localStorage.setItem("chart_timeframe", "1d");
      sessionStorage.setItem("init", "1");
    }
  });
}

/** Opens a chart page and waits for the chart and its side panel */
export async function openChart(p: Page, ticker: string) {
  await p.goto(`/stock/${ticker}/chart`, { waitUntil: "networkidle", timeout: 120_000 });
  await p.waitForSelector("section canvas", { timeout: 60_000 });
  await p.waitForSelector("aside");
  await p.mouse.move(5, 5);
  await p.waitForTimeout(600);
}

export const chartBox = (p: Page) => p.locator("section [aria-busy] > div.relative").first();

/** The bar readout above the chart, on one line */
export const legend = async (p: Page) => (await p.locator("section .tabular-nums").first().innerText()).replace(/\s+/g, " ");

/** Reads a value from IndexedDB's key-value store, e.g. "tradePlans" */
export function stored<T = unknown>(p: Page, key: string): Promise<T | null> {
  return p.evaluate((k) => new Promise<T | null>((res) => {
    const r = indexedDB.open("investor-research");
    r.onsuccess = () => {
      const g = r.result.transaction("kv").objectStore("kv").get(k);
      g.onsuccess = () => res((g.result ?? null) as T | null);
    };
    r.onerror = () => res(null);
  }), key);
}

// ── Made-up bars for edge cases ─────────────────────────────────────────────

export interface Bar { time: number; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null }

const DAY = 86_400;
const T0 = Date.parse("2026-06-01T00:00:00Z") / 1000;

/** Bar number i, one day apart from 1 June 2026 */
export const bar = (i: number, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ time: T0 + i * DAY, open: o, high: h, low: l, close: c, volume: v });

/** Midnight UTC on a day in November 2026 */
export const novDay = (d: number) => Date.parse(`2026-11-${String(d).padStart(2, "0")}T00:00:00Z`) / 1000;

/** The /api/candles response for a made-up daily series */
export const series = (ticker: string, candles: Bar[], source = "Test") => ({
  ticker, name: `${ticker} test`, timeframe: "1d", currency: "USD", timeZone: "America/New_York",
  coverage: "Injected test data", source, asOf: new Date().toISOString(), candles,
});

/** Bars that zig-zag between 100 and 110 in 12-bar waves, so 110 becomes resistance */
export function rangeBars(count: number): Bar[] {
  const out: Bar[] = [];
  for (let n = 0; n < count; n++) {
    const ph = n % 12;
    const m = 100 + (ph <= 6 ? ph : 12 - ph) * (10 / 6);
    out.push(bar(n, m, m + 0.5, m - 0.5, m));
  }
  return out;
}

/** 60 range bars, then a close at 113 above the 110.50 resistance on 3× volume */
export const breakoutBars = (): Bar[] => [...rangeBars(60), bar(60, 101.67, 113.5, 101.67, 113, 3000)];

/** Out of order, missing and impossible values, all of which the chart must survive */
export const messyBars = (): Bar[] => [
  { time: novDay(18), open: 12, high: 13, low: 11, close: 12.5, volume: 1000 },
  { time: novDay(16), open: 10, high: 11, low: 9, close: 10.5, volume: null },     // out of order, no volume
  { time: novDay(17), open: 10.5, high: 12, low: 10, close: null, volume: 900 },   // missing close
  { time: novDay(17), open: 10.5, high: 12, low: 10, close: 11.5, volume: 900 },   // duplicate date
  { time: novDay(19), open: 12.5, high: 12, low: 14, close: 13, volume: 1200 },    // high below low
];
