// Setup backtest: a trade worked out by hand, every listed trade's arithmetic, accounts,
// training and testing periods, the balance chart, Show on chart, settings, intraday, phone.
import { test, check, checkNoErrors, bar, box, newContext, num, openChart, PHONE, rangeBars, series, startOnDaily, trackErrors } from "./support";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1300 } });

const sec = (p: Page) => p.locator("section[aria-labelledby=backtest-title]");
const compareTable = (p: Page) => sec(p).locator("table").nth(0);
const statsTable = (p: Page) => sec(p).locator("table").nth(1);
const tradesTable = (p: Page) => sec(p).locator("table").nth(2);
const legendDate = async (p: Page) => (await p.locator("section [aria-busy] .tabular-nums").first().innerText()).split("\n")[0];
const periodBtn = (p: Page, n: string) => p.locator("[role=group][aria-label=Period]").getByRole("button", { name: n });
async function openBacktest(p: Page, ticker: string) {
  await openChart(p, ticker);
  await p.waitForSelector("#backtest-title", { timeout: 60_000 });
}
interface Row { detected: string; setup: string; shares: string; entry: string; stop: string; target: string; result: string; exit: string; costs: string; costTitle: string; pnl: string; r: string }
function rows(p: Page): Promise<Row[]> {
  return tradesTable(p).locator("tbody tr").evaluateAll((trs) => trs.map((tr) => {
    const c = Array.from(tr.querySelectorAll("td")).map((td) => (td as HTMLElement).innerText.trim());
    const costTitle = tr.querySelectorAll("td")[8]?.getAttribute("title") ?? "";
    return { detected: c[0], setup: c[1], shares: c[2], entry: c[3], stop: c[4], target: c[5], result: c[6], exit: c[7], costs: c[8], costTitle, pnl: c[9], r: c[11] };
  }));
}
const statsRow = async (p: Page, name: string) => (await statsTable(p).locator("tbody tr", { hasText: name }).first().innerText()).split("\t").map((s) => s.trim());
async function setField(p: Page, label: string, value: number) {
  const f = sec(p).getByRole("spinbutton", { name: label, exact: true });
  await f.fill(String(value));
  await f.press("Enter");
  await p.waitForTimeout(350);
}

/** A breakout on bar 60, then a steady climb to the 2R target */
function history() {
  const r = rangeBars(60);
  r.push(bar(60, r[59].close!, 113.5, r[59].close!, 113, 3000));
  for (let j = 1; j <= 30; j++) { const p = 113 + j * 0.5; r.push(bar(60 + j, p - 0.3, p + 0.4, p - 0.6, p)); }
  return r;
}

test("a breakout worked out by hand", async ({ page, errors }) => {
  await startOnDaily(page);
  await page.route("**/api/candles?ticker=BRKX*", (r) => r.fulfill({ json: series("BRKX", history()) }));
  await openBacktest(page, "BRKX");
  await statsTable(page).getByRole("button", { name: "Breakout", exact: true }).click();
  let b: Row | undefined = (await rows(page))[0];
  check("breakout traded in its own account", !!b && b.setup.startsWith("Breakout") && /Jul 31, 2026/.test(b.detected), b && `${b.detected} ${b.setup}`);
  if (b) {
    // Defaults: 0.05% slippage per fill, $1 + 0.05% brokerage per order, 1% of $10,000 risked, 2R target
    const entry = 113.2 * 1.0005, stop = 110.5, risk = entry - stop, target = entry + 2 * risk;
    const shares = Math.floor(100 / risk);
    const exit = target * 0.9995;
    const fees = 2 + 0.0005 * shares * (entry + exit);
    const pnl = shares * (exit - entry) - fees;
    check("entry = next open + 0.05% slippage", Math.abs(num(b.entry) - entry) < 0.006, `${b.entry} vs ${entry.toFixed(3)}`);
    check("target = 2R from the price paid", Math.abs(num(b.target) - target) < 0.006, `${b.target} vs ${target.toFixed(3)}`);
    check("shares risk 1% of $10,000 at the stop", num(b.shares) === shares, `${b.shares} vs ${shares}`);
    check("exit = target − 0.05% slippage", Math.abs(num(b.exit) - exit) < 0.006, `${b.exit} vs ${exit.toFixed(3)}`);
    check("brokerage = $1 + 0.05% on the buy and the sell", b.costTitle.includes(`Brokerage $${fees.toFixed(2)}`), `${b.costTitle} vs ${fees.toFixed(2)}`);
    check("net P&L after slippage and fees", Math.abs(num(b.pnl) - pnl) < 0.011, `${b.pnl} vs ${pnl.toFixed(2)}`);
    check("net R below 2 because of costs", num(b.r) < 2 && num(b.r) > 1.8, b.r);
  }
  const st = await statsRow(page, "Breakout");
  check("stats row: 1 trade, 100% win, return matches the P&L", st[1] === "1" && st[2] === "100%" && Math.abs(num(st[11]) - num(b?.pnl) / 100) < 0.051, st.join(" | "));
  await periodBtn(page, "Training").click();
  await page.waitForTimeout(200);
  b = (await rows(page))[0];
  check("training period: the same trade is still open at the split (no testing bars used)", !!b && /Open/.test(b.result), b?.result);
  checkNoErrors(errors);
});

