/** Experiment 3 — DP & Greedy (spec §7). Benefit, DP states, runtime; DP vs exhaustive. */
import { knapsack01, type Item } from "../algorithms/knapsack";
import { greedyKnapsack } from "../algorithms/greedy";
import { countingTrace } from "../core/instrumentation";
import { makeRng, randInt } from "../core/rng";
import { benchmark, ms, type ExperimentResult } from "./harness";

function exhaustive(items: Item[], budget: number): number {
  const m = items.length;
  let best = 0;
  for (let mask = 0; mask < 1 << m; mask++) {
    let c = 0;
    let v = 0;
    for (let i = 0; i < m; i++) if (mask & (1 << i)) { c += items[i]!.cost; v += items[i]!.benefit; }
    if (c <= budget && v > best) best = v;
  }
  return best;
}

function randomItems(m: number, seed: number): Item[] {
  const rng = makeRng(seed);
  return Array.from({ length: m }, (_, i) => ({ id: i + 1, cost: randInt(rng, 1, 10), benefit: randInt(rng, 1, 30) }));
}

export function runExp3(cases: Array<[number, number]> = [[5, 15], [10, 30], [15, 50], [18, 80], [22, 120]]): ExperimentResult {
  const rows: Array<Array<string | number>> = [];
  // supplied example first
  const example: Item[] = [{ id: 1, cost: 6, benefit: 30 }, { id: 2, cost: 5, benefit: 24 }, { id: 3, cost: 5, benefit: 24 }];
  {
    const dp = knapsack01(example, 10);
    const gr = greedyKnapsack(example, 10);
    rows.push(["example", 3, 10, dp.value, gr.value, "n/a", 3 * 11, 0]);
    if (dp.value !== 48 || gr.value !== 30) throw new Error("Exp3: supplied example mismatch");
  }
  for (const [m, budget] of cases) {
    const items = randomItems(m, 3000 + m + budget);
    const t = countingTrace();
    const dp = knapsack01(items, budget, t);
    const gr = greedyKnapsack(items, budget);
    if (m <= 20) {
      const ex = exhaustive(items, budget);
      if (dp.value !== ex) throw new Error(`Exp3: DP ${dp.value} != exhaustive ${ex} (m=${m})`);
    }
    const dpT = benchmark(() => void knapsack01(items, budget));
    rows.push([`m=${m}`, m, budget, dp.value, gr.value, dp.value >= gr.value ? "DP>=greedy" : "BUG", t.counters.dpStatesComputed, ms(dpT.mean)]);
  }
  return {
    name: "exp3-dp-greedy",
    headers: ["case", "m", "budget", "dp_value", "greedy_value", "check", "dp_states", "dp_mean_ms"],
    rows,
    notes: ["DP matches exhaustive for m<=20; greedy is never better than DP.", "DP runtime grows with m*budget (pseudo-polynomial)."],
  };
}
