// Economic calendar (with the clock set to fixed dates) and the purchase-price lookup in the
// add-position form.
//
// With a faked clock the server renders today's real date and the browser a different one,
// so React reports a hydration mismatch and re-renders on the client. That can't happen to a
// real visitor, so the calendar tests check the page's content and not its console.
import { test, check, checkNoErrors, overflow, PHONE } from "./support";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

const text = (p: Page) => p.evaluate(() => document.body.textContent ?? "");
const WARN_SOON = "only listed up to Apr 29, 2027";
const WARN_ENDED = "ended on Apr 29, 2027";

async function at(p: Page, iso: string, path: string) {
  await p.clock.install({ time: new Date(iso) });
  await p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
  await p.waitForTimeout(500);
}

test.describe("economic calendar", () => {
  test("dashboard on 21 Nov 2026", async ({ page }) => {
    await at(page, "2026-11-21T10:00:00", "/");
    const t = await text(page);
    check("next releases are the Nov 25 GDP and PCE", t.includes("GDP (Q3 Second Estimate)") && t.includes("PCE Price Index (Oct)"));
    check("no 'No scheduled releases'", !t.includes("No scheduled releases"));
    check("no calendar warning", !t.includes(WARN_SOON) && !t.includes(WARN_ENDED));
  });

  test("dashboard near the end of the list", async ({ page }) => {
    await at(page, "2027-04-10T10:00:00", "/");
    const t = await text(page);
    check("warns the list ends Apr 29", t.includes(WARN_SOON));
    check("still lists the next releases", t.includes("CPI (Mar)") && t.includes("PPI (Mar)"));
  });

  test("dashboard after the list has ended", async ({ page }) => {
    await at(page, "2027-05-10T10:00:00", "/");
    const t = await text(page);
    check("says the list has ended", t.includes(WARN_ENDED));
    check("doesn't claim nothing is scheduled", !t.includes("No scheduled releases"));
  });

  test("calendar page", async ({ page }) => {
    await at(page, "2026-11-21T10:00:00", "/calendar");
    const t = await text(page);
    check("next release banner names the Nov 25 release", /Next Release\s*(GDP \(Q3 Second Estimate\)|PCE Price Index \(Oct\))/.test(t));
    check("names its official sources", t.includes("official BLS, BEA, Census and Federal Reserve schedules"));
    check("no warning", !t.includes(WARN_SOON) && !t.includes(WARN_ENDED));
  });

  test("calendar page near the end of the list", async ({ page }) => {
    await at(page, "2027-04-20T10:00:00", "/calendar");
    check("warning shown", (await text(page)).includes(WARN_SOON));
  });

  test("portfolio's Coming up card", async ({ page }) => {
    for (const [iso, warned] of [["2026-11-21T10:00:00", false], ["2027-04-10T10:00:00", true]] as const) {
      const p = await page.context().newPage();
      await at(p, iso, "/portfolio");
      await addPosition(p, "AAPL", "Apple Inc.", "2025-03-03", "238.03", "10");
      await p.waitForSelector("text=Coming up", { timeout: 60_000 });
      await p.waitForTimeout(1000);
      const card = (await p.locator("div.bg-white", { has: p.locator("h3", { hasText: "Coming up" }) }).last().textContent()) ?? "";
      check(`${iso.slice(0, 10)}: warning ${warned ? "shown" : "not shown"}`, card.includes(WARN_SOON) === warned, card.slice(0, 160));
      await p.evaluate(() => indexedDB.deleteDatabase("investor-research"));
      await p.close();
    }
  });
});

// ── Purchase-price lookup ──

