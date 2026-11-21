// Setups: split scores, checklists, the detection picker, the candle inspector, status since
// detection, adjustable rules, intraday volume, a bar still trading, phone.
import { test, check, checkNoErrors, bar, breakoutBars, newContext, openChart, overflow, PHONE, series, startOnDaily, trackErrors } from "./support";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1300 } });

const card = (p: Page) => p.locator("aside section", { hasText: "How setups are judged" });
const row = (p: Page, name: string) => card(p).getByRole("button", { name: new RegExp("^" + name + "( (Confirmed|Forming))? Core") });
const legendDate = async (p: Page) => (await p.locator("section [aria-busy] .tabular-nums").first().innerText()).split("\n")[0];
const SETUPS = ["Breakout", "Pullback", "Bull flag", "Support bounce", "Golden cross"];

/** A clean breakout that holds, and one that closes back below the level two bars later */
const failedBars = () => [...breakoutBars(), bar(61, 113, 114, 112, 113.5), bar(62, 113, 113.2, 109, 109.5)];

test("scores, checklists, picker and candle inspector on real bars", async ({ page, errors }) => {
  await startOnDaily(page);
  await openChart(page, "AAPL");

  await test.step("scores and checklists", async () => {
    const text = await card(page).innerText();
    const scores = text.match(/Core \d\/\d · Conf \d\/\d/g) || [];
    check("five setups with split scores", scores.length === 5, scores.join(", "));
    for (const n of SETUPS) {
      await row(page, n).click();
      const t = (await card(page).innerText()).split(n)[1];
      const core = t.match(/Core rules: (\d+) of (\d+) met/i), conf = t.match(/Confirmations: (\d+) of (\d+) met/i);
      const ticks = await card(page).locator("li li span[aria-hidden]").allInnerTexts();
      const ok = !!core && !!conf && ticks.filter((x) => x === "✓").length === +core[1] + +conf[1] && ticks.length === +core[2] + +conf[2];
      check(`${n}: ✓ marks match the core/confirmation counts`, ok, `${core?.[0]} · ${conf?.[0]}`);
      check(`${n}: says which bar the rules are for`, /Rules on (the latest bar, |.+, the (last )?bar)/.test(t));
      await row(page, n).click();
    }
  });

  await test.step("detection picker", async () => {
    await row(page, "Pullback").click();
    const select = card(page).locator("select");
    const options = await select.locator("option").allInnerTexts();
    check("picker lists the latest bar and past detections with status",
      options[0].startsWith("The latest bar") && options.length > 1 && options.slice(1).every((o) => /Detected .* · (still valid|invalidated)/.test(o)),
      `${options.length - 1} detections; e.g. ${options[options.length - 1]}`);
    await select.selectOption({ index: options.length - 1 });
    await card(page).getByRole("button", { name: "Show on chart" }).click();
    await page.waitForTimeout(500);
    check("an old detection scrolls the chart back", await page.getByRole("button", { name: "Latest »" }).isVisible());
    const st = await card(page).innerText();
    check("an old detection says what happened since", /Since then: (still valid|Invalidated)/.test(st), st.match(/Since then:[^\n]*/)?.[0]);
  });

  await test.step("candle inspector", async () => {
    await card(page).getByRole("button", { name: /Inspect candles \(\d+\)/ }).click();
    const rows = card(page).locator("ol li button");
    const n = await rows.count();
    let moved = 0;
    for (let k = 0; k < n; k++) {
      const label = await rows.nth(k).locator("span span").nth(1).innerText();
      await rows.nth(k).click();
      await page.waitForTimeout(150);
      if ((await legendDate(page)).includes(label)) moved++;
    }
    check("inspect: each candle row puts the crosshair on its bar", n > 0 && moved === n, `${moved}/${n}`);
    await row(page, "Pullback").click();
  });

  await test.step("intraday volume", async () => {
    await page.evaluate(() => localStorage.setItem("chart_timeframe", "5m"));
    await openChart(page, "AAPL");
    await page.waitForFunction(() => document.querySelector("aside")?.textContent?.includes("5m bars"), null, { timeout: 60_000 });
    await row(page, "Breakout").click();
    check("5m: volume rule compares with the same time of day", /usual for this time of day/.test(await card(page).innerText()));
  });

  checkNoErrors(errors);
});

