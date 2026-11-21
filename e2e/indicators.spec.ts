// Indicators: menu, values against an independent calculation, panels, persistence, short history, phone.
import { test, check, checkNoErrors, box, chartBox, newContext, num, overflow, PHONE, recorded, series, novDay, trackErrors } from "./support";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });

const legendText = async (p: Page) => (await p.locator("section [aria-busy]").first().locator("div.mb-2").innerText()).replace(/\s+/g, " ");
const menuBtn = (p: Page) => p.getByRole("button", { name: /^Indicators/ });
const menu = (p: Page) => p.locator("div.absolute.z-30");
const height = async (p: Page) => Math.round((await box(chartBox(p))).height);
async function setIndicator(p: Page, label: string, on: boolean) {
  if (!(await p.getByRole("checkbox", { name: new RegExp("^" + label) }).isVisible().catch(() => false))) await menuBtn(p).click();
  const cb = p.locator("label", { hasText: label }).first().locator("input[type=checkbox]");
  if ((await cb.isChecked()) !== on) await cb.click();
}
const value = (l: string, label: string) => l.match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " (\\S+)"))?.[1] ?? null;
async function openChart(p: Page, ticker: string) {
  await p.goto(`/stock/${ticker}/chart`, { waitUntil: "networkidle", timeout: 120_000 });
  await p.waitForSelector("section canvas");
  await p.mouse.move(5, 5);
  await p.waitForTimeout(600);
}

