import Link from "next/link";

/** A ticker symbol that opens the stock research page. Use this anywhere a ticker is shown. */
export default function TickerLink({
  ticker,
  className = "font-bold text-[#1F65F0]",
}: {
  ticker: string;
  className?: string;
}) {
  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      onClick={(e) => e.stopPropagation()}
      className={`${className} hover:underline underline-offset-2 decoration-2`}
      title={`Research ${ticker}`}
    >
      {ticker}
    </Link>
  );
}