test("a made-up breakout: evidence, status and adjustable rules", async ({ page, errors }) => {
  await startOnDaily(page);
  await page.route("**/api/candles?ticker=BRKX*", (r) => r.fulfill({ json: series("BRKX", breakoutBars()) }));
  await page.route("**/api/candles?ticker=BRKF*", (r) => r.fulfill({ json: series("BRKF", failedBars()) }));

  await test.step("evidence", async () => {
    await openChart(page, "BRKX");
    const t = await card(page).innerText();
    check("breakout detected and met on the latest bar", /Breakout[\s\S]*?Detected [^\n]*latest bar[\s\S]*?Met on the latest bar/.test(t));
    await row(page, "Breakout").click();
    await card(page).getByRole("button", { name: /Inspect candles/ }).click();
    const roles = await card(page).locator("ol li button span span:first-child").allInnerTexts();
    check("inspect lists the bars that formed resistance, then the breakout", roles.filter((r) => r === "Turned at the resistance level").length >= 2 && roles[roles.length - 1] === "Breakout bar", roles.join(" | "));
  });

  await test.step("a failed breakout", async () => {
    await openChart(page, "BRKF");
    const t = await card(page).innerText();
    check("a failed breakout shows as invalidated", /Breakout[\s\S]*?Invalidated [A-Z][a-z]{2} \d+, \d{4}: closed \$109\.50, below \$110\.50/.test(t), t.split("Pullback")[0].replace(/\n/g, " | "));
  });

  await test.step("rules: change, remember, reset", async () => {
    await openChart(page, "BRKX");
    await card(page).getByRole("button", { name: "Adjust rules" }).click();
    const vol = card(page).getByRole("spinbutton", { name: "Heavier volume means at least" });
    await vol.fill("3.5");
    await vol.press("Enter");
    await page.waitForTimeout(300);
    let t = await card(page).innerText();
    check("raising the volume rule removes the breakout", /Breakout[\s\S]*?Not detected now/.test(t.split("Pullback")[0]));
    check("custom rules are flagged", /custom rules/.test(t) && /1 changed from the defaults/.test(t));
    await openChart(page, "BRKX");
    check("custom rules remembered after reload", /custom rules/.test(await card(page).innerText()));
    await row(page, "Breakout").click();
    check("checklist quotes the custom threshold", /needs 3\.5×/.test(await card(page).innerText()));
    await row(page, "Breakout").click();
    await card(page).getByRole("button", { name: "Adjust rules" }).click();
    await card(page).getByRole("button", { name: "Reset to defaults" }).click();
    await page.waitForTimeout(300);
    t = await card(page).innerText();
    check("reset brings the breakout back", /Breakout[\s\S]*?Detected/.test(t.split("Pullback")[0]) && !/custom rules/.test(t));
    const flagMax = card(page).getByRole("spinbutton", { name: "Flag: at most" });
    await flagMax.fill("15");
    await flagMax.press("Tab");
    check("two-digit values can be typed", (await flagMax.inputValue()) === "15");
    await card(page).getByRole("button", { name: "Reset to defaults" }).click();
  });

  checkNoErrors(errors);
});

test("a detection on a bar still trading is provisional", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-07-31T15:00:00Z")); // 11:00 in New York on the last bar's date
  await page.route("**/api/candles?ticker=BRKX*", (r) => r.fulfill({ json: series("BRKX", breakoutBars()) }));
  await page.addInitScript(() => localStorage.setItem("chart_timeframe", "1d"));
  await openChart(page, "BRKX");
  await row(page, "Breakout").click();
  check("a detection on a bar still trading is marked provisional", /still trading/.test(await card(page).innerText()));
});

test("setups on a phone", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  await startOnDaily(p);
  await openChart(p, "AAPL");
  await row(p, "Support bounce").tap();
  await card(p).getByRole("button", { name: /Inspect candles/ }).tap();
  await card(p).getByRole("button", { name: "Adjust rules" }).tap();
  check("phone: no horizontal overflow with candles and rules open", (await overflow(p)) <= 0);
  await phone.close();
  checkNoErrors(errors);
});
