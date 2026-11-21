import { describe, expect, it } from "vitest";
import { CALENDAR_ENDS, ECONOMIC_EVENTS, calendarNotice } from "./economicEvents";
import { addDays, isIsoDate } from "./historicalPrice";

const weekday = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

describe("economic calendar data", () => {
  it("has real dates in order, so 'next event' lookups can take the first future one", () => {
    for (const e of ECONOMIC_EVENTS) expect(isIsoDate(e.date), e.date).toBe(true);
    const dates = ECONOMIC_EVENTS.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("only lists releases on weekdays", () => {
    for (const e of ECONOMIC_EVENTS) expect([0, 6], `${e.name} on ${e.date}`).not.toContain(weekday(e.date));
  });

  it("has no duplicate releases", () => {
    const keys = ECONOMIC_EVENTS.map((e) => `${e.date} ${e.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("pairs every FOMC decision with the meeting's first day, the day before", () => {
    const decisions = ECONOMIC_EVENTS.filter((e) => e.name === "FOMC Rate Decision");
    const firstDays = ECONOMIC_EVENTS.filter((e) => e.name === "FOMC Meeting (Day 1)");
    expect(decisions.length).toBe(firstDays.length);
    for (const d of decisions) expect(firstDays.some((f) => addDays(f.date, 1) === d.date), d.date).toBe(true);
  });

  it("ends on the last listed date", () => {
    expect(CALENDAR_ENDS).toBe(ECONOMIC_EVENTS[ECONOMIC_EVENTS.length - 1].date);
  });
});

describe("calendarNotice", () => {
  it("says nothing while the list reaches past the window", () => {
    expect(calendarNotice("2027-01-01", 30, "2027-04-29")).toBeNull();
    expect(calendarNotice("2027-03-29", 30, "2027-04-29")).toBeNull(); // 31 days left
  });

  it("warns when the list ends inside the window", () => {
    const m = calendarNotice("2027-04-10", 30, "2027-04-29");
    expect(m).toContain("only listed up to Apr 29, 2027");
    expect(calendarNotice("2027-04-29", 30, "2027-04-29")).toContain("only listed up to");
  });

  it("says the list has ended once it's in the past", () => {
    expect(calendarNotice("2026-11-21", 30, "2026-10-28")).toContain("ended on Oct 28, 2026");
  });
});
