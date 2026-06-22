import { CalculatorResult } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";

interface Props {
  result: CalculatorResult;
}

export default function CalculatorResultCard({ result }: Props) {
  const isProfit = result.profitLoss >= 0;
  const plColor = isProfit ? "text-emerald-400" : "text-red-400";

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{isProfit ? "📈" : "📉"}</span>
        <div>
          <p className="text-sm text-gray-400">
            {formatCurrency(result.investmentAmount)} invested in <span className="text-white font-semibold">{result.ticker}</span> on {formatDate(result.actualDate)}
            {result.actualDate !== result.purchaseDate && (
              <span className="text-xs text-gray-500 ml-1">(nearest trading day)</span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Current Value</p>
          <p className="text-lg font-bold text-white">{formatCurrency(result.currentValue)}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Profit / Loss</p>
          <p className={`text-lg font-bold ${plColor}`}>{formatCurrency(result.profitLoss)}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Total Return</p>
          <p className={`text-lg font-bold ${plColor}`}>{formatPercent(result.percentReturn)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div><p className="text-gray-500">Shares Owned</p><p className="text-gray-300 font-medium">{result.sharesOwned.toFixed(4)}</p></div>
        <div><p className="text-gray-500">Price Then</p><p className="text-gray-300 font-medium">{formatCurrency(result.priceAtPurchase)}</p></div>
        <div><p className="text-gray-500">Price Now</p><p className="text-gray-300 font-medium">{formatCurrency(result.currentPrice)}</p></div>
        <div><p className="text-gray-500">Invested</p><p className="text-gray-300 font-medium">{formatCurrency(result.investmentAmount)}</p></div>
      </div>

      <p className={`mt-4 text-sm font-medium ${plColor} bg-gray-900 rounded-lg p-3`}>
        {isProfit
          ? `Your ${formatCurrency(result.investmentAmount)} grew to ${formatCurrency(result.currentValue)} — a ${formatPercent(result.percentReturn)} return.`
          : `Your ${formatCurrency(result.investmentAmount)} would be worth ${formatCurrency(result.currentValue)} today — a ${formatPercent(result.percentReturn)} loss.`}
      </p>
    </div>
  );
}
