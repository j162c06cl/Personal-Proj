// Records real chart bars from a running copy of the app into e2e/fixtures, so the browser
// tests run on fixed data: results don't change as prices move, and no network is needed.
//
//   npm run dev                       (in another terminal)
//   npm run test:e2e:record           (or: node e2e/record-fixtures.mjs http://localhost:3000)
//
// Re-recording changes the bars the tests see; run the suite afterwards and update any
// expectation that depended on the old bars.

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3000";
const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** What the tests open: AAPL on every timeframe, plus one daily chart each for MSFT and DBS */
const WANTED = [
  ...["1d", "4h", "1h", "15m", "5m"].map((tf) => ["AAPL", tf]),
  ["MSFT", "1d"],
  ["D05.SI", "1d"],
];

mkdirSync(dir, { recursive: true });
for (const [ticker, tf] of WANTED) {
  const res = await fetch(`${base}/api/candles?ticker=${encodeURIComponent(ticker)}&timeframe=${tf}`);
  const body = await res.json();
  const bars = body.candles ?? [];
  // Only record live data: a saved-snapshot fallback or an error would make poor fixtures
  if (!res.ok || !bars.length || String(body.source).includes("Saved snapshot")) {
    console.error(`✗ ${ticker} ${tf}: ${body.error ?? body.source ?? res.status}. Nothing written.`);
    process.exitCode = 1;
    continue;
  }
  const file = join(dir, `${ticker}_${tf}.json.gz`);
  writeFileSync(file, gzipSync(JSON.stringify(body), { level: 9 }));
  const range = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");
  console.log(`✓ ${ticker} ${tf}: ${bars.length} bars, ${range(bars[0].time)} → ${range(bars.at(-1).time)}`);
}
