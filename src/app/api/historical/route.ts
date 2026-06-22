import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require("yahoo-finance2").default;

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const from = request.nextUrl.searchParams.get("from");

  if (!ticker || !from) {
    return NextResponse.json({ error: "ticker and from date required" }, { status: 400 });
  }

  try {
    const fromDate = new Date(from);
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + 7);

    const [historical, currentQuote] = await Promise.all([
      yahooFinance.historical(ticker.toUpperCase(), {
        period1: fromDate.toISOString().split("T")[0],
        period2: toDate.toISOString().split("T")[0],
        interval: "1d",
      }),
      yahooFinance.quote(ticker.toUpperCase()),
    ]);

    if (!historical || historical.length === 0) {
      return NextResponse.json({ error: "No historical data found for this date" }, { status: 404 });
    }

    const entry = historical[0];
    const actualDate = entry.date.toISOString().split("T")[0];
    const closingPrice = entry.close;
    const currentPrice = currentQuote.regularMarketPrice ?? 0;

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      date: from,
      actualDate,
      closingPrice,
      currentPrice,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch historical data" }, { status: 500 });
  }
}
