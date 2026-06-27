"use client";

import { useState, useMemo } from "react";

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
  if (imp === "high")   return "bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA]";
  if (imp === "medium") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-[#F7F7F8] text-[#525252] border border-[#E5E5E5]";
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

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = useMemo(() => toDateStr(today), [today]);

  const [filter, setFilter] = useState<Filter>("all");
  const [calYear, setCalYear] = useState(() => today.getFullYear());
  const [calMonth, setCalMonth] = useState(() => today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Map of date string → highest importance on that date
  const eventMap = useMemo(() => {
    const m: Record<string, string> = {};
    EVENTS.forEach((e) => {
      if (!m[e.date] || (e.importance === "high")) m[e.date] = e.importance;
    });
    return m;
  }, []);

  // Calendar grid
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    setSelectedDate(null);
  }

  function dateStr(day: number) {
    return `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function handleDayClick(day: number) {
    const ds = dateStr(day);
    setSelectedDate((prev) => (prev === ds ? null : ds));
  }

  function getDays(d: string): number {
    return Math.round((new Date(d + "T00:00:00").getTime() - today.getTime()) / 86400000);
  }

  // Filtered events for the list
  const filtered = EVENTS
    .filter((e) => getDays(e.date) >= 0)
    .filter((e) => filter === "all" || e.importance === "high")
    .filter((e) => !selectedDate || e.date === selectedDate);

  const grouped = groupByMonth(filtered);

  const calMonthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Economic Calendar</h1>
          <p className="text-[14px] text-[#525252] mt-1">Upcoming US economic data releases and Federal Reserve decisions</p>
        </div>
        <div className="flex gap-2">
          {(["all", "high"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
                filter === f
                  ? "bg-[#1F65F0] text-white"
                  : "bg-white text-[#525252] border border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
              }`}>
              {f === "all" ? "All Events" : "High Impact Only"}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar widget */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5 mb-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#525252] hover:bg-[#F7F7F8] hover:text-[#0A0A0A] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[15px] font-semibold text-[#0A0A0A]">{calMonthLabel}</span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#525252] hover:bg-[#F7F7F8] hover:text-[#0A0A0A] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-[#A3A3A3] py-1 uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const ds = dateStr(day);
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            const eventImp = eventMap[ds];
            const isPast = new Date(ds + "T00:00:00") < today;

            return (
              <div
                key={day}
                onClick={() => eventImp && !isPast && handleDayClick(day)}
                className={`relative flex flex-col items-center py-1.5 rounded-xl transition-colors
                  ${eventImp && !isPast ? "cursor-pointer" : "cursor-default"}
                  ${isSelected ? "bg-[#1F65F0]" : isToday ? "bg-[#EBF2FF]" : eventImp && !isPast ? "hover:bg-[#F7F7F8]" : ""}
                `}
              >
                <span className={`text-[13px] font-medium leading-none
                  ${isSelected ? "text-white" : isToday ? "text-[#1F65F0] font-bold" : isPast ? "text-[#D4D4D4]" : "text-[#0A0A0A]"}
                `}>
                  {day}
                </span>
                {/* Event dot */}
                {eventImp && (
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full
                    ${isSelected ? "bg-white" : eventImp === "high" ? "bg-[#EF4444]" : "bg-amber-400"}
                  `} />
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#F0F0F0]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="text-[11px] text-[#525252]">High impact</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[11px] text-[#525252]">Medium impact</span>
          </div>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="ml-auto text-[11px] text-[#1F65F0] font-semibold hover:underline">
              Clear selection
            </button>
          )}
        </div>
      </div>

      {/* Selected date banner */}
      {selectedDate && (
        <div className="mb-4 px-4 py-3 bg-[#EBF2FF] border border-[#1F65F0]/20 rounded-xl flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1F65F0]">
            Showing events for {fmtDate(selectedDate)}
          </span>
          <button onClick={() => setSelectedDate(null)} className="text-[12px] text-[#1F65F0] font-semibold hover:underline">
            Show all
          </button>
        </div>
      )}

      {/* Event list */}
      {Object.entries(grouped).length === 0 ? (
        <div className="text-center py-16 text-[#525252] text-[13px]">
          {selectedDate
            ? `No ${filter === "high" ? "high impact " : ""}events on ${fmtDate(selectedDate)}.`
            : "No upcoming events match your filter."}
        </div>
      ) : (
        Object.entries(grouped).map(([ym, events]) => (
          <div key={ym} className="mb-8">
            <h2 className="text-[15px] font-semibold text-[#0A0A0A] mb-3 pb-2 border-b border-[#E5E5E5]">{fmtMonth(ym)}</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {events.map((e, i) => {
                const days = getDays(e.date);
                const isToday = days === 0;
                return (
                  <div key={i} className={`flex items-start gap-4 rounded-2xl p-4 border ${isToday ? "bg-[#EBF2FF] border-[#1F65F0]/20" : "bg-white border-[#E5E5E5]"}`}>
                    <div className="shrink-0 min-w-[80px]">
                      <p className="text-[11px] font-semibold text-[#0A0A0A]">{fmtDate(e.date)}</p>
                      <p className="text-[11px] text-[#525252] mt-0.5">{e.time}</p>
                      {isToday
                        ? <span className="inline-block mt-1 text-[10px] bg-[#1F65F0] text-white px-1.5 py-0.5 rounded-full font-semibold">Today</span>
                        : days <= 7
                          ? <span className="text-[11px] text-[#1F65F0] font-semibold mt-0.5 block">{days}d away</span>
                          : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <p className="text-[13px] font-semibold text-[#0A0A0A]">{e.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${importancePill(e.importance)}`}>
                          {e.importance.charAt(0).toUpperCase() + e.importance.slice(1)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#525252]">{e.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <p className="text-[11px] text-[#525252] mt-4 text-center">
        Dates are approximate based on historical US economic calendar patterns. Always verify with official sources.
      </p>
    </div>
  );
}