test("indicator menu, values, panels and persistence", async ({ page, errors }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("init")) { localStorage.clear(); localStorage.setItem("chart_timeframe", "1d"); sessionStorage.setItem("init", "1"); } });
  await openChart(page, "AAPL");

  const { candles } = recorded("AAPL", "1d");
  const closes = candles.map((c) => c.close), vols = candles.map((c) => c.volume ?? 0);
  const n = closes.length;
  const smaAt = (k: number) => closes.slice(n - k).reduce((a, b) => a + b, 0) / k;

  let l = await legendText(page);
  await test.step("defaults", async () => {
    check("defaults: SMA 50 and SMA 200 shown", /SMA 50 \$/.test(l) && /SMA 200 \$/.test(l) && !/RSI/.test(l), l.slice(l.indexOf("SMA")));
    check("defaults: price panel only (480px)", (await height(page)) === 480);
    check("SMA 50 matches an independent calculation", Math.abs(num(value(l, "SMA 50")) - smaAt(50)) < 0.006, `${value(l, "SMA 50")} vs ${smaAt(50).toFixed(3)}`);
    check("SMA 200 matches an independent calculation", Math.abs(num(value(l, "SMA 200")) - smaAt(200)) < 0.006, `${value(l, "SMA 200")} vs ${smaAt(200).toFixed(3)}`);
  });

  await test.step("menu", async () => {
    await menuBtn(page).click();
    const m = (await menu(page).innerText()).toUpperCase();
    check("menu lists all 10 indicators in 3 groups", ["MOVING AVERAGES", "VOLUME", "MOMENTUM", "SMA 20", "SMA 50", "SMA 200", "EMA 9", "EMA 21", "VWAP", "AVERAGE VOLUME", "RELATIVE VOLUME", "RSI 14", "MACD 12, 26, 9"].every((s) => m.includes(s)));
    check("menu explains VWAP is intraday-only on 1D", m.includes("INTRADAY TIMEFRAMES ONLY"));
    await page.keyboard.press("Escape");
    check("menu closes on Escape", !(await menu(page).isVisible()));
    for (const name of ["SMA 20", "EMA 9", "EMA 21", "VWAP", "Average volume", "Relative volume", "RSI 14", "MACD"]) await setIndicator(page, name, true);
    await page.mouse.click(5, 5);
    check("menu closes on outside click", !(await menu(page).isVisible()));
    check("menu badge counts 10 on", (await menuBtn(page).innerText()).includes("10"));
  });

  await test.step("all indicators on the daily chart", async () => {
    await page.waitForTimeout(600);
    l = await legendText(page);
    check("all on (1D): RSI + MACD panels → 740px", (await height(page)) === 740);
    check("1D: VWAP left out of the readout", !/VWAP/.test(l));
    const rsiV = num(value(l, "RSI 14"));
    check("RSI value within 0–100", rsiV >= 0 && rsiV <= 100, rsiV);
    const rvol = vols[n - 1] / (vols.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20);
    check("relative volume matches (vs previous 20 sessions)", value(l, "Relative volume") === `${rvol.toFixed(1)}×`, `${value(l, "Relative volume")} vs ${rvol.toFixed(2)}×`);
    const avg20 = vols.slice(n - 20).reduce((a, b) => a + b, 0) / 20;
    check("average volume matches", value(l, "Average volume") === `${(avg20 / 1e6).toFixed(2)}M` || Math.abs(num(value(l, "Average volume")) - avg20 / 1e6) < 0.06, `${value(l, "Average volume")} vs ${(avg20 / 1e6).toFixed(2)}M`);
    check("MACD shows line, signal and histogram", /MACD 12, 26, 9 -?[\d.]+ Signal -?[\d.]+ Hist -?[\d.]+/.test(l));

    const b = await box(chartBox(page));
    await page.mouse.move(b.x + b.width * 0.4, b.y + 200);
    await page.waitForTimeout(200);
    const lh = await legendText(page);
    check("hover updates indicator values", value(lh, "SMA 50") !== value(l, "SMA 50") && value(lh, "RSI 14") !== value(l, "RSI 14"));
    await page.mouse.move(b.x + b.width * 0.6, b.y + 480 + 60);
    await page.waitForTimeout(200);
    check("hovering the RSI panel updates the readout", (await legendText(page)) !== lh);
    await page.mouse.move(5, 5);
  });

  await test.step("intraday", async () => {
    await page.getByRole("button", { name: "5m", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("section")?.textContent?.includes("· 5m bars") && !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 });
    await page.waitForTimeout(600);
    l = await legendText(page);
    check("5m: VWAP in the readout", /VWAP \$[\d.]+/.test(l), value(l, "VWAP") ?? "missing");
    check("5m: relative volume uses the time-of-day baseline", /Relative volume [\d.]+×/.test(l), value(l, "Relative volume"));
  });

  await test.step("removing panels in either order", async () => {
    await setIndicator(page, "RSI 14", false);
    await page.waitForTimeout(400);
    check("RSI off: MACD panel remains → 610px", (await height(page)) === 610 && !/RSI/.test(await legendText(page)));
    await setIndicator(page, "RSI 14", true);
    await setIndicator(page, "MACD", false);
    await page.waitForTimeout(400);
    check("MACD off, RSI back: 610px", (await height(page)) === 610);
    await setIndicator(page, "RSI 14", false);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    check("no panels: back to 480px", (await height(page)) === 480);
  });

  await test.step("choices remembered", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("section canvas");
    await page.mouse.move(5, 5);
    await page.waitForTimeout(600);
    l = await legendText(page);
    const badge = (await menuBtn(page).innerText()).replace(/\s+/g, " ");
    check("choices remembered after reload", /SMA 20/.test(l) && /EMA 9/.test(l) && /VWAP/.test(l) && !/RSI/.test(l) && badge.includes("8"), badge);
  });

  await test.step("short history", async () => {
    await page.route("**/api/candles?ticker=SHORTX*", (r) => r.fulfill({ json: series("SHORTX", [
      { time: novDay(18), open: 12, high: 13, low: 11, close: 12.5, volume: 1000 },
      { time: novDay(16), open: 10, high: 11, low: 9, close: 10.5, volume: null },
      { time: novDay(17), open: 10.5, high: 12, low: 10, close: null, volume: 900 },
      { time: novDay(19), open: 12.5, high: 12, low: 14, close: 13, volume: 1200 },
    ]) }));
    await page.evaluate(() => { localStorage.setItem("chart_timeframe", "1d"); localStorage.setItem("chart_indicators", JSON.stringify(["sma20", "sma200", "rsi", "macd", "avgVolume", "relVolume", "bogus"])); });
    await openChart(page, "SHORTX");
    l = await legendText(page);
    check("short history: indicators show — instead of breaking", /SMA 20 —/.test(l) && /SMA 200 —/.test(l) && /RSI 14 —/.test(l) && /Relative volume —/.test(l), l.slice(l.indexOf("SMA")));
    check("an unknown saved indicator id is ignored", (await menuBtn(page).innerText()).includes("6"));
  });

  checkNoErrors(errors);
});

test("indicators on a phone", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  await p.addInitScript(() => { localStorage.setItem("chart_timeframe", "1d"); localStorage.setItem("chart_indicators", JSON.stringify(["sma50", "sma200", "rsi", "macd", "relVolume"])); });
  await openChart(p, "D05.SI");
  await p.waitForTimeout(300);
  check("phone: price panel 340px + 2 panels = 600px", (await height(p)) === 600);
  await menuBtn(p).tap();
  await p.waitForTimeout(300);
  const mb = await box(menu(p));
  check("phone: menu fits on screen", mb.x >= 0 && mb.x + mb.width <= 390, `x ${Math.round(mb.x)}–${Math.round(mb.x + mb.width)}`);
  check("phone: no horizontal overflow", (await overflow(p)) <= 0);
  await phone.close();
  checkNoErrors(errors);
});
