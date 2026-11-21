import { describe, expect, it } from "vitest";
import { inferDirection, planFromSetup, planMetrics, sanitizePlans, sharesForRisk } from "./tradePlan";

const round = (v: number) => Number(v.toFixed(2));

describe("planMetrics", () => {
  it("works out risk, reward and distances for a long trade", () => {
    const m = planMetrics({ direction: "long", entry: 100, stop: 95, target: 115, shares: 40 });
    expect(m.problems).toEqual([]);
    expect(m.riskPerShare).toBe(5);
    expect(m.rewardPerShare).toBe(15);
    expect(m.rewardRisk).toBe(3);
    expect(m.stopPct).toBe(5);
    expect(m.targetPct).toBe(15);
    expect(m.breakEvenWinRate).toBe(25);
    expect([m.loss, m.profit, m.positionValue]).toEqual([200, 600, 4000]);
  });

  it("works for a short trade", () => {
    const m = planMetrics({ direction: "short", entry: 50, stop: 52, target: 44, shares: null });
    expect(m.problems).toEqual([]);
    expect(m.rewardRisk).toBe(3);
    expect(m.stopPct).toBe(4);
    expect(m.targetPct).toBe(12);
    expect(m.loss).toBeNull();
  });

  it("explains a stop or target on the wrong side", () => {
    expect(planMetrics({ direction: "long", entry: 100, stop: 101, target: 99, shares: null }).problems).toEqual([
      "For a long trade the stop must be below the entry.",
      "For a long trade the target must be above the entry.",
    ]);
    expect(planMetrics({ direction: "short", entry: 100, stop: 95, target: 110, shares: null }).problems).toHaveLength(2);
    expect(planMetrics({ direction: "long", entry: 100, stop: 100, target: 110, shares: null }).rewardRisk).toBeNull();
  });

  it("asks for missing or impossible numbers", () => {
    const m = planMetrics({ direction: "long", entry: null, stop: -1, target: 10, shares: 0 });
    expect(m.problems).toEqual([
      "Enter an entry price above zero.",
      "Enter a stop-loss price above zero.",
      "Shares must be more than zero, or left blank.",
    ]);
    expect(m.riskPerShare).toBeNull();
  });
});

describe("helpers", () => {
  it("sizes a position from the risk budget, in whole shares", () => {
    expect(sharesForRisk(100, 2.5)).toBe(40);
    expect(sharesForRisk(100, 3)).toBe(33);
    expect(sharesForRisk(1, 3)).toBe(0);
    expect(sharesForRisk(100, 0)).toBe(0);
  });

  it("infers the direction from where stop and target sit", () => {
    expect(inferDirection(100, 95, 110)).toBe("long");
    expect(inferDirection(100, 105, 90)).toBe("short");
  });
});

describe("planFromSetup", () => {
  it("uses the latest close, the invalidation level and the nearest resistance above", () => {
    const p = planFromSetup({ lastClose: 100.004, invalidation: 96.5, resistanceAbove: [120, 108.25, 99], round });
    expect(p).toMatchObject({ entry: 100, stop: 96.5, target: 108.25 });
    expect(p.why).toEqual(["Entry: the latest close.", "Stop: the setup's invalidation level.", "Target: the nearest detected resistance above the entry."]);
  });

  it("falls back to twice the risk when there's no resistance above", () => {
    expect(planFromSetup({ lastClose: 100, invalidation: 95, resistanceAbove: [], round })).toMatchObject({ target: 110 });
  });

  it("says when the setup has no price stop or is already invalidated", () => {
    const none = planFromSetup({ lastClose: 100, invalidation: null, resistanceAbove: [], round });
    expect(none.stop).toBeNull();
    expect(none.target).toBeNull();
    expect(none.why.join(" ")).toMatch(/set your own/);
    const broken = planFromSetup({ lastClose: 100, invalidation: 103, resistanceAbove: [110], round });
    expect(broken.why[1]).toMatch(/already at or above the latest close/);
  });
});

describe("sanitizePlans", () => {
  const good = {
    id: "p1", ticker: "AAPL", currency: "USD", direction: "long", entry: 100, stop: 95, target: 110, shares: 10,
    note: "x", createdAt: "2026-11-20T15:00:00.000Z", updatedAt: "2026-11-20T15:00:00.000Z", startTime: 1, source: { setup: "breakout", detected: "Nov 20, 2026" },
  };
  it("keeps valid plans and drops broken ones", () => {
    const out = sanitizePlans([
      good,
      { ...good, id: "p2", stop: 120 }, // stop above entry on a long
      { ...good, id: "p3", ticker: "bad ticker" },
      { ...good, id: "p4", direction: "sideways" },
      { ...good, id: "p5", shares: -3, source: { setup: "moonshot", detected: "x" } },
      null,
    ]);
    expect(out.map((p) => p.id)).toEqual(["p1", "p5"]);
    expect(out[1]).toMatchObject({ shares: null, source: null });
    expect(sanitizePlans("nope")).toEqual([]);
  });
});
