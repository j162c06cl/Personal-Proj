"use client";

import { useState } from "react";

const EVENTS = [
  // June 2026
  { date: "2026-06-26", time: "08:30 ET", name: "GDP (Q1 Final)",            importance: "high",   description: "Final estimate of Q1 2026 US economic growth rate" },
  { date: "2026-06-27", time: "08:30 ET", name: "PCE Price Index (May)",      importance: "high",   description: "The Federal Reserve's preferred measure of inflation" },
  // July 2026
  { date: "2026-07-02", time: "08:30 ET", name: "Non-Farm Payrolls (Jun)",    importance: "high",   description: "New jobs added to the US economy in June 2026" },
  { date: "2026-07-09", time: "08:30 ET", name: "Initial Jobless Claims",     importance: "medium", description: "Weekly new unemployment benefit filings" },
  { date: "2026-07-14", time: "08:30 ET", name: "PPI (Jun)",                  importance: "medium", description: "June 2026 Producer Price Index — wholesale inflation" },
  { date: "2026-07-15", time: "08:30 ET", name: "CPI (Jun)",                  importance: "high",   description: "June 2026 Consumer Price Index — key inflation reading" },
  { date: "2026-07-15", time: "08:30 ET", name: "Retail Sales (Jun)",         importance: "medium", description: "Monthly change in US retail sector spending" },
  { date: "2026-07-25", time: "08:30 ET", name: "PCE Price Index (Jun)",      importance: "high",   description: "Fed's preferred inflation measure for June 2026" },
  { date: "2026-07-28", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-07-29", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   description: "Fed interest rate decision and Chair press conference" },
  { date: "2026-07-30", time: "08:30 ET", name: "GDP (Q2 Advance)",           importance: "high",   description: "First advance estimate of Q2 2026 US economic growth" },
  // August 2026
  { date: "2026-08-07", time: "08:30 ET", name: "Non-Farm Payrolls (Jul)",    importance: "high",   description: "New jobs added to the US economy in July 2026" },
  { date: "2026-08-12", time: "08:30 ET", name: "CPI (Jul)",                  importance: "high",   description: "July 2026 Consumer Price Index" },
  { date: "2026-08-13", time: "08:30 ET", name: "PPI (Jul)",                  importance: "medium", description: "July 2026 Producer Price Index" },
  { date: "2026-08-13", time: "08:30 ET", name: "Retail Sales (Jul)",         importance: "medium", description: "Monthly change in US retail sector spending" },
  { date: "2026-08-28", time: "08:30 ET", name: "PCE Price Index (Jul)",      importance: "high",   description: "Fed's preferred inflation measure for July 2026" },
  // September 2026
  { date: "2026-09-04", time: "08:30 ET", name: "Non-Farm Payrolls (Aug)",    importance: "high",   description: "New jobs added to the US economy in August 2026" },
  { date: "2026-09-10", time: "08:30 ET", name: "CPI (Aug)",                  importance: "high",   description: "August 2026 Consumer Price Index" },
  { date: "2026-09-11", time: "08:30 ET", name: "PPI (Aug)",                  importance: "medium", description: "August 2026 Producer Price Index" },
  { date: "2026-09-15", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-09-16", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   description: "Fed interest rate decision and Chair press conference" },
  { date: "2026-09-25", time: "08:30 ET", name: "GDP (Q2 Second Estimate)",   importance: "high",   description: "Second estimate of Q2 2026 US economic growth" },
  { date: "2026-09-26", time: "08:30 ET", name: "PCE Price Index (Aug)",      importance: "high",   description: "Fed's preferred inflation measure for August 2026" },
  // October 2026
  { date: "2026-10-02", time: "08:30 ET", name: "Non-Farm Payrolls (Sep)",    importance: "high",   description: "New jobs added to the US economy in September 2026" },
  { date: "2026-10-13", time: "08:30 ET", name: "CPI (Sep)",                  importance: "high",   description: "September 2026 Consumer Price Index" },
  { date: "2026-10-14", time: "08:30 ET", name: "PPI (Sep)",                  importance: "medium", description: "September 2026 Producer Price Index" },
  { date: "2026-10-27", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-10-28", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   description: "Fed interest rate decision and Chair press conference" },
];

type Filter = "all" | "high";

function importancePill(imp: string) {
  if (imp === "high")   return "bg-[#fff0f0] text-[#ff3b30] border border-[rgba(255,59,48,0.15)]";
  if (imp === "medium") return "bg-amber-50 text-amber-700 border border-amber-200/60";
  return "bg-black/[0.05] text-[#6e6e73] border border-black/[0.06]";
}

function getDays(d: string): number {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86400000);
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupByMonth(events: typeof EVENTS) {
  return events.reduce<Record<string, typeof EVENTS>>((acc, e) => {
    const key = e.date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
}

export default function CalendarPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = EVENTS
    .filter((e) => getDays(e.date) >= 0)
    .filter((e) => filter === "all" || e.importance === "high");

  const grouped = groupByMonth(filtered);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#1d1d1f]">Economic Calendar</h1>
          <p className="text-[13px] text-[#6e6e73] mt-1">Upcoming US economic data releases and Federal Reserve decisions</p>
        </div>
        <div className="flex gap-2">
          {(["all", "high"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-all duration-150 ${
                filter === f
                  ? "bg-[#0071e3] text-white"
                  : "bg-black/[0.05] text-[#1d1d1f] hover:bg-black/[0.08]"
              }`}>
              {f === "all" ? "All Events" : "High Impact Only"}
            </button>
          ))}
        </div>
      </div>

      {Object.entries(grouped).length === 0 && (
        <div className="text-center py-16 text-[#6e6e73] text-[13px]">No upcoming events match your filter.</div>
      )}

      {Object.entries(grouped).map(([ym, events]) => (
        <div key={ym} className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-3 pb-2 border-b border-black/[0.08]">{fmtMonth(ym)}</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {events.map((e, i) => {
              const days = getDays(e.date);
              const isToday = days === 0;
              return (
                <div key={i} className={`flex items-start gap-4 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)] ${isToday ? "bg-[#e8f2ff]" : "bg-white"}`}>
                  <div className="shrink-0 min-w-[80px]">
                    <p className="text-[11px] font-semibold text-[#1d1d1f]">{fmtDate(e.date)}</p>
                    <p className="text-[11px] text-[#6e6e73] mt-0.5">{e.time}</p>
                    {isToday
                      ? <span className="inline-block mt-1 text-[10px] bg-[#0071e3] text-white px-1.5 py-0.5 rounded-full font-semibold">Today</span>
                      : days <= 7
                        ? <span className="text-[11px] text-[#0071e3] font-semibold mt-0.5 block">{days}d away</span>
                        : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="text-[13px] font-semibold text-[#1d1d1f]">{e.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${importancePill(e.importance)}`}>
                        {e.importance.charAt(0).toUpperCase() + e.importance.slice(1)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6e6e73]">{e.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-[11px] text-[#6e6e73] mt-4 text-center">
        Dates are approximate based on historical US economic calendar patterns. Always verify with official sources.
      </p>
    </div>
  );
}
