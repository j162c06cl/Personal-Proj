import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function toStooqDate(isoDate: string) {
  return isoDate.replace(/-/g, "");
}

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

    const d1 = toStooqDate(from);
    const d2 = toStooqDate(toDate.toISOString().split("T")[0]);
    const symbol = ticker.toLowerCase();

    const [histRes, currRes] = await Promise.all([
      fetch(`https://stooq.com/q/d/l/?s=${symbol}.us&d1=${d1}&d2=${d2}&i=d`, { headers: { "User-Agent": UA } }),
      fetch(`https://stooq.com/q/l/?s=${symbol}.us&f=sd2t2ohlcv&e=csv`, { headers: { "User-Agent": UA } }),
    ]);

    const histText = await histRes.text();
    const currText = await currRes.text();

    // Historical CSV: Date,Open,High,Low,Close,Volume
    const histLines = histText.trim().split("\n").filter((l) => l && !l.startsWith("Date"));
    if (histLines.length === 0) {
      return NextResponse.json({ error: "No data found for this date. The market may have been closed." }, { status: 404 });
    }
    const histParts = histLines[0].split(",");
    const actualDate = histParts[0];
    const closingPrice = parseFloat(histParts[4]);

    if (isNaN(closingPrice)) {
      return NextResponse.json({ error: "Could not parse historical price." }, { status: 500 });
    }

    // Current CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const currLines = currText.trim().split("\n");
    const currParts = currLines[1]?.split(",") || [];
    const currentPrice = parseFloat(currParts[6]) || 0;

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      date: from,
      actualDate,
      closingPrice,
      currentPrice,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
