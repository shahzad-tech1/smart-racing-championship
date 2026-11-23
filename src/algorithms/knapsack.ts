/**
 * src/algorithms/knapsack.ts — Act 3: 0/1 Knapsack via DP (spec §5.3, Problem A).
 *
 * dp[i][b] = dp[i-1][b]                                   if cost_i > b
 *          = max(dp[i-1][b], dp[i-1][b-cost_i] + v_i)     otherwise
 * Base: dp[0][b] = 0. Items recovered by tracing the table.
 * Time O(mB), space O(mB) with reconstruction (pseudo-polynomial in budget B).
 * A value-only O(B)-space variant is provided too.
 *
 * Interpretation note (spec §5.3): `cost` is a single documented scalar budget
 * (e.g. scaled detour fuel/time). It must NOT silently treat fuel, time and nitro
 * as interchangeable physical resources — that is the game's responsibility when
 * it builds the items.
 */

import type { AlgoTrace } from "../core/instrumentation";

export interface Item {
  id: number;
  cost: number; // non-negative integer
  benefit: number; // non-negative
}

export interface KnapsackResult {
  value: number;
  selected: number[]; // item ids, ascending
}

export function knapsack01(items: Item[], budget: number, trace?: AlgoTrace): KnapsackResult {
  const m = items.length;
  const B = Math.max(0, Math.floor(budget));

  // dp has (m+1) rows, (B+1) cols, all zero at row 0 (base case).
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(B + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const it = items[i - 1]!;
    const prev = dp[i - 1]!;
    const row = dp[i]!;
    for (let b = 0; b <= B; b++) {
      if (trace) trace.counters.dpStatesComputed++;
      const without = prev[b]!;
      if (it.cost <= b) {
        const withIt = prev[b - it.cost]! + it.benefit;
        row[b] = Math.max(without, withIt);
      } else {
        row[b] = without;
      }
      if (trace) trace.record({ kind: "dpCell", i, b, value: row[b]! });
    }
  }

  // reconstruct: an item was taken whenever its row improved on the row above.
  const selected: number[] = [];
  let b = B;
  for (let i = m; i >= 1; i--) {
    if (dp[i]![b]! !== dp[i - 1]![b]!) {
      const it = items[i - 1]!;
      selected.push(it.id);
      b -= it.cost;
    }
  }
  selected.reverse();
  selected.sort((a, z) => a - z);

  return { value: dp[m]![B]!, selected };
}

/** Value-only 0/1 knapsack in O(B) space (no reconstruction). */
export function knapsack01Value(items: Item[], budget: number, trace?: AlgoTrace): number {
  const B = Math.max(0, Math.floor(budget));
  const dp = new Array<number>(B + 1).fill(0);
  for (const it of items) {
    // iterate b downward so each item is used at most once
    for (let b = B; b >= it.cost; b--) {
      if (trace) trace.counters.dpStatesComputed++;
      const withIt = dp[b - it.cost]! + it.benefit;
      if (withIt > dp[b]!) dp[b] = withIt;
    }
  }
  return dp[B]!;
}
