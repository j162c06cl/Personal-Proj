// The chart itself: crosshair, zoom, scrolling, timeframes, auto-refresh, broken data, phone.
import { test, check, checkNoErrors, box, chartBox, legend, newContext, overflow, PHONE, series, messyBars, novDay, recorded, trackErrors } from "./support";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const legendDate = (l: string) => l.split(" O ")[0];
async function hoverAt(page: Page, fx: number, fy = 0.4) {
  const b = await box(page.locator("section canvas").first());
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy);
  await page.waitForTimeout(150);
  return legendDate(await legend(page));
}
const latestBtn = (page: Page) => page.getByRole("button", { name: "Latest »" });
async function openChartOnly(page: Page, ticker: string) {
  await page.goto(`/stock/${ticker}/chart`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector("section canvas", { timeout: 60_000 });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(800);
}

test("crosshair, zoom, scrolling and timeframes", async ({ page, errors }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("init")) { localStorage.setItem("chart_timeframe", "1d"); sessionStorage.setItem("init", "1"); } });
  await openChartOnly(page, "AAPL");

  await test.step("crosshair", async () => {
    const latest = legendDate(await legend(page));
    const hovered = await hoverAt(page, 0.3);
    check("crosshair: legend follows the pointer", hovered !== latest, `${latest} → ${hovered}`);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(150);
    check("crosshair: legend returns to latest bar on leave", legendDate(await legend(page)) === latest);
  });

  await test.step("zoom", async () => {
    const bb = await box(page.locator("section canvas").first());
    const wheel = async (dy: number, n: number) => {
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(40); }
      await page.waitForTimeout(200);
    };
    const span = async () => (Date.parse(await hoverAt(page, 0.97)) - Date.parse(await hoverAt(page, 0.03))) / 864e5;
    const s0 = await span(); await wheel(-100, 4);
    const s1 = await span(); await wheel(100, 8);
    const s2 = await span();
    check("zoom in narrows the visible dates", s1 < s0, `${s0.toFixed(0)} → ${s1.toFixed(0)} days`);
    check("zoom out widens the visible dates", s2 > s1, `${s1.toFixed(0)} → ${s2.toFixed(0)} days`);
    await wheel(-100, 4);
    await latestBtn(page).click({ timeout: 2000 }).catch(() => {});
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
  });

  const b = await box(page.locator("section canvas").first());
  await test.step("scroll and the Latest button", async () => {
    check("Latest button hidden while at latest bar", !(await latestBtn(page).isVisible()));
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    check("drag scroll: Latest button appears", await latestBtn(page).isVisible());
    await latestBtn(page).click();
    await page.waitForTimeout(300);
    check("Latest button: returns to latest and hides", !(await latestBtn(page).isVisible()));
    await page.mouse.move(5, 5);
  });

  await test.step("can't scroll past the oldest bar", async () => {
    const firstApi = recorded("AAPL", "1d").candles[0].time;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(30); } // zoom fully out
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.85, b.y + b.height * 0.5, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(300);
    const leftmost = await hoverAt(page, 0.003);
    const firstDate = new Date(firstApi * 1000).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const gapDays = (Date.parse(leftmost) - Date.parse(firstDate)) / 864e5;
    check("left edge stops at the oldest bar", gapDays >= -1 && gapDays < 20, `oldest ${firstDate}, at left edge ${leftmost}`);
    await latestBtn(page).click({ timeout: 2000 }).catch(() => {});
  });

  await test.step("rapid timeframe switching ends on the last choice", async () => {
    await page.mouse.move(5, 5);
    for (const tf of ["4H", "1H", "15m", "5m", "1D", "1H"]) await page.getByRole("button", { name: tf, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    const pressed = await page.locator('[aria-label="Chart timeframe"] [aria-pressed=true]').innerText();
    const footer = await page.locator("section").first().innerText();
    check("rapid switching: last choice wins", pressed === "1H" && footer.includes("· 1H bars") && /PM|AM/.test(await legend(page)), `pressed ${pressed}`);
  });

  await test.step("every timeframe loads", async () => {
    for (const tf of ["1D", "4H", "1H", "15m", "5m"]) {
      await page.getByRole("button", { name: tf, exact: true }).click();
      await page.waitForFunction((t) => document.querySelector("section")?.textContent?.includes(`· ${t} bars`) && !document.querySelector("[aria-busy=true]"), tf, { timeout: 30_000 });
      const l = await legend(page);
      check(`timeframe ${tf} loads`, /O \$[\d.]+ H \$[\d.]+ L \$[\d.]+ C \$[\d.]+/.test(l), l);
    }
  });

  checkNoErrors(errors);
});

test("auto-refresh keeps the reader's place", async ({ page, errors }) => {
  await page.clock.install();
  let candleRequests = 0;
  page.on("request", (r) => { if (r.url().includes("/api/candles")) candleRequests++; });
  await page.addInitScript(() => localStorage.setItem("chart_timeframe", "5m"));
  await openChartOnly(page, "AAPL");
  const b = await box(page.locator("section canvas").first());
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.5, { steps: 6 });
  await page.mouse.up();
  const placeBefore = await hoverAt(page, 0.5);
  const before = candleRequests;
  await page.mouse.move(5, 5);
  await page.clock.runFor(61_000);
  await page.waitForTimeout(1500);
  const placeAfter = await hoverAt(page, 0.5);
  check("auto-refresh ran after a minute", candleRequests > before, `${candleRequests - before} request(s)`);
  check("auto-refresh keeps the scrolled view", placeAfter === placeBefore && (await latestBtn(page).isVisible()), `${placeBefore} → ${placeAfter}`);
  checkNoErrors(errors);
});

