"use client";

import { Trend } from "@/lib/indicators";
import { ChartTrend } from "@/lib/marketData/trend";
import { LEVEL_RULES } from "@/lib/marketData/levels";
import PanelCard, { HowItWorks } from "./PanelCard";
import { formatBarTime } from "./drawing";

const TONE: Record<Trend, string> = { Uptrend: "text-[#00B341]", Downtrend: "text-[#F04E23]", Mixed: "text-[#525252]" };

function Verdict({ trend }: { trend: Trend }) {
  return <span className={`font-semibold ${TONE[trend]}`}>{trend}</span>;
}

/** The trend of the bars on screen, with the two reads it is based on */
export default function TrendCard({
  trend,
  times,
  intraday,
  timeframeLabel,
  price,
}: {
  trend: ChartTrend;
  times: readonly number[];
  intraday: boolean;
  timeframeLabel: string;
  price: (v: number) => string;
}) {
  const { averages: ma, structure: st } = trend;
  const when = (i: number) => formatBarTime(times[i], intraday);
  const side = (a: number, b: number) => (a > b ? "above" : a < b ? "below" : "level with");
  const move = (a: number, b: number) => (b > a ? "higher" : b < a ? "lower" : "level");
  const [fastN, slowN] = ma?.basis === "20/50" ? [20, 50] : [50, 200];

  return (
    <PanelCard title="Trend" aside={`${timeframeLabel} bars`}>
      {trend.trend === null ? (
        <p className="text-[13px] text-[#525252]">Not enough bars to read a trend yet.</p>
      ) : (
        <>
          <p className="text-[20px] leading-tight"><Verdict trend={trend.trend} /></p>
          <p className="text-[12px] text-[#525252] mt-1">
            {ma && st
              ? ma.trend === st.trend ? "Both reads below agree." : "The two reads below disagree, so the trend is mixed."
              : "Only one of the two reads is possible with this much history."}
          </p>
        </>
      )}

      <dl className="mt-3 space-y-2.5 text-[12px]">
        <div>
          <dt className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[#0A0A0A]">Moving averages</span>
            {ma && <Verdict trend={ma.trend} />}
          </dt>
          <dd className="text-[#525252] mt-0.5 tabular-nums">
            {ma
              ? `Price ${price(ma.price)} is ${side(ma.price, ma.fast)} SMA ${fastN} (${price(ma.fast)}), which is ${side(ma.fast, ma.slow)} SMA ${slowN} (${price(ma.slow)}).`
              : "Needs at least 50 bars."}
          </dd>
        </div>
        <div>
          <dt className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[#0A0A0A]">Swing structure</span>
            {st && <Verdict trend={st.trend} />}
          </dt>
          <dd className="text-[#525252] mt-0.5 tabular-nums">
            {st ? (
              <>
                Highs {price(st.highs[0].price)} ({when(st.highs[0].index)}) → {price(st.highs[1].price)} ({when(st.highs[1].index)}),{" "}
                {move(st.highs[0].price, st.highs[1].price)}. Lows {price(st.lows[0].price)} ({when(st.lows[0].index)}) →{" "}
                {price(st.lows[1].price)} ({when(st.lows[1].index)}), {move(st.lows[0].price, st.lows[1].price)}.
              </>
            ) : (
              "Needs two confirmed swing highs and two swing lows."
            )}
          </dd>
        </div>
      </dl>

      <HowItWorks>
        <p>
          <b>Moving averages:</b> an uptrend when price is above the faster average and the faster is above the slower one;
          a downtrend when both are the other way round. Uses SMA 50 and 200, or SMA 20 and 50 when there are fewer than 200 bars.
          The research page uses the same rule on daily bars.
        </p>
        <p>
          <b>Swing structure:</b> compares the last two swing highs and the last two swing lows. Higher highs and higher lows
          are an uptrend; lower highs and lower lows a downtrend. A swing high is a bar whose high is the highest within{" "}
          {LEVEL_RULES.pivotBars} bars either side, so the latest one is only confirmed {LEVEL_RULES.pivotBars} bars later.
        </p>
        <p>The trend is called only when both reads agree. It describes the past, not where price goes next.</p>
      </HowItWorks>
    </PanelCard>
  );
}
