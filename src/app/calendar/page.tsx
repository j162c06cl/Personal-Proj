"use client";

import { useState, useMemo } from "react";
import { ECONOMIC_EVENTS as EVENTS, EconomicEvent } from "@/lib/economicEvents";

type CalEvent = EconomicEvent;
type Filter = "all" | "high";

const CATEGORY_CONFIG: Record<string, { label: string; pill: string }> = {
  employment: { label: "Employment",   pill: "bg-blue-50 text-blue-700 border-blue-200" },
  inflation:  { label: "Inflation",    pill: "bg-orange-50 text-orange-700 border-orange-200" },
  fed:        { label: "Fed / FOMC",   pill: "bg-purple-50 text-purple-700 border-purple-200" },
  growth:     { label: "GDP / Growth", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  consumer:   { label: "Consumer",     pill: "bg-teal-50 text-teal-700 border-teal-200" },
};

function importancePill(imp: string) {
  if (imp === "high")   return "bg-[#FEF2F2] text-[#EF4444] border-[#FECACA]";
  if (imp === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-[#F7F7F8] text-[#525252] border-[#E5E5E5]";
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateStr: string, today: Date): number {
  return Math.round((new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86400000);
}

function countdownLabel(days: number): string | null {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days >= 2 && days <= 6) return `In ${days} days`;
  return null;
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
  const [calYear, setCalYear]   = useState(() => today.getFullYear());
  const [calMonth, setCalMonth] = useState(() => today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Per-date metadata for calendar dots
  const eventMap = useMemo(() => {
    const m: Record<string, { importance: string; count: number }> = {};
    EVENTS.forEach((e) => {
      if (!m[e.date]) m[e.date] = { importance: "medium", count: 0 };
      if (e.importance === "high") m[e.date].importance = "high";
      m[e.date].count++;
    });
    return m;
  }, []);

  // Next upcoming event (ignores filter — always shows the real next event)
  const nextEvent = useMemo(
    () => EVENTS.find(e => daysUntil(e.date, today) >= 0),
    [today]
  );

  // Calendar grid helpers
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth     = new Date(calYear, calMonth + 1, 0).getDate();
  const calMonthLabel   = new Date(calYear, calMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isCurrentMonth  = calYear === today.getFullYear() && calMonth === today.getMonth();

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    setSelectedDate(null);
  }
  function goToToday() {
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setSelectedDate(null);
  }

  function calDateStr(day: number) {
    return `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function handleDayClick(day: number) {
    const ds = calDateStr(day);
    setSelectedDate(prev => prev === ds ? null : ds);
  }

  // Filtered + grouped events for the list
  const { baseEvents, groups } = useMemo(() => {
    if (selectedDate) {
      // Show all events on selected date (including past)
      const base = EVENTS.filter(e => e.date === selectedDate);
      return { baseEvents: base, groups: null };
    }

    const base = EVENTS.filter(e => {
      const d = daysUntil(e.date, today);
      return d >= 0 && (filter === "all" || e.importance === "high");
    });

    const todayEvts = base.filter(e => daysUntil(e.date, today) === 0);
    const weekEvts  = base.filter(e => { const d = daysUntil(e.date, today); return d >= 1 && d <= 6; });
    const laterEvts = base.filter(e => daysUntil(e.date, today) >= 7);

    const g: { key: string; label: string; events: CalEvent[] }[] = [];
    if (todayEvts.length > 0) g.push({ key: "today", label: "Today",     events: todayEvts });
    if (weekEvts.length  > 0) g.push({ key: "week",  label: "This Week", events: weekEvts });

    const byMonth: Record<string, CalEvent[]> = {};
    laterEvts.forEach(e => {
      const key = e.date.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(e);
    });
    Object.entries(byMonth).forEach(([ym, evs]) =>
      g.push({ key: ym, label: fmtMonth(ym), events: evs })
    );

    return { baseEvents: base, groups: g };
  }, [selectedDate, filter, today]);

  const selectedDays = selectedDate ? daysUntil(selectedDate, today) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
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

      {/* Next release banner */}
      {nextEvent && !selectedDate && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-white border border-[#E5E5E5] rounded-2xl">
          <div className="w-9 h-9 shrink-0 bg-[#EBF2FF] rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-[#1F65F0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-[#1F65F0] uppercase tracking-wider mb-0.5">Next Release</p>
            <p className="text-[13px] font-semibold text-[#0A0A0A] truncate">{nextEvent.name}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[12px] text-[#525252]">{fmtDate(nextEvent.date)}</p>
            {(() => {
              const lbl = countdownLabel(daysUntil(nextEvent.date, today));
              return lbl ? <p className="text-[12px] font-semibold text-[#1F65F0]">{lbl}</p> : null;
            })()}
          </div>
        </div>
      )}

      {/* Calendar widget */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5 mb-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#525252] hover:bg-[#F7F7F8] hover:text-[#0A0A0A] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-[#0A0A0A]">{calMonthLabel}</span>
            {!isCurrentMonth && (
              <button
                onClick={goToToday}
                className="text-[11px] text-[#1F65F0] font-semibold px-2 py-0.5 rounded-md bg-[#EBF2FF] hover:bg-[#DBE9FF] transition-colors"
              >
                Today
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#525252] hover:bg-[#F7F7F8] hover:text-[#0A0A0A] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Combined header + date grid with grid lines */}
        <div className="grid grid-cols-7 border-l border-t border-[#EBEBEB] rounded-lg overflow-hidden">
          {/* Day-of-week headers */}
          {DAY_LABELS.map((d) => (
            <div key={d} className="border-r border-b border-[#EBEBEB] bg-[#FAFAFA] text-center text-[11px] font-semibold text-[#A3A3A3] py-2 uppercase tracking-wider">{d}</div>
          ))}
          {/* Empty cells before first day */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`e-${i}`} className="border-r border-b border-[#EBEBEB]" />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day        = i + 1;
            const ds         = calDateStr(day);
            const isToday    = ds === todayStr;
            const isSelected = ds === selectedDate;
            const info       = eventMap[ds];
            const isPast     = new Date(ds + "T00:00:00") < today;

            return (
              <div
                key={day}
                onClick={() => info && handleDayClick(day)}
                className={`border-r border-b border-[#EBEBEB] relative flex flex-col items-center py-2 transition-colors
                  ${info ? "cursor-pointer" : "cursor-default"}
                  ${isSelected ? "bg-[#1F65F0]" : isToday ? "bg-[#EBF2FF]" : info ? "hover:bg-[#F7F7F8]" : ""}
                `}
              >
                <span className={`text-[13px] font-medium leading-none
                  ${isSelected ? "text-white" : isToday ? "text-[#1F65F0] font-bold" : isPast ? "text-[#D4D4D4]" : "text-[#0A0A0A]"}
                `}>
                  {day}
                </span>
                {info && (
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full
                    ${isSelected ? "bg-white" : isPast ? "bg-[#D4D4D4]" : info.importance === "high" ? "bg-[#EF4444]" : "bg-amber-400"}
                  `} />
                )}
                {/* Multi-event count badge */}
                {info && info.count > 1 && (
                  <span className={`absolute top-0 right-1 text-[9px] font-bold leading-none
                    ${isSelected ? "text-white/70" : isPast ? "text-[#D4D4D4]" : "text-[#A3A3A3]"}
                  `}>
                    {info.count}
                  </span>
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
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] font-bold text-[#A3A3A3]">2</span>
            <span className="text-[11px] text-[#525252]">Multiple events</span>
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
            {fmtDate(selectedDate)}
            {selectedDays !== null && selectedDays < 0 && (
              <span className="ml-2 text-[11px] font-normal text-[#6B96E8]">· Past</span>
            )}
            {selectedDays === 0 && (
              <span className="ml-2 text-[11px] font-normal text-[#6B96E8]">· Today</span>
            )}
          </span>
          <button onClick={() => setSelectedDate(null)} className="text-[12px] text-[#1F65F0] font-semibold hover:underline">
            Show all
          </button>
        </div>
      )}

      {/* Event list */}
      {selectedDate ? (
        baseEvents.length === 0 ? (
          <div className="text-center py-16 text-[#525252] text-[13px]">No events on {fmtDate(selectedDate)}.</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {baseEvents.map((e, i) => <EventCard key={i} event={e} today={today} />)}
          </div>
        )
      ) : (
        !groups || groups.length === 0 ? (
          <div className="text-center py-16 text-[#525252] text-[13px]">No upcoming events match your filter.</div>
        ) : (
          groups.map(group => (
            <div key={group.key} className="mb-8">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#E5E5E5]">
                <h2 className="text-[15px] font-semibold text-[#0A0A0A]">{group.label}</h2>
                <span className="text-[12px] text-[#A3A3A3]">
                  {group.events.length} event{group.events.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {group.events.map((e, i) => <EventCard key={i} event={e} today={today} />)}
              </div>
            </div>
          ))
        )
      )}

      <p className="text-[11px] text-[#525252] mt-4 text-center">
        Dates are approximate based on historical US economic calendar patterns. Always verify with official sources.
      </p>
    </div>
  );
}

function EventCard({ event: e, today }: { event: CalEvent; today: Date }) {
  const days      = daysUntil(e.date, today);
  const isPast    = days < 0;
  const label     = countdownLabel(days);
  const catConfig = CATEGORY_CONFIG[e.category];

  return (
    <div className={`flex items-start gap-4 rounded-2xl p-4 border ${
      days === 0
        ? "bg-[#EBF2FF] border-[#1F65F0]/20"
        : isPast
        ? "bg-[#F7F7F8] border-[#E5E5E5] opacity-60"
        : "bg-white border-[#E5E5E5]"
    }`}>
      <div className="shrink-0 min-w-[80px]">
        <p className={`text-[11px] font-semibold ${isPast ? "text-[#A3A3A3]" : "text-[#0A0A0A]"}`}>{fmtDate(e.date)}</p>
        <p className="text-[11px] text-[#525252] mt-0.5">{e.time}</p>
        {label && (
          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-snug ${
            label === "Today"
              ? "bg-[#1F65F0] text-white"
              : "bg-[#EBF2FF] text-[#1F65F0]"
          }`}>
            {label}
          </span>
        )}
        {isPast && (
          <span className="inline-block mt-1 text-[10px] text-[#A3A3A3] font-medium">Past</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold mb-1 ${isPast ? "text-[#525252]" : "text-[#0A0A0A]"}`}>{e.name}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${importancePill(e.importance)}`}>
            {e.importance === "high" ? "High" : "Medium"}
          </span>
          {catConfig && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${catConfig.pill}`}>
              {catConfig.label}
            </span>
          )}
        </div>
        <p className={`text-[11px] ${isPast ? "text-[#A3A3A3]" : "text-[#525252]"}`}>{e.description}</p>
      </div>
    </div>
  );
}
