import { describe, it, expect } from "vitest";
import { refuelDP } from "../../src/algorithms/refuel";

describe("refuelling DP (fuel in tenths)", () => {
  it("buys the minimum needed to cross a leg and reports a feasible plan", () => {
    const r = refuelDP({
      legFuel: [30, 40],
      capacity: 100,
      startFuel: 50,
      stations: [true, true],
      maxPurchase: 40,
      stopTime: 5,
    });
    expect(r.feasible).toBe(true);
    // start 50 -> leg0 (30) arrives 20; leg1 needs 40, so must buy >= 20 at stop 1
    expect(r.minStopTime).toBe(5); // exactly one stop with a positive purchase
    expect(r.purchases[0]).toBe(0);
    expect(r.purchases[1]).toBeGreaterThanOrEqual(20);
  });

  it("is feasible with a full tank and no purchases needed", () => {
    const r = refuelDP({
      legFuel: [30, 30, 30],
      capacity: 100,
      startFuel: 100,
      stations: [false, false, false],
    });
    expect(r.feasible).toBe(true);
    expect(r.minStopTime).toBe(0);
    expect(r.purchases).toEqual([0, 0, 0]);
  });

  it("is infeasible when a leg cannot be crossed and there is no station", () => {
    const r = refuelDP({
      legFuel: [30],
      capacity: 100,
      startFuel: 10,
      stations: [false],
    });
    expect(r.feasible).toBe(false);
    expect(r.minStopTime).toBe(Infinity);
  });

  it("respects the max purchase per stop (capacity/purchase limit)", () => {
    // need 50 from empty, but a single stop can only add 40
    const r = refuelDP({
      legFuel: [50],
      capacity: 100,
      startFuel: 0,
      stations: [true],
      maxPurchase: 40,
    });
    expect(r.feasible).toBe(false);
  });

  it("prefers fewer paid stops when both reach the destination", () => {
    // Enough to buy once big instead of twice: one stop should suffice.
    const r = refuelDP({
      legFuel: [20, 20],
      capacity: 100,
      startFuel: 5,
      stations: [true, true],
      maxPurchase: 100,
      stopTime: 7,
    });
    expect(r.feasible).toBe(true);
    // Buying 35 at stop 0 covers both legs (5+35=40 >= 20, arrive 20 >= 20) => 1 paid stop
    expect(r.minStopTime).toBe(7);
  });
});
