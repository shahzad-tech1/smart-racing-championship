import { describe, it, expect } from "vitest";
import { knapsack01, knapsack01Value, type Item } from "../../src/algorithms/knapsack";
import { greedyKnapsack } from "../../src/algorithms/greedy";
import { recordingTrace } from "../../src/core/instrumentation";
import { makeRng, randInt } from "../../src/core/rng";

/** Exhaustive 0/1 knapsack oracle (m <= ~18) — the ground truth for DP. */
function exhaustive(items: Item[], budget: number): number {
  const m = items.length;
  let best = 0;
  for (let mask = 0; mask < 1 << m; mask++) {
    let c = 0;
    let v = 0;
    for (let i = 0; i < m; i++) {
      if (mask & (1 << i)) {
        c += items[i]!.cost;
        v += items[i]!.benefit;
      }
    }
    if (c <= budget && v > best) best = v;
  }
  return best;
}

const example: Item[] = [
  { id: 1, cost: 6, benefit: 30 }, // A, ratio 5.0
  { id: 2, cost: 5, benefit: 24 }, // B, ratio 4.8
  { id: 3, cost: 5, benefit: 24 }, // C, ratio 4.8
];

describe("0/1 Knapsack DP", () => {
  it("solves the supplied example (DP 48 beats greedy 30) at budget 10", () => {
    const dp = knapsack01(example, 10);
    expect(dp.value).toBe(48);
    expect(dp.selected).toEqual([2, 3]); // B + C

    const g = greedyKnapsack(example, 10);
    expect(g.value).toBe(30);
    expect(g.selected).toEqual([1]); // A only
  });

  it("team greedy-suboptimal case #1: budget 4, greedy 5 vs DP 6", () => {
    const items: Item[] = [
      { id: 1, cost: 3, benefit: 5 }, // ratio ~1.67 (greedy takes this first)
      { id: 2, cost: 2, benefit: 3 },
      { id: 3, cost: 2, benefit: 3 },
    ];
    expect(greedyKnapsack(items, 4).value).toBe(5);
    expect(knapsack01(items, 4).value).toBe(6); // items 2 + 3
    expect(knapsack01(items, 4).value).toBe(exhaustive(items, 4));
  });

  it("team greedy-suboptimal case #2: budget 5, greedy 7 vs DP 8", () => {
    const items: Item[] = [
      { id: 1, cost: 4, benefit: 7 }, // ratio 1.75 (greedy takes this)
      { id: 2, cost: 3, benefit: 5 },
      { id: 3, cost: 2, benefit: 3 },
    ];
    expect(greedyKnapsack(items, 5).value).toBe(7);
    expect(knapsack01(items, 5).value).toBe(8); // items 2 + 3
    expect(knapsack01(items, 5).value).toBe(exhaustive(items, 5));
  });

  it("matches the exhaustive oracle on 200 random small instances", () => {
    const rng = makeRng(2026);
    for (let t = 0; t < 200; t++) {
      const m = randInt(rng, 1, 12);
      const items: Item[] = Array.from({ length: m }, (_, i) => ({
        id: i + 1,
        cost: randInt(rng, 0, 8),
        benefit: randInt(rng, 0, 20),
      }));
      const budget = randInt(rng, 0, 20);
      expect(knapsack01(items, budget).value).toBe(exhaustive(items, budget));
      expect(knapsack01Value(items, budget)).toBe(exhaustive(items, budget));
    }
  });

  it("always takes zero-cost positive-benefit items", () => {
    const items: Item[] = [
      { id: 1, cost: 0, benefit: 7 },
      { id: 2, cost: 3, benefit: 4 },
      { id: 3, cost: 0, benefit: 0 }, // zero/zero: ignored
    ];
    const dp = knapsack01(items, 3);
    expect(dp.selected).toContain(1);
    const g = greedyKnapsack(items, 3);
    expect(g.selected).toContain(1);
    expect(g.selected).not.toContain(3);
  });

  it("budget 0 yields value 0 and selects nothing with positive costs", () => {
    const items: Item[] = [{ id: 1, cost: 2, benefit: 9 }];
    expect(knapsack01(items, 0).value).toBe(0);
    expect(knapsack01(items, 0).selected).toEqual([]);
  });

  it("never exceeds the budget in its selection", () => {
    const rng = makeRng(7);
    for (let t = 0; t < 50; t++) {
      const m = randInt(rng, 1, 10);
      const items: Item[] = Array.from({ length: m }, (_, i) => ({
        id: i + 1, cost: randInt(rng, 1, 7), benefit: randInt(rng, 1, 15),
      }));
      const budget = randInt(rng, 0, 15);
      const res = knapsack01(items, budget);
      const spent = res.selected
        .map((id) => items.find((it) => it.id === id)!.cost)
        .reduce((a, b) => a + b, 0);
      expect(spent).toBeLessThanOrEqual(budget);
    }
  });

  it("records DP state counters", () => {
    const t = recordingTrace();
    knapsack01(example, 10, t);
    expect(t.counters.dpStatesComputed).toBe(3 * (10 + 1));
  });
});