test("the backtest on real bars", async ({ page, errors }) => {
  await startOnDaily(page);
  await openBacktest(page, "AAPL");
  const ctext = await compareTable(page).innerText();
  const heads = (await compareTable(page).locator("thead").textContent()) ?? "";

  await test.step("report", async () => {
    check("training vs testing table with both periods", /Training · .* – .*/.test(heads) && /Testing · /.test(heads) && /Profit factor/.test(ctext) && /Maximum drawdown/.test(ctext), ctext.split("\n")[0]);
    const statsText = await statsTable(page).innerText();
    check("results table: every setup and the combined account", ["Breakout", "Pullback", "Bull flag", "Support bounce", "Golden cross", "All setups together"].every((n) => statsText.includes(n)));
    const all = await statsRow(page, "All setups together");
    check("combined row reports trades, win rate, avg P&L, R:R and drawdown", num(all[1]) > 0 && /%$/.test(all[2]) && /\$/.test(all[5]) && /^1 : /.test(all[7]) && /^−\d/.test(all[10]), all.join(" | "));
    const rs = await rows(page);
    const bad: string[] = [];
    let ok = 0;
    for (const r of rs) {
      if (/Open/.test(r.result)) { ok++; continue; }
      const sh = num(r.shares), e = num(r.entry), x = num(r.exit), s = num(r.stop), t = num(r.target);
      const fees = num(r.costTitle.match(/Brokerage \$([\d,.]+)/)?.[1]);
      const expFees = 2 + 0.0005 * sh * (e + x);
      const good = Math.abs(fees - expFees) < 0.02 + sh * 0.00001
        && Math.abs(num(r.pnl) - (sh * (x - e) - fees)) < sh * 0.011 + 0.02
        && Math.abs(t - (e + 2 * (e - s))) < 0.011
        && sh * (e - s) <= 125 && sh * e <= 11_500 + e;
      if (good) ok++; else bad.push(`${r.detected} ${r.setup} ${sh}@${e} s${s} t${t} x${x} fees${fees}/${expFees.toFixed(2)} pnl${r.pnl}`);
    }
    check("every trade: fees, net P&L, 2R target, risk ≈1% and no borrowing", ok === rs.length && rs.length > 0, bad.slice(0, 2).join(" | ") || `${rs.length} rows`);
    check("combined account explains skipped signals (position already open)", /a position was already open/.test(await sec(page).innerText()));
  });

  await test.step("accounts and periods", async () => {
    await statsTable(page).getByRole("button", { name: "Support bounce", exact: true }).click();
    await page.waitForTimeout(200);
    let rs = await rows(page);
    check("choosing a setup shows its own account's trades", rs.length > 0 && rs.every((r) => r.setup.startsWith("Support bounce")) && /Trades: support bounce/.test(await sec(page).innerText()));
    await statsTable(page).getByRole("button", { name: "All setups together", exact: true }).click();

    await periodBtn(page, "Testing").click();
    await page.waitForTimeout(200);
    const testFrom = Date.parse(heads.match(/Testing · ([A-Za-z]+ \d+, \d{4})/)?.[1] ?? "");
    rs = await rows(page);
    check("testing period lists only signals from the testing bars", rs.length > 0 && rs.every((r) => Date.parse(r.detected) >= testFrom), `${rs.length} rows from ${new Date(testFrom).toDateString()}`);
    const testAll = await statsRow(page, "All setups together");
    check("testing results match the comparison table", ctext.split("\n").find((l) => l.startsWith("Closed trades"))?.split("\t").pop()?.trim() === testAll[1], testAll[1]);
    await periodBtn(page, "Whole history").click();
  });

  await test.step("balance chart and Show on chart", async () => {
    const svg = sec(page).locator("figure svg[role=img]");
    const label = await svg.getAttribute("aria-label");
    check("balance chart labelled with start, end and largest drop", /from \$10,000\.00 to \$[\d,.]+; largest drop \d+\.\d%/.test(label ?? ""), label);
    check("balance chart marks where testing starts", (await sec(page).locator("figure").innerText()).includes("Testing →"));
    const sb = await box(svg);
    await page.mouse.move(sb.x + sb.width * 0.6, sb.y + sb.height / 2);
    await page.waitForTimeout(150);
    check("hovering the balance shows date, balance and change", /\$[\d,]+\.\d\d[\s\S]*vs start/.test(await sec(page).locator("figure").innerText()));
    await page.mouse.move(5, 5);

    const firstRow = (await rows(page))[0];
    await tradesTable(page).locator("tbody tr").first().getByRole("button", { name: /^Show/ }).click();
    await page.waitForTimeout(700);
    check("Show puts the crosshair on the trade's signal bar", (await legendDate(page)).includes(firstRow.detected.replace(/, \d{4}$/, "")), await legendDate(page));
    await tradesTable(page).locator("tbody tr").first().getByRole("button", { name: /^Hide/ }).click();
  });

  await test.step("settings", async () => {
    await sec(page).getByRole("button", { name: "Change settings" }).click();
    await setField(page, "Fixed brokerage", 0);
    await setField(page, "Percentage brokerage", 0);
    await setField(page, "Slippage", 0);
    let rs = await rows(page);
    check("no costs: every trade's costs are $0.00 and net P&L is shares × move", rs.every((r) => r.costs === "$0.00" && (/Open/.test(r.result) || Math.abs(num(r.pnl) - num(r.shares) * (num(r.exit) - num(r.entry))) < 0.011 + num(r.shares) * 0.006)), rs[0] && `${rs[0].costs} ${rs[0].pnl}`);
    await setField(page, "Risk per trade", 2);
    rs = await rows(page);
    check("2% risk roughly doubles position sizes", rs.filter((r) => !/Open/.test(r.result)).every((r) => num(r.shares) * (num(r.entry) - num(r.stop)) > 125 || num(r.shares) * num(r.entry) > 8_000));
    const before = num((await statsRow(page, "All setups together"))[1]);
    await sec(page).getByRole("checkbox").check();
    await page.waitForTimeout(350);
    const after = num((await statsRow(page, "All setups together"))[1]);
    check("allowing several positions takes more trades in the combined account", after > before, `${before} → ${after}`);
    check("…and no signal is skipped for an open position", !/a position was already open/.test(await sec(page).innerText()));
    await setField(page, "Training period", 50);
    check("training share changes the split", /first 50% of the bars/.test(await sec(page).innerText()));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#backtest-title");
    const summary = await sec(page).innerText();
    check("settings remembered after reload", /\$0\.00 \+ 0% per order/.test(summary) && /risk 2% of/.test(summary) && /several positions at once/.test(summary) && /first 50%/.test(summary));
    await sec(page).getByRole("button", { name: /Reset \(\d+ changed\)/ }).click();
    await page.waitForTimeout(300);
    const reset = await sec(page).innerText();
    check("Reset restores the defaults", /\$1\.00 \+ 0\.05% per order/.test(reset) && /one position at a time/.test(reset));
  });

  await test.step("explanations", async () => {
    const how = sec(page).locator("details");
    await how.locator("summary").click();
    const howText = (await how.innerText()).replace(/'/g, "’");
    const wanted = ["open of the bar after the signal", "brokerage", "never more than the cash", "same bar become one trade", "fresh balance", "doesn’t guarantee"];
    check("explains look-ahead, costs, sizing, overlap, split and no guarantee", wanted.every((s) => howText.includes(s)), wanted.filter((s) => !howText.includes(s)).join(", "));
    check("says past results don't guarantee future ones at the top", /Past results don.t guarantee or predict future ones/.test(await sec(page).innerText()));
  });

  await test.step("intraday", async () => {
    await page.evaluate(() => localStorage.setItem("chart_timeframe", "5m"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#backtest-title", { timeout: 60_000 });
    check("5m: backtest on intraday bars", /AAPL · 5m bars/.test(await sec(page).innerText()) && /(AM|PM)/.test((await rows(page))[0]?.detected ?? ""));
  });

  checkNoErrors(errors);
});

test("the backtest on a phone", async ({ browser }) => {
  const errors: string[] = [];
  const phone = await newContext(browser, PHONE);
  const p = await phone.newPage();
  trackErrors(p, errors, "phone ");
  await p.addInitScript(() => localStorage.setItem("chart_timeframe", "1d"));
  await openBacktest(p, "AAPL");
  await sec(p).getByRole("button", { name: "Change settings" }).tap();
  await p.waitForTimeout(300);
  const o = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, window.innerWidth]);
  const lastCol = await compareTable(p).locator("tbody tr").first().locator("td").last().boundingBox();
  check("phone: training vs testing values fit on screen", !!lastCol && lastCol.x + lastCol.width <= 390, lastCol && `right edge ${Math.round(lastCol.x + lastCol.width)}`);
  check("phone: no horizontal page overflow with settings open", o[0] <= o[1] && o[2] === 390, o.join(" / "));
  await tradesTable(p).locator("tbody tr").first().getByRole("button", { name: /^Show/ }).tap();
  await p.waitForTimeout(2500);
  const chart = await p.locator("section#chart").boundingBox();
  check("phone: Show scrolls the chart into view", !!chart && chart.y < 844 && chart.y + chart.height > 0, chart && `y=${Math.round(chart.y)}`);
  await phone.close();
  checkNoErrors(errors);
});
