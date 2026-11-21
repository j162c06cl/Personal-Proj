// Levels, trend and drawings: detected levels, level/trendline/note tools, editing, saving,
// other timeframes and tickers, backup and restore, deleting, short history, phone.
import { test, check, checkNoErrors, box, chartBox, newContext, openChart, overflow, PHONE, series, novDay, startOnDaily, stored, trackErrors } from "./support";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });

const levelsCard = (p: Page) => p.locator("aside section", { hasText: "Support & resistance" });
const drawCard = (p: Page) => p.locator("aside section", { hasText: "Trendlines & notes" });
const tool = (p: Page, name: string) => p.getByRole("group", { name: "Drawing tools" }).getByRole("button", { name, exact: true });
const yours = async (p: Page) => (await levelsCard(p).innerText()).match(/Yours/g)?.length ?? 0;
const hint = (p: Page) => p.locator("p[role=status]");
async function clickChart(p: Page, fx: number, dy: number) {
  const b = await box(chartBox(p));
  await p.mouse.click(b.x + b.width * fx, b.y + dy);
  await p.waitForTimeout(250);
}
type Drawings = Record<string, { levels: unknown[]; trendlines: unknown[]; notes: unknown[] }>;

test("levels, trendlines and notes", async ({ page, errors }, testInfo) => {
  await startOnDaily(page);
  await openChart(page, "AAPL");

  await test.step("detected levels and trend", async () => {
    const lv = await levelsCard(page).innerText();
    check("detected levels listed with touch counts", /Detected · \d+ touches/.test(lv), (lv.match(/Detected · \d+ touches/g) || []).join(", "));
    check("trend card shows a verdict and both reads", /Trend[\s\S]*(Uptrend|Downtrend|Mixed)[\s\S]*Moving averages[\s\S]*Swing structure/.test(await page.locator("aside").innerText()));
    check("no drawings yet", (await yours(page)) === 0 && /Nothing drawn on the 1D chart/.test(await drawCard(page).innerText()));
    await clickChart(page, 0.5, 200);
    check("click without a tool adds nothing", (await yours(page)) === 0);
  });

  await test.step("level tool, editing, adding by price", async () => {
    await tool(page, "Level").click();
    check("Level tool pressed + hint shown", (await tool(page, "Level").getAttribute("aria-pressed")) === "true" && /price for your level/.test(await hint(page).innerText()));
    await clickChart(page, 0.5, 200);
    check("click places a level", (await yours(page)) === 1);
    check("tool put away after placing", (await tool(page, "Level").getAttribute("aria-pressed")) === "false" && !(await hint(page).count()));

    await levelsCard(page).getByRole("button", { name: /^Edit level/ }).click();
    await levelsCard(page).getByLabel("Level price").fill("300.5");
    await levelsCard(page).getByLabel("Level label").fill("Breakout base");
    await levelsCard(page).getByRole("button", { name: "Save" }).click();
    let lv = await levelsCard(page).innerText();
    check("edited level shows new price and label", /\$300\.50/.test(lv) && /Breakout base/.test(lv));

    await levelsCard(page).getByRole("button", { name: "+ Add a level by price" }).click();
    await levelsCard(page).getByLabel("Level price").fill("400");
    await levelsCard(page).getByLabel("Level label").fill("Target");
    await levelsCard(page).getByRole("button", { name: "Add" }).click();
    lv = await levelsCard(page).innerText();
    check("level added by price, above the close = resistance", (await yours(page)) === 2 && /R\s*\n?\s*\$400\.00/.test(lv));
    await levelsCard(page).getByRole("button", { name: "+ Add a level by price" }).click();
    await levelsCard(page).getByLabel("Level price").fill("-5");
    check("negative price can't be added", await levelsCard(page).getByRole("button", { name: "Add" }).isDisabled());
    await levelsCard(page).getByRole("button", { name: "Cancel" }).click();

    await levelsCard(page).getByRole("button", { name: "Edit level $400.00" }).click();
    await levelsCard(page).getByLabel("Level label").fill("Tgt typed");
    const b0 = await box(chartBox(page));
    for (let i = 0; i < 5; i++) await page.mouse.move(b0.x + b0.width * (0.3 + i * 0.1), b0.y + 200);
    check("hovering the chart doesn't wipe a half-typed edit", (await levelsCard(page).getByLabel("Level label").inputValue()) === "Tgt typed");
    await levelsCard(page).getByRole("button", { name: "Cancel" }).click();
  });

  await test.step("trendline tool", async () => {
    await tool(page, "Trendline").click();
    check("trendline hint: start", /where the line starts/.test(await hint(page).innerText()));
    await clickChart(page, 0.3, 300);
    check("trendline hint: end", /where the line ends/.test(await hint(page).innerText()));
    await clickChart(page, 0.3, 300);
    check("same bar twice doesn't make a line", /where the line ends/.test(await hint(page).innerText()) && /Nothing drawn/.test(await drawCard(page).innerText()));
    await clickChart(page, 0.7, 150);
    const dc = await drawCard(page).innerText();
    check("second click draws a trendline", /→/.test(dc) && /\d+ bars/.test(dc), dc.split("\n").slice(1, 4).join(" | "));
    await tool(page, "Trendline").click();
    await clickChart(page, 0.2, 250);
    await page.keyboard.press("Escape");
    await clickChart(page, 0.4, 250);
    check("Esc cancels a half-drawn trendline", !(await hint(page).count()) && ((await drawCard(page).innerText()).match(/→/g) || []).length === 1);
  });

  await test.step("note tool", async () => {
    await tool(page, "Note").click();
    await clickChart(page, 0.5, 250);
    const form = page.locator("form", { has: page.locator("#new-note") });
    check("note form opens for the clicked bar", /Note for [A-Z][a-z]{2} \d+, \d{4}/.test(await form.innerText()));
    check("empty note can't be saved", await form.getByRole("button", { name: "Save" }).isDisabled());
    await page.locator("#new-note").fill("Earnings gap up");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    check("note saved and listed", /Earnings gap up/.test(await drawCard(page).innerText()) && !(await form.count()));
    await drawCard(page).getByRole("button", { name: "Edit note" }).click();
    await drawCard(page).getByLabel("Note text").fill("Earnings gap up, held the open");
    await drawCard(page).getByRole("button", { name: "Save" }).click();
    check("note edited", /held the open/.test(await drawCard(page).innerText()));
  });

  await test.step("saved, other timeframes, other tickers", async () => {
    const s = await stored<Drawings>(page, "chartAnnotations");
    check("saved to IndexedDB", s?.AAPL?.levels?.length === 2 && s.AAPL.trendlines.length === 1 && s.AAPL.notes.length === 1, JSON.stringify(s?.AAPL ?? s).slice(0, 160));
    await openChart(page, "AAPL");
    check("drawings still there after reload", (await yours(page)) === 2 && /→/.test(await drawCard(page).innerText()) && /held the open/.test(await drawCard(page).innerText()));

    await page.getByRole("button", { name: "1H", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("aside")?.textContent?.includes("1H chart"), null, { timeout: 60_000 });
    await page.waitForTimeout(500);
    const dc = await drawCard(page).innerText();
    check("1H: your levels still shown", (await yours(page)) === 2);
    check("1H: trendline and note stay on 1D", /Nothing drawn on the 1H chart/.test(dc) && /Also drawn on other timeframes: 1D \(2\)/.test(dc), dc.replace(/\n/g, " | "));
    check("1H: trend card labelled for 1H bars", /1H bars/.test(await page.locator("aside").innerText()));
    await page.getByRole("button", { name: "1D", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("aside")?.textContent?.includes("1D chart"), null, { timeout: 60_000 });

    await levelsCard(page).getByRole("checkbox").uncheck();
    check("detected levels hidden when switched off", !/Detected ·/.test(await levelsCard(page).innerText()) && (await yours(page)) === 2);
    await openChart(page, "AAPL");
    check("switch remembered after reload", !(await levelsCard(page).getByRole("checkbox").isChecked()));
    await levelsCard(page).getByRole("checkbox").check();

    await openChart(page, "MSFT");
    check("another ticker has its own (empty) drawings", (await yours(page)) === 0 && /Nothing drawn/.test(await drawCard(page).innerText()));
  });

  await test.step("backup and restore", async () => {
    await page.goto("/settings", { waitUntil: "networkidle" });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
    const file = testInfo.outputPath("backup.json");
    await dl.saveAs(file);
    const backup = JSON.parse(readFileSync(file, "utf8"));
    check("backup includes chart drawings", backup.chartAnnotations?.AAPL?.levels?.length === 2, Object.keys(backup.chartAnnotations ?? {}).join(","));
    check("export message mentions drawings", /drawings on 1 chart/.test(await page.locator("body").innerText()));

    const older = { ...backup };
    delete older.chartAnnotations;
    await page.locator("input[type=file]").setInputFiles({ name: "older.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(older)) });
    await page.waitForTimeout(800);
    check("an older backup without drawings keeps the current ones", (await stored<Drawings>(page, "chartAnnotations"))?.AAPL?.levels?.length === 2);

    const edited = { ...backup, chartAnnotations: { AAPL: { ...backup.chartAnnotations.AAPL, levels: backup.chartAnnotations.AAPL.levels.slice(0, 1) } } };
    await page.locator("input[type=file]").setInputFiles({ name: "edited.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(edited)) });
    await page.waitForTimeout(800);
    check("importing a backup restores its drawings", (await stored<Drawings>(page, "chartAnnotations"))?.AAPL?.levels?.length === 1);
  });

  await test.step("deleting", async () => {
    await openChart(page, "AAPL");
    await drawCard(page).getByRole("button", { name: /^Delete trendline/ }).click();
    await drawCard(page).getByRole("button", { name: "Delete note" }).click();
    await levelsCard(page).getByRole("button", { name: /^Delete level/ }).click();
    await page.waitForTimeout(300);
    check("everything deleted", (await yours(page)) === 0 && /Nothing drawn/.test(await drawCard(page).innerText()));
    const s = await stored<Drawings>(page, "chartAnnotations");
    check("deletes saved (ticker entry removed when empty)", !!s && !s.AAPL, JSON.stringify(s));
  });

  await test.step("clicks on the RSI panel", async () => {
    await page.evaluate(() => localStorage.setItem("chart_indicators", JSON.stringify(["rsi"])));
    await openChart(page, "AAPL");
    await tool(page, "Level").click();
    await clickChart(page, 0.5, 480 + 60);
    check("click on the RSI panel places nothing", (await yours(page)) === 0 && (await tool(page, "Level").getAttribute("aria-pressed")) === "true");
    await page.keyboard.press("Escape");
  });

  await test.step("short history", async () => {
    await page.route("**/api/candles?ticker=SHORTX*", (r) => r.fulfill({ json: series("SHORTX", [16, 17, 18, 19].map((d, i) => ({ time: novDay(d), open: 10 + i, high: 11 + i, low: 9 + i, close: 10.5 + i, volume: 1000 }))) }));
    await openChart(page, "SHORTX");
    const aside = await page.locator("aside").innerText();
    check("short history: trend says not enough bars", /Not enough bars/.test(aside));
    check("short history: says no support/resistance detected", /No resistance detected/.test(aside) && /No support detected/.test(aside));
    await tool(page, "Level").click();
    await clickChart(page, 0.5, 200);
    check("short history: can still draw a level", (await yours(page)) === 1);
  });

  checkNoErrors(errors);
});

test("drawing on a phone", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  await startOnDaily(p);
  await openChart(p, "AAPL");
  const sec = await box(p.locator("section", { has: p.locator("canvas") }).first());
  const asideBox = await box(p.locator("aside"));
  check("phone: panel sits below the chart", asideBox.y >= sec.y + sec.height - 1);
  check("phone: no horizontal overflow", (await overflow(p)) <= 0);
  await tool(p, "Level").tap();
  check("phone: hint says tap", /^Tap the chart/.test(await hint(p).innerText()));
  const cb = await box(chartBox(p));
  await p.touchscreen.tap(cb.x + cb.width * 0.5, cb.y + 150);
  await p.waitForTimeout(300);
  check("phone: tap places a level", (await yours(p)) === 1);
  await phone.close();
  checkNoErrors(errors);
});