/** /api/historical answers recorded from the live route, so the form is tested on fixed data */
const HISTORICAL: Record<string, object> = {
  "D05.SI|2024-06-01": { ticker: "D05.SI", date: "2024-06-01", actualDate: "2024-06-03", closingPrice: 36.06999969482422, currentPrice: 66.11, currency: "SGD", source: "Yahoo Finance", asOf: "2026-11-20T09:14:03.000Z" },
  "Z74.SI|2023-01-03": { ticker: "Z74.SI", date: "2023-01-03", actualDate: "2023-01-03", closingPrice: 2.549999952316284, currentPrice: 4.16, currency: "SGD", source: "Yahoo Finance", asOf: "2026-11-20T09:07:29.000Z" },
  "AAPL|2025-03-03": { ticker: "AAPL", date: "2025-03-03", actualDate: "2025-03-03", closingPrice: 238.02999877929688, currentPrice: 342.56, currency: "USD", source: "Yahoo Finance", asOf: "2026-11-20T21:00:02.000Z" },
};
async function mockHistorical(p: Page) {
  await p.route("**/api/historical?*", (r) => {
    const u = new URL(r.request().url());
    const hit = HISTORICAL[`${u.searchParams.get("ticker")}|${u.searchParams.get("from")}`];
    return hit
      ? r.fulfill({ json: hit })
      : r.fulfill({ status: 404, json: { error: `Yahoo Finance doesn't recognise ${u.searchParams.get("ticker")}. Check the symbol (Singapore listings end in .SI).` } });
  });
}

const priceInput = (p: Page) => p.locator('input[placeholder="e.g. 150.00"]');
const formText = async (p: Page) => (await p.locator("form").textContent()) ?? "";
async function openForm(p: Page) {
  await p.goto("/portfolio", { waitUntil: "networkidle", timeout: 120_000 });
  await p.getByRole("button", { name: /Add Position/ }).first().click();
  await p.waitForSelector("text=Purchase Date");
}
async function fetchFor(p: Page, ticker: string, date: string) {
  const tk = p.locator('input[placeholder="e.g. AAPL"]');
  await tk.fill(ticker);
  await tk.press("Escape");
  await p.locator("input[type=date]").fill(date);
  await p.getByRole("button", { name: "Fetch" }).click();
  await p.waitForFunction(() => !Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "…"), null, { timeout: 30_000 });
  await p.waitForTimeout(300);
}
async function addPosition(p: Page, ticker: string, name: string, date: string, price: string, shares: string) {
  await p.getByRole("button", { name: /Add Position/ }).first().click();
  const tk = p.locator('input[placeholder="e.g. AAPL"]');
  await tk.fill(ticker);
  await tk.press("Escape");
  await p.locator('input[placeholder="e.g. Apple Inc."]').fill(name);
  await p.locator("input[type=date]").fill(date);
  await priceInput(p).fill(price);
  await p.locator('input[placeholder="e.g. 10"]').fill(shares);
  await p.locator("form").getByRole("button", { name: "Add Position" }).click();
}

test.describe("purchase-price lookup", () => {
  test("fills the close and says where it came from", async ({ page, errors }) => {
    await mockHistorical(page);
    await openForm(page);

    await fetchFor(page, "D05.SI", "2024-06-01"); // a Saturday
    let t = await formText(page);
    check("SGX: fills DBS's close", (await priceInput(page).inputValue()) === "36.07", await priceInput(page).inputValue());
    check("SGX: says it used the next trading day", t.includes("Closing price on Mon, Jun 3, 2024 (the next trading day)"), t.match(/Closing price[^.]*/)?.[0]);
    check("names the source", t.includes("Yahoo Finance"));
    check("explains split adjustment", t.includes("Adjusted for any later stock splits"));

    await fetchFor(page, "Z74.SI", "2023-01-03");
    check("a low-priced stock keeps its precision", (await priceInput(page).inputValue()) === "2.55", await priceInput(page).inputValue());

    await fetchFor(page, "AAPL", "2025-03-03");
    t = await formText(page);
    check("US: fills AAPL's close", (await priceInput(page).inputValue()) === "238.03", await priceInput(page).inputValue());
    check("no 'next trading day' when the date traded", t.includes("Closing price on Mon, Mar 3, 2025."), t.match(/Closing price[^.]*\./)?.[0]);

    await page.locator("input[type=date]").fill("2025-03-04");
    check("changing the date clears the note", !(await formText(page)).includes("Closing price on"));

    await fetchFor(page, "NOSUCHTICKERX", "2025-03-03");
    check("unknown ticker: clear error", (await formText(page)).includes("Yahoo Finance doesn't recognise NOSUCHTICKERX"));
    checkNoErrors(errors);
  });

  test("fits a phone", async ({ browser }) => {
    const ctx = await browser.newContext(PHONE);
    const p = await ctx.newPage();
    await mockHistorical(p);
    await openForm(p);
    await fetchFor(p, "D05.SI", "2024-06-01");
    check("phone: the form doesn't widen the page", (await overflow(p)) <= 0);
    await ctx.close();
  });
});
