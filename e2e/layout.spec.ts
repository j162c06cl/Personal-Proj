// Page layout: pages fill the screen's width, the watchlist, the stock page's single verdict,
// the screener's strategy and columns, the settings page, and phones.
import { test, check, checkNoErrors, box, newContext, overflow, PHONE, trackErrors } from "./support";
import type { Page } from "@playwright/test";

const PAGES = ["/", "/watchlist", "/calculator", "/portfolio", "/settings", "/stock/AAPL", "/stock/AAPL/chart"];
const open = (p: Page, path: string) => p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });

test("every page fills the screen's width, lined up with the nav bar", async ({ page, errors }) => {
  for (const width of [1600, 2200]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await open(page, path);
      const content = await box(page.locator("main > div").first());
      const logo = await box(page.getByRole("link", { name: "The Dip" }));
      // Only the 32px side padding is left over
      check(`${width}px ${path}: content spans the width`, Math.abs(content.width - (width - 64)) <= 1, `x ${Math.round(content.x)}, width ${Math.round(content.width)}`);
      check(`${width}px ${path}: logo lines up with the content`, Math.abs(logo.x - content.x) <= 1, `logo ${Math.round(logo.x)}, content ${Math.round(content.x)}`);
    }
  }
  check("the logo is just the name, no dot", (await page.getByRole("link", { name: "The Dip" }).locator("span").count()) === 0);
  await open(page, "/");
  check("dashboard: no 'Sectors you watch'", !/Sectors you watch/.test(await page.locator("main").innerText()));
  checkNoErrors(errors);
});

test("watchlist: the list fills the page, and a row opens the stock page", async ({ page, browser, errors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/watchlist");
  const rows = page.locator("main ul li a");
  check("laptop: no panel beside the list", (await page.getByRole("complementary").count()) === 0);
  check("laptop: rows span the page", Math.round((await box(rows.first())).width) >= 1440 - 64, Math.round((await box(rows.first())).width));
  const second = (await rows.nth(1).locator("p").first().innerText()).trim();
  await rows.nth(1).click();
  await page.waitForURL(/\/stock\//);
  check("laptop: clicking a row opens the stock page", page.url().endsWith(`/stock/${second}`), page.url());

  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  const phoneErrors = trackErrors(p, [], "phone ");
  await open(p, "/watchlist");
  await p.locator("main ul li a").first().tap();
  await p.waitForURL(/\/stock\//);
  check("phone: tapping a row opens the stock page", /\/stock\/[A-Z]/.test(p.url()), p.url());
  await phone.close();
  checkNoErrors([...errors, ...phoneErrors]);
});

test("stock page: one verdict for your strategy, with the other a click away", async ({ page, errors }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "/stock/AAPL");
  const card = page.locator("section", { hasText: /As a (long-term investment|swing trade)/ }).first();
  await card.waitFor({ timeout: 60_000 });
  const text = await card.innerText();
  check("the verdict is for long-term, from Settings", /AS A LONG-TERM INVESTMENT/i.test(text) && /Your strategy in Settings/.test(text), text.split("\n").slice(0, 3).join(" | "));
  check("no strategy switch or 'The numbers say' heading", !/The numbers say/i.test(await page.locator("main").innerText()) && !(await page.getByRole("group", { name: "Judge as" }).count()));
  check("the Watch button is in the header", (await page.getByRole("button", { name: /Watch/ }).first().boundingBox())!.y < 150);

  await card.getByRole("button", { name: "See the long-term checklist" }).click();
  check("the checklist covers one strategy", /checks pass/.test(await card.innerText()) && !/As a swing trade/.test(await card.innerText()));

  await card.getByRole("button", { name: "See it as a swing trade" }).click();
  const swing = await card.innerText();
  check("one click switches to the swing view", /AS A SWING TRADE/i.test(swing) && /Switched on this page/.test(swing));
  await card.getByRole("button", { name: "Back to the long-term view" }).click();
  check("and back", /AS A LONG-TERM INVESTMENT/i.test(await card.innerText()));
  checkNoErrors(errors);
});

test("screener: starts on your Settings strategy, explains it, and shows columns on a laptop", async ({ page, errors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/calculator");
  check("long-term by default, with a line saying what it means", (await page.getByRole("button", { name: "Long-term investing" }).getAttribute("aria-pressed")) === "true" && /Stocks to hold for years/.test(await page.locator("main").innerText()));
  const header = page.locator("main div.hidden.lg\\:flex", { hasText: "Stock" });
  if (await header.count()) check("laptop: column headings over the results", /Market cap/i.test(await header.innerText()), await header.innerText());

  await open(page, "/settings");
  await page.getByRole("button", { name: "Swing", exact: true }).click();
  await open(page, "/calculator");
  check("swing in Settings starts the screener on swing trading", (await page.getByRole("button", { name: "Swing trading" }).getAttribute("aria-pressed")) === "true" && /Trades lasting days to weeks/.test(await page.locator("main").innerText()));
  checkNoErrors(errors);
});

test("settings: no sector picker, troubleshooting folded away", async ({ page, errors }) => {
  await open(page, "/settings");
  const main = await page.locator("main").innerText();
  check("no 'Sectors to watch'", !/Sectors to watch/i.test(main));
  check("the strategy says what it changes", /Stock pages and the Screener judge stocks/.test(main));
  const details = page.locator("details", { hasText: "Troubleshooting" });
  check("troubleshooting starts closed", (await details.getAttribute("open")) === null);
  await details.locator("summary").click();
  check("and opens to show the feeds", (await details.getAttribute("open")) !== null && /Clear cache/.test(await details.innerText()));
  checkNoErrors(errors);
});

test("phones: no sideways scrolling, and the stock tabs show there are more", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  for (const path of PAGES) {
    await open(p, path);
    check(`phone ${path}: no horizontal overflow`, (await overflow(p)) <= 0);
  }
  await open(p, "/stock/AAPL");
  const tabs = p.getByRole("tablist").first();
  const scrollable = await tabs.evaluate((el) => el.scrollWidth > el.clientWidth);
  const fade = await tabs.evaluate((el) => !!el.parentElement?.querySelector("[aria-hidden].bg-gradient-to-l"));
  check("phone: the tab row scrolls and fades at the edge", scrollable && fade);
  await phone.close();
  checkNoErrors(errors);
});
