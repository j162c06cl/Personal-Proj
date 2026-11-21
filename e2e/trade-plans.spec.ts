// Trade plans: the plan tool, the form's maths and validation, sizing, save / edit / delete,
// short plans, a plan from a setup, plans per ticker, backup and restore, phone.
import { test, check, checkNoErrors, box, breakoutBars, chartBox, newContext, num, openChart, overflow, PHONE, series, startOnDaily, stored, trackErrors } from "./support";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ viewport: { width: 1440, height: 1300 }, acceptDownloads: true });

const card = (p: Page) => p.locator("#trade-plan");
const setups = (p: Page) => p.locator("aside section", { hasText: "How setups are judged" });
const tool = (p: Page, name: string) => p.getByRole("group", { name: "Drawing tools" }).getByRole("button", { name, exact: true });
const hint = (p: Page) => p.locator("p[role=status]").first();
const field = (p: Page, label: string) => card(p).getByRole("textbox", { name: label, exact: true });
async function clickAt(p: Page, fx: number, dy: number) {
  const b = await box(chartBox(p));
  await p.mouse.click(b.x + b.width * fx, b.y + dy);
  await p.waitForTimeout(250);
}
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Plan = { ticker: string; shares: number; target: number; createdAt: number; updatedAt: number };

test("planning, saving, editing and restoring trades", async ({ page, errors }) => {
  await startOnDaily(page);
  await page.route("**/api/candles?ticker=BRKX*", (r) => r.fulfill({ json: series("BRKX", breakoutBars()) }));
  await openChart(page, "AAPL");
  check("empty state explains the three ways to plan", /No saved plans for AAPL/.test(await card(page).innerText()));

  let entry = 0, stop = 0, target = 0, shares = 0;
  await test.step("plan tool: entry, stop, target", async () => {
    await tool(page, "Plan").click();
    check("step 1 hint", /step 1 of 3: click your entry/.test(await hint(page).innerText()));
    await clickAt(page, 0.8, 150);
    check("step 2 hint", /Step 2 of 3: click your stop-loss/.test(await hint(page).innerText()));
    await clickAt(page, 0.8, 150);
    check("the stop can't equal the entry", /Step 2 of 3/.test(await hint(page).innerText()));
    await clickAt(page, 0.8, 230);
    check("step 3 hint", /Step 3 of 3: click your target/.test(await hint(page).innerText()));
    await clickAt(page, 0.8, 60);
    entry = num(await field(page, "Entry").inputValue());
    stop = num(await field(page, "Stop-loss").inputValue());
    target = num(await field(page, "Target").inputValue());
    check("three clicks fill the plan form (entry > stop, target > entry)", stop < entry && target > entry, `${entry} / ${stop} / ${target}`);
    check("direction inferred as long", (await card(page).getByRole("button", { name: "Long" }).getAttribute("aria-pressed")) === "true");
    check("tool put away", (await tool(page, "Plan").getAttribute("aria-pressed")) === "false");
  });

  await test.step("maths, sizing and validation", async () => {
    let text = await card(page).innerText();
    const risk = entry - stop, reward = target - entry;
    const rr = text.match(/Risk : reward\s*1 : ([\d.]+)/)?.[1];
    check("risk per share and % to stop", text.includes(`$${risk.toFixed(2)} (${(risk / entry * 100).toFixed(2)}% to the stop)`), text.match(/Risk per share[^\n]*\n[^\n]*/)?.[0]?.replace(/\n/, " "));
    check("reward per share and % to target", text.includes(`$${reward.toFixed(2)} (${(reward / entry * 100).toFixed(2)}% to the target)`));
    check("risk : reward", rr === (reward / risk).toFixed(1), `1 : ${rr}`);
    check("break-even rate stated as arithmetic, not a forecast", new RegExp(`in ${Math.round(risk / (risk + reward) * 100)}% of trades like it`).test(text) && /not a forecast/.test(text));

    await card(page).getByLabel("Or size for a risk of").fill("1000");
    await card(page).getByRole("button", { name: "Size" }).click();
    shares = Math.floor(1000 / risk + 1e-9);
    text = await card(page).innerText();
    check("sizing fills whole shares within the budget", num(await field(page, "Shares").inputValue()) === shares, `${shares} shares`);
    check("potential loss and profit from the shares", text.includes(`−$${money(shares * risk)}`) && text.includes(`+$${money(shares * reward)}`));

    await field(page, "Stop-loss").fill((entry + 5).toFixed(2));
    text = await card(page).innerText();
    check("a stop above a long entry is explained and blocks saving", /stop must be below the entry/.test(text) && (await card(page).getByRole("button", { name: "Save plan" }).isDisabled()));
    await field(page, "Stop-loss").fill(String(stop));
    await card(page).getByRole("textbox", { name: /Note/ }).fill("Test plan");
  });

  await test.step("save and edit", async () => {
    await card(page).getByRole("button", { name: "Save plan" }).click();
    const text = await card(page).innerText();
    check("saved plan listed with its ratio, note and shares", /Long at \$/.test(text) && /1 : [\d.]+/.test(text) && /Test plan/.test(text) && new RegExp(`${shares} shares`).test(text));
    check("saved plan shown on the chart", await card(page).getByRole("button", { name: "Hide from chart" }).isVisible());
    let s = await stored<Plan[]>(page, "tradePlans");
    check("saved to IndexedDB", Array.isArray(s) && s.length === 1 && s[0].ticker === "AAPL" && s[0].shares === shares);
    await openChart(page, "AAPL");
    check("plan still there after reload", /Long at \$/.test(await card(page).innerText()));

    const created = (await stored<Plan[]>(page, "tradePlans"))![0].createdAt;
    await card(page).getByRole("button", { name: /^Edit plan/ }).click();
    await field(page, "Target").fill((target + 10).toFixed(2));
    await card(page).getByRole("button", { name: "Save changes" }).click();
    s = await stored<Plan[]>(page, "tradePlans");
    check("editing updates the plan and keeps when it was made", !!s && s.length === 1 && Math.abs(s[0].target - (target + 10)) < 0.001 && s[0].createdAt === created && s[0].updatedAt >= created);
  });

  await test.step("a short plan, cancel and Esc", async () => {
    await card(page).getByRole("button", { name: "+ New plan" }).click();
    let text = await card(page).innerText();
    check("new plan starts at the latest close and asks for stop and target", /Enter a stop-loss price/.test(text) && /Enter a target price/.test(text));
    await card(page).getByRole("button", { name: "Short" }).click();
    const e2 = num(await field(page, "Entry").inputValue());
    await field(page, "Stop-loss").fill((e2 * 1.03).toFixed(2));
    await field(page, "Target").fill((e2 * 0.91).toFixed(2));
    text = await card(page).innerText();
    check("short plan: 3% risk, 9% reward, 1 : 3.0", /3\.00% to the stop/.test(text) && /1 : 3\.0/.test(text));
    await card(page).getByRole("button", { name: "Save plan" }).click();
    text = await card(page).innerText();
    check("short plan listed with the right signs", /Short at \$[\d.]+/.test(text) && /\(\+3\.0%\) · Target \$[\d.]+ \(−9\.0%\)/.test(text));

    await card(page).getByRole("button", { name: "+ New plan" }).click();
    await card(page).getByRole("button", { name: "Cancel" }).click();
    check("cancel closes the form", !(await card(page).locator("form").count()));
    await tool(page, "Plan").click();
    await clickAt(page, 0.7, 150);
    await page.keyboard.press("Escape");
    check("Esc cancels a half-drawn plan", !(await hint(page).count()) && !(await card(page).locator("form").count()));
  });

  await test.step("a plan from a setup", async () => {
    await openChart(page, "BRKX");
    await setups(page).getByRole("button", { name: /^Breakout( (Confirmed|Forming))? Core/ }).click();
    await setups(page).getByRole("button", { name: "Plan a trade" }).click();
    await page.waitForTimeout(300);
    const text = await card(page).innerText();
    const ev = [num(await field(page, "Entry").inputValue()), num(await field(page, "Stop-loss").inputValue()), num(await field(page, "Target").inputValue())];
    check("plan from a breakout: entry = latest close, stop = broken level, target = 2× risk", ev[0] === 113 && Math.abs(ev[1] - 110.5) < 0.01 && Math.abs(ev[2] - 118) < 0.02, ev.join(" / "));
    check("…and says where each number came from", /From the breakout detected/.test(text) && /Entry: the latest close/.test(text) && /Stop: the setup's invalidation level/.test(text) && /Target: twice the risk/.test(text));
    await card(page).getByRole("button", { name: "Save plan" }).click();
    check("saved plan records its setup", /from the breakout detected/.test(await card(page).innerText()));

    const s = (await stored<Plan[]>(page, "tradePlans")) ?? [];
    check("plans kept per ticker", s.filter((p) => p.ticker === "AAPL").length === 2 && s.filter((p) => p.ticker === "BRKX").length === 1);
    await openChart(page, "MSFT");
    check("another ticker starts empty", /No saved plans for MSFT/.test(await card(page).innerText()));
  });

  await test.step("backup, restore and delete", async () => {
    await page.goto("/settings", { waitUntil: "networkidle" });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
    const file = test.info().outputPath("backup.json");
    await dl.saveAs(file);
    const backup = JSON.parse(readFileSync(file, "utf8"));
    check("backup includes trade plans", backup.tradePlans?.length === 3);
    check("export message counts plans", /and 3 trade plans/.test(await page.locator("body").innerText()));

    const older = { ...backup };
    delete older.tradePlans;
    await page.locator("input[type=file]").setInputFiles({ name: "older.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(older)) });
    await page.waitForTimeout(700);
    check("an older backup leaves plans alone", (await stored<Plan[]>(page, "tradePlans"))?.length === 3);
    await page.locator("input[type=file]").setInputFiles({ name: "one.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...backup, tradePlans: backup.tradePlans.slice(0, 1) })) });
    await page.waitForTimeout(700);
    check("importing restores the backup's plans", (await stored<Plan[]>(page, "tradePlans"))?.length === 1);

    const left = (await stored<Plan[]>(page, "tradePlans"))![0];
    await openChart(page, left.ticker);
    await card(page).getByRole("button", { name: /^Delete plan/ }).click();
    await page.waitForTimeout(300);
    check("delete removes the plan", (await stored<Plan[]>(page, "tradePlans"))?.length === 0 && /No saved plans/.test(await card(page).innerText()));
  });

  checkNoErrors(errors);
});

test("planning on a phone", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  await startOnDaily(p);
  await openChart(p, "AAPL");
  await tool(p, "Plan").tap();
  check("phone: hint says tap", /tap your entry/.test(await hint(p).innerText()));
  const cb = await box(chartBox(p));
  for (const dy of [120, 200, 40]) { await p.touchscreen.tap(cb.x + cb.width * 0.6, cb.y + dy); await p.waitForTimeout(300); }
  await p.waitForTimeout(800);
  const form = await card(p).locator("form").boundingBox();
  check("phone: three taps open the plan form and scroll it into view", !!form && form.y < 844 && form.y + 40 > 0, form ? `form at y=${Math.round(form.y)}` : "no form");
  check("phone: no horizontal overflow", (await overflow(p)) <= 0);
  await phone.close();
  checkNoErrors(errors);
});
