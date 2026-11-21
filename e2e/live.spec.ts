// Checks against real Yahoo Finance data (npm run test:e2e:live). These need the network and
// can fail when Yahoo is slow, blocks the request or changes its data, so they aren't part of
// the default run. Prices change daily, so they check shape and sense rather than values.
import { test, expect } from "@playwright/test";
import { check, trackErrors } from "./support";

test.use({ viewport: { width: 1440, height: 900 } });

const TIMEFRAMES = ["1d", "4h", "1h", "15m", "5m"];

for (const ticker of ["AAPL", "D05.SI"]) {
  test(`candles for ${ticker}: ordered, complete and valid on every timeframe`, async ({ request }) => {
    for (const tf of TIMEFRAMES) {
      const res = await request.get(`/api/candles?ticker=${encodeURIComponent(ticker)}&timeframe=${tf}`);
      const j = await res.json();
      const c: { time: number; open: number; high: number; low: number; close: number }[] = j.candles ?? [];
      const bad = c.filter((k, i) =>
        (i > 0 && k.time <= c[i - 1].time) ||
        ![k.open, k.high, k.low, k.close].every((p) => typeof p === "number" && p > 0) ||
        k.high < Math.max(k.open, k.close) || k.low > Math.min(k.open, k.close));
      check(`${ticker} ${tf}: strictly ascending, valid OHLC`, res.ok() && c.length > 0 && bad.length === 0, `${c.length} bars, ${bad.length} bad, source ${j.source}`);
      check(`${ticker} ${tf}: from Yahoo, not the saved snapshot`, j.source === "Yahoo Finance", j.source);
    }
  });
}

test("purchase-price lookup against Yahoo", async ({ request }) => {
  const dbs = await (await request.get("/api/historical?ticker=D05.SI&from=2024-06-01")).json();
  check("Singapore: next trading day, in SGD", dbs.actualDate === "2024-06-03" && dbs.currency === "SGD" && dbs.closingPrice > 0, JSON.stringify(dbs));
  const aapl = await (await request.get("/api/historical?ticker=AAPL&from=2025-03-01")).json();
  check("US weekend date moves to Monday", aapl.actualDate === "2025-03-03" && aapl.currency === "USD" && aapl.closingPrice > 0, JSON.stringify(aapl));
  const unknown = await request.get("/api/historical?ticker=NOSUCHTICKERX&from=2025-03-03");
  check("unknown ticker: 404 with a clear message", unknown.status() === 404 && /doesn't recognise/.test((await unknown.json()).error), unknown.status());
  const early = await request.get("/api/historical?ticker=AAPL&from=1975-01-02");
  check("before listing: 404 saying so", early.status() === 404 && /before it was listed/.test((await early.json()).error), early.status());
});

test("the chart opens on live data", async ({ page }) => {
  const errors = trackErrors(page);
  for (const ticker of ["AAPL", "D05.SI"]) {
    await page.goto(`/stock/${ticker}/chart`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector("section canvas", { timeout: 60_000 });
    const footer = await page.locator("section").first().innerText();
    check(`${ticker}: chart drawn from Yahoo Finance`, footer.includes("Yahoo Finance") && !footer.includes("Saved snapshot"), footer.split("\n").slice(-2).join(" | "));
  }
  await page.goto("/stock/AAPL", { waitUntil: "networkidle", timeout: 120_000 });
  check("research page links to the full chart", (await page.getByRole("link", { name: "Full chart →" }).getAttribute("href")) === "/stock/AAPL/chart");
  expect.soft(errors, "no page errors").toEqual([]);
});
