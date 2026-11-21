import { describe, expect, it } from "vitest";
import { addDays, closeOnOrAfter, isIsoDate } from "./historicalPrice";

const closes = [
  { date: "2025-02-27", close: 100 }, // Thu
  { date: "2025-02-28", close: 101 }, // Fri
  { date: "2025-03-03", close: 102 }, // Mon
  { date: "2025-03-04", close: 103 },
];

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2025-03-03")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2025-13-01")).toBe(false);
    expect(isIsoDate("2025-3-3")).toBe(false);
    expect(isIsoDate("20250303")).toBe(false);
    expect(isIsoDate("2025-03-03&x=1")).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2025-02-27", 2)).toBe("2025-03-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
  });
});

describe("closeOnOrAfter", () => {
  it("uses the close of the date itself when it traded", () => {
    expect(closeOnOrAfter(closes, "2025-02-28")).toEqual({ date: "2025-02-28", close: 101 });
  });

  it("moves a weekend date to the next trading day, never back to the Friday", () => {
    expect(closeOnOrAfter(closes, "2025-03-01")).toEqual({ date: "2025-03-03", close: 102 });
  });

  it("gives up when nothing traded within the gap", () => {
    expect(closeOnOrAfter(closes, "2025-03-05")).toBeNull();
    expect(closeOnOrAfter([{ date: "2025-03-20", close: 5 }], "2025-03-01")).toBeNull(); // 19 days later
    expect(closeOnOrAfter([{ date: "2025-03-08", close: 5 }], "2025-03-01")).toEqual({ date: "2025-03-08", close: 5 }); // 7 days
  });

  it("doesn't depend on the order of the closes", () => {
    expect(closeOnOrAfter([...closes].reverse(), "2025-03-01")?.date).toBe("2025-03-03");
  });

  it("skips missing or zero prices", () => {
    expect(closeOnOrAfter([{ date: "2025-03-03", close: NaN }, { date: "2025-03-04", close: 0 }, { date: "2025-03-05", close: 9 }], "2025-03-03"))
      .toEqual({ date: "2025-03-05", close: 9 });
  });
});
