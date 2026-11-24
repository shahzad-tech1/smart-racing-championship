/**
 * src/algorithms/greedy.ts — Act 3: greedy benefit/cost heuristic (spec §5.3).
 *
 * Selection rule:
 *   1. Take all zero-cost, positive-benefit items first (they are free wins).
 *   2. Sort the remaining positive-cost items by benefit/cost descending;
 *      deterministic tie-break = lower item id.
 *   3. Select in order while the item still fits the budget.
 *
 * Zero-cost ZERO-benefit items are skipped (they change nothing). This is a
 * feasible HEURISTIC, not an optimality guarantee for 0/1 Knapsack — the tests
 * include cases where it is strictly worse than the DP.
 */

import type { AlgoTrace } from "../core/instrumentation";
import type { Item, KnapsackResult } from "./knapsack";

export function greedyKnapsack(items: Item[], budget: number, trace?: AlgoTrace): KnapsackResult {
  const selected: number[] = [];
  let value = 0;
  let remaining = Math.max(0, budget);

  // 1. zero-cost, positive-benefit items (deterministic by id)
  const zeroPos = items
    .filter((i) => i.cost === 0 && i.benefit > 0)
    .sort((a, b) => a.id - b.id);
  for (const it of zeroPos) {
    if (trace) trace.counters.dpStatesComputed++;
    selected.push(it.id);
    value += it.benefit;
  }

  // 2. positive-cost items by ratio desc, tie-break lower id
  const rest = items
    .filter((i) => i.cost > 0)
    .slice()
    .sort((a, b) => {
      const ra = a.benefit / a.cost;
      const rb = b.benefit / b.cost;
      if (rb !== ra) return rb - ra;
      return a.id - b.id;
    });

  // 3. take while it fits
  for (const it of rest) {
    if (trace) trace.counters.dpStatesComputed++;
    if (it.cost <= remaining) {
      selected.push(it.id);
      value += it.benefit;
      remaining -= it.cost;
    }
  }

  selected.sort((a, b) => a - b);
  return { value, selected };
}
