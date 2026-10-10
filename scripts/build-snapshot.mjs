// Captures a snapshot of live market data from the running app's own API routes,
// so a deployed demo still works if the live data provider is blocked or down.
//
// Usage: start the app (`npm run dev`), then run `npm run snapshot`.
// Writes JSON files to src/data/snapshot/. Commit them to ship the snapshot.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SNAPSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "snapshot");

// Stocks that get full research-page data (chart, fundamentals, news)
export const SHOWCASE = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "VOO", "SCHD"];

// Every ticker the app shows by default: heatmap universe, default watchlists, sample portfolio, FX
async function defaultTickers() {
  const src = (f) => readFile(join(OUT, "..", "..", "lib", f), "utf8");
  const found = new Set(SHOWCASE);
  for (const f of ["screenerUniverse.ts", "presets.ts"]) {
    for (const m of (await src(f)).matchAll(/ticker:\s*"([A-Z0-9.\-^=]+)"/g)) found.add(m[1]);
    for (const m of (await src(f)).matchAll(/tickers:\s*\[([^\]]*)\]/g)) {
      for (const t of m[1].matchAll(/"([A-Z0-9.\-]+)"/g)) found.add(t[1]);
    }
  }
  found.add("SGD=X");
  return [...found].sort();
}

const isLive = (d) => d && !d.error && !String(d.source ?? "").startsWith("Saved snapshot");

async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function readExisting(name) {
  try { return JSON.parse(await readFile(join(OUT, name), "utf8")); } catch { return {}; }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const tickers = await defaultTickers();
  const failures = [];

  // Quotes, in batches like the app does
  const quotes = await readExisting("quotes.json");
  for (let i = 0; i < tickers.length; i += 20) {
    const batch = tickers.slice(i, i + 20);
    const data = await get(`/api/quote?ticker=${encodeURIComponent(batch.join(","))}`);
    for (const q of Array.isArray(data) ? data : [data]) {
      if (isLive(q) && q.price !== null) quotes[q.ticker] = q;
      else failures.push(`quote ${q.ticker}`);
    }
  }
  console.log(`quotes: ${Object.keys(quotes).length}`);

  const market = await get("/api/market");
  const marketOk = market.indices?.some((x) => x.price !== null);
  if (!marketOk) failures.push("market");

  const charts = await readExisting("charts.json");
  const fundamentals = await readExisting("fundamentals.json");
  const news = await readExisting("news.json");
  for (const t of SHOWCASE) {
    charts[t] ??= {};
    for (const range of ["2y", "5y"]) {
      try {
        const c = await get(`/api/chart?ticker=${t}&range=${range}`);
        if (isLive(c)) charts[t][range] = c; else failures.push(`chart ${t} ${range}`);
      } catch { failures.push(`chart ${t} ${range}`); }
    }
    try {
      const f = await get(`/api/fundamentals?ticker=${t}`);
      if (isLive(f)) fundamentals[t] = f; else failures.push(`fundamentals ${t}`);
      const n = await get(`/api/news?ticker=${t}&name=${encodeURIComponent(f.name ?? "")}`);
      if (isLive(n)) news[t] = n; else failures.push(`news ${t}`);
    } catch { failures.push(`fundamentals/news ${t}`); }
    console.log(`research data: ${t}`);
  }

  // Yahoo returns float noise like 229.27999877929688; 4 decimals is plenty and halves file size
  const round = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);
  const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data, round));
  await write("quotes.json", quotes);
  if (marketOk) await write("market.json", market);
  await write("charts.json", charts);
  await write("fundamentals.json", fundamentals);
  await write("news.json", news);
  await writeFile(join(OUT, "meta.json"), JSON.stringify({ createdAt: new Date().toISOString(), showcase: SHOWCASE }, null, 2));

  console.log(failures.length ? `Done with ${failures.length} gaps: ${failures.join(", ")}` : "Done, no gaps.");
}

main().catch((e) => { console.error(e); process.exit(1); });
