import { CalculatorResult } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";

interface Props { result: CalculatorResult; }

export default function CalculatorResultCard({ result }: Props) {
  const isProfit = result.profitLoss >= 0;
  const plColor = isProfit ? "text-emerald-600" : "text-red-500";

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mt-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{isProfit ? "📈" : "📉"}</span>
        <p className="text-sm text-gray-600">
          {formatCurrency(result.investmentAmount)} invested in{" "}
          <span className="font-semibold text-gray-900">{result.ticker}</span> on {formatDate(result.actualDate)}
          {result.actualDate !== result.purchaseDate && (
            <span className="text-xs text-gray-400 ml-1">(nearest trading day)</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 rounded-xl p-3 border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Current Value</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(result.currentValue)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Profit / Loss</p>
          <p className={`text-lg font-bold ${plColor}`}>{formatCurrency(result.profitLoss)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Total Return</p>
          <p className={`text-lg font-bold ${plColor}`}>{formatPercent(result.percentReturn)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-gray-500 mb-0.5">Shares Owned</p><p className="text-gray-800 font-semibold">{result.sharesOwned.toFixed(4)}</p></div>
        <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-gray-500 mb-0.5">Price Then</p><p className="text-gray-800 font-semibold">{formatCurrency(result.priceAtPurchase)}</p></div>
        <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-gray-500 mb-0.5">Price Now</p><p className="text-gray-800 font-semibold">{formatCurrency(result.currentPrice)}</p></div>
        <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-gray-500 mb-0.5">Invested</p><p className="text-gray-800 font-semibold">{formatCurrency(result.investmentAmount)}</p></div>
      </div>

      <div className={`mt-4 text-sm font-medium ${plColor} bg-slate-50 rounded-xl p-3 border border-gray-200`}>
        {isProfit
          ? `Your ${formatCurrency(result.investmentAmount)} grew to ${formatCurrency(result.currentValue)} — a ${formatPercent(result.percentReturn)} return.`
          : `Your ${formatCurrency(result.investmentAmount)} would be worth ${formatCurrency(result.currentValue)} today — a ${formatPercent(result.percentReturn)} loss.`}
      </div>
    </div>
  );
}
