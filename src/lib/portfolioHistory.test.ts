import { describe, expect, it } from "vitest";
import { buildGrowthSeries, periodGain, rangeCovering } from "./portfolioHistory";

const prices = {
  AAA: [{ t: "2026-01-02", c: 10 }, { t: "2026-01-05", c: 11 }, { t: "2026-01-06", c: 12 }],
  BBB: [{ t: "2026-01-02", c: 50 }, { t: "2026-01-06", c: 55 }],
};

describe("buildGrowthSeries", () => {
  it("counts each position only from its purchase date", () => {
    const pts = buildGrowthSeries(
      [
        { ticker: "AAA", quantity: 10, purchasePrice: 10, purchaseDate: "2026-01-02" },
        { ticker: "BBB", quantity: 2, purchasePrice: 52, purchaseDate: "2026-01-05" },
      ],
      prices
    );
    expect(pts.map((p) => p.t)).toEqual(["2026-01-02", "2026-01-05", "2026-01-06"]);
    expect(pts[0]).toEqual({ t: "2026-01-02", value: 100, invested: 100 });
    // BBB has no close on 01-05, so it carries 01-02's close forward
    expect(pts[1]).toEqual({ t: "2026-01-05", value: 110 + 100, invested: 100 + 104 });
    expect(pts[2]).toEqual({ t: "2026-01-06", value: 120 + 110, invested: 204 });
  });

  it("values a ticker with no history at its purchase price", () => {
    const pts = buildGrowthSeries([{ ticker: "ZZZ", quantity: 3, purchasePrice: 7, purchaseDate: "2026-01-01" }], prices);
    expect(pts.every((p) => p.value === 21 && p.invested === 21)).toBe(true);
  });

  it("appends today's live point after the last close", () => {
    const pts = buildGrowthSeries(
      [{ ticker: "AAA", quantity: 1, purchasePrice: 10, purchaseDate: "2026-01-02" }],
      prices,
      { latest: { AAA: 13 }, today: "2026-01-07" }
    );
    expect(pts.at(-1)).toEqual({ t: "2026-01-07", value: 13, invested: 10 });
  });
});

describe("periodGain", () => {
  it("excludes money added during the period", () => {
    expect(periodGain([
      { t: "a", value: 100, invested: 100 },
      { t: "b", value: 230, invested: 204 },
    ])).toBe(26);
  });
});

describe("rangeCovering", () => {
  it("picks the shortest range that reaches back far enough", () => {
    const now = new Date("2026-10-11T00:00:00");
    expect(rangeCovering("2026-09-20", now)).toBe("1mo");
    expect(rangeCovering("2026-03-01", now)).toBe("1y");
    expect(rangeCovering("2022-01-03", now)).toBe("5y");
  });
});
