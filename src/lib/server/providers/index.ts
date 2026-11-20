import { CandleProvider } from "@/lib/marketData/types";
import { yahooCandles } from "./yahooCandles";

/**
 * The one place that decides where chart candles come from. To add a provider (e.g. Twelve
 * Data with an API key), implement CandleProvider in this folder and choose it here.
 */
export const candleProvider: CandleProvider = yahooCandles;