test("saved data is replaced by live data on the next refresh", async ({ page, errors }) => {
  await page.clock.install();
  const recov = (source: string, close: number) => series("RECOV", [16, 17, 18, 19].map((d, i) => ({ time: novDay(d), open: 10 + i, high: 11 + i, low: 9 + i, close: d === 19 ? close : 10.5 + i, volume: 1000 })), source);
  let calls = 0;
  await page.route("**/api/candles?ticker=RECOV*", (r) => { calls++; return r.fulfill({ json: calls === 1 ? recov("Saved snapshot (Yahoo Finance)", 11) : recov("Yahoo Finance", 15) }); });
  await page.addInitScript(() => localStorage.setItem("chart_timeframe", "1d"));
  await openChartOnly(page, "RECOV");
  const footer = async () => (await page.locator("section").first().innerText()).split("\n").find((l) => l.includes("1D bars")) ?? "";
  const close = async () => (await legend(page)).match(/C \$[\d.]+/)?.[0];
  check("first load shows the saved data, labelled", (await footer()).startsWith("Saved snapshot") && (await close()) === "C $11.00", `${await footer()} | ${await close()}`);
  await page.clock.runFor(61_000);
  await page.waitForTimeout(1500);
  check("after a minute the live data replaces it", (await footer()).startsWith("Yahoo Finance") && (await close()) === "C $15.00", `${await footer()} | ${await close()} | ${calls} requests`);
  checkNoErrors(errors);
});

test("broken data can't break the chart", async ({ page, errors }) => {
  await page.addInitScript(() => localStorage.setItem("chart_timeframe", "1d"));
  const zero = { time: novDay(20), open: 0, high: 0, low: 0, close: 0, volume: 0 };
  await page.route("**/api/candles?ticker=TESTX*", (r) => r.fulfill({ json: series("TESTX", [...messyBars(), zero]) }));
  await page.route("**/api/candles?ticker=ORDERX*", (r) => r.fulfill({ json: series("ORDERX", messyBars()) }));
  await page.route("**/api/candles?ticker=EMPTYX*", (r) => r.fulfill({ json: series("EMPTYX", [{ time: 1, open: null, high: null, low: null, close: null, volume: null }]) }));

  await test.step("bad bars are cleaned", async () => {
    await openChartOnly(page, "TESTX");
    const l = await legend(page);
    check("latest bar after cleaning: Nov 19, high/low swapped back, zero-price bar dropped",
      l.includes("Nov 19") && l.includes("C $13.00") && l.includes("H $14.00") && l.includes("L $12.00"), l);
    const first = await hoverAt(page, 0.86);
    check("bars sorted, oldest is Nov 16", first.includes("Nov 16"), first);
    const b = await box(page.locator("section canvas").first());
    const vols: string[] = [];
    for (const fx of [0.75, 0.8, 0.86]) {
      await page.mouse.move(b.x + b.width * fx, b.y + b.height * 0.4);
      await page.waitForTimeout(120);
      const l2 = await legend(page);
      if (l2.includes("Nov 16")) vols.push(l2.match(/Vol \S+/)?.[0] ?? "");
    }
    check("a bar with no volume says so instead of 0", vols.length > 0 && vols.every((v) => v === "Vol —"), vols.join(", "));
  });

  await test.step("bars are in date order left to right", async () => {
    await openChartOnly(page, "ORDERX");
    const b = await box(chartBox(page));
    const seen: string[] = [];
    for (let fx = 0.75; fx <= 0.95; fx += 0.005) {
      await page.mouse.move(b.x + b.width * fx, b.y + 150);
      await page.waitForTimeout(40);
      const d = legendDate(await legend(page)).trim();
      if (seen[seen.length - 1] !== d) seen.push(d);
    }
    const order = seen.map((d) => d.match(/Nov (\d+)/)?.[1]).join(",");
    check("empty area shows the latest bar (19), then bars in order 16 → 19", order === "19,16,17,18,19", order);
  });

  await test.step("no usable bars at all", async () => {
    await page.goto("/stock/EMPTYX/chart", { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(500);
    check("all bars invalid: error message, not a broken chart", await page.getByText("Couldn't load").isVisible());
  });

  await test.step("unknown ticker", async () => {
    await page.route("**/api/candles?ticker=ZZZZQQ*", (r) => r.fulfill({ status: 502, json: { error: "No price history available" } }));
    await page.goto("/stock/ZZZZQQ/chart", { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector("text=Couldn't load", { timeout: 30_000 });
    check("unknown ticker: error state with a Try again button", await page.getByRole("button", { name: "Try again" }).isVisible());
  });

  checkNoErrors(errors);
});

test("phone layout and touch", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  await p.addInitScript(() => localStorage.setItem("chart_timeframe", "1d"));
  await openChartOnly(p, "AAPL");
  check("phone: no horizontal overflow", (await overflow(p)) <= 0);
  const cb = await box(p.locator("section canvas").first());
  const cdp = await phone.newCDPSession(p);
  const x = cb.x + cb.width / 2, y0 = cb.y + cb.height * 0.7;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - i * 25 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(600);
  const scrollY = await p.evaluate(() => window.scrollY);
  check("phone: vertical swipe over chart scrolls the page", scrollY > 0, `scrollY=${scrollY}`);

  await openChartOnly(p, "D05.SI");
  check("phone: Singapore stock fits too", (await overflow(p)) <= 0);
  check("Singapore prices in S$", /S\$[\d.]+/.test(await legend(p)), await legend(p));
  await phone.close();
  checkNoErrors(errors);
});
