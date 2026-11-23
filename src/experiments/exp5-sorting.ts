/** Experiment 5 — Sorting & top-k (spec §7). Runtime + comparisons; top-k vs full sort. */
import { mergeSort, quickSort, heapSort, topK } from "../algorithms/sort";
import { countingTrace } from "../core/instrumentation";
import { makeRng, randInt } from "../core/rng";
import { benchmark, ms, type ExperimentResult } from "./harness";

const num = (a: number, b: number) => a - b;

function dataset(n: number, shape: string, seed: number): number[] {
  const rng = makeRng(seed);
  const random = Array.from({ length: n }, () => randInt(rng, 0, n));
  switch (shape) {
    case "sorted": return [...random].sort(num);
    case "reversed": return [...random].sort(num).reverse();
    case "duplicates": return Array.from({ length: n }, () => randInt(rng, 0, 9));
    default: return random;
  }
}

export function runExp5(sizes: number[] = [100, 1000, 5000, 20000]): { sorting: ExperimentResult; topk: ExperimentResult } {
  const sortRows: Array<Array<string | number>> = [];
  for (const n of sizes) {
    for (const shape of ["random", "sorted", "reversed", "duplicates"]) {
      const arr = dataset(n, shape, 5000 + n);
      const tc = countingTrace();
      mergeSort(arr, num, tc);
      const mergeT = benchmark(() => void mergeSort(arr, num));
      const quickT = benchmark(() => void quickSort(arr, num));
      const heapT = benchmark(() => void heapSort(arr, num));
      sortRows.push([n, shape, ms(mergeT.mean), ms(quickT.mean), ms(heapT.mean), tc.counters.comparisons]);
    }
  }

  const topkRows: Array<Array<string | number>> = [];
  for (const n of sizes) {
    const arr = dataset(n, "random", 6000 + n);
    for (const k of [5, Math.max(1, Math.floor(n / 2))]) {
      const fullT = benchmark(() => void mergeSort(arr, num));
      const topkT = benchmark(() => void topK(arr, k, num));
      topkRows.push([n, k, ms(fullT.mean), ms(topkT.mean)]);
    }
  }

  return {
    sorting: {
      name: "exp5-sorting",
      headers: ["n", "shape", "merge_mean_ms", "quick_mean_ms", "heap_mean_ms", "merge_comparisons"],
      rows: sortRows,
      notes: ["Quick's worst case is O(n^2); Merge is stable O(n log n); Heap is in-place."],
    },
    topk: {
      name: "exp5-topk",
      headers: ["n", "k", "full_sort_mean_ms", "topk_heap_mean_ms"],
      rows: topkRows,
      notes: ["Size-k heap top-k is O(n log k); it beats full sort for small k, converges as k -> n."],
    },
  };
}
