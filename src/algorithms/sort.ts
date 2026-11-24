/**
 * src/algorithms/sort.ts — Act 5: sorting & top-k (spec §5.5).
 *
 * Three independent sorts + a size-k top-k, all driven by the SAME comparator
 * passed in (the championship total order in gameplay). Because the comparator is
 * a total order, all three sorts and top-k agree exactly.
 *
 *   cmp(x, y) < 0  => x ranks before y.
 *
 * Complexity: mergeSort O(n log n) stable; quickSort O(n log n) avg / O(n²) worst
 * (3-way partition helps duplicates); heapSort O(n log n) in-place (not stable);
 * topK O(n log k) with a size-k heap.
 */

import { BinaryHeap } from "../core/BinaryHeap";
import type { AlgoTrace } from "../core/instrumentation";

type Cmp<T> = (x: T, y: T) => number;

function swap<T>(a: T[], i: number, j: number, trace?: AlgoTrace): void {
  if (trace && i !== j) trace.record({ kind: "swap", i, j });
  [a[i], a[j]] = [a[j]!, a[i]!];
}

/** Stable merge sort. Returns a new array. */
export function mergeSort<T>(input: T[], cmp: Cmp<T>, trace?: AlgoTrace, offset = 0): T[] {
  if (input.length <= 1) return input.slice();
  const mid = input.length >> 1;
  const left = mergeSort(input.slice(0, mid), cmp, trace, offset);
  const right = mergeSort(input.slice(mid), cmp, trace, offset + mid);

  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (trace) {
      trace.counters.comparisons++;
      // absolute positions in the array being sorted (left run at `offset`, right run at `offset+mid`)
      trace.record({ kind: "compare", i: offset + i, j: offset + mid + j });
    }
    if (cmp(left[i]!, right[j]!) <= 0) {
      out.push(left[i]!);
      i++;
    } else {
      out.push(right[j]!);
      j++;
    }
  }
  while (i < left.length) out.push(left[i++]!);
  while (j < right.length) out.push(right[j++]!);
  if (trace) for (let k = 0; k < out.length; k++) trace.record({ kind: "write", index: offset + k, item: out[k] });
  return out;
}

/** Quick sort with a 3-way (Dutch-flag) partition; deterministic middle pivot. Returns a new array. */
export function quickSort<T>(input: T[], cmp: Cmp<T>, trace?: AlgoTrace): T[] {
  const a = input.slice();
  const qs = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const pivot = a[(lo + hi) >> 1]!;
    let lt = lo;
    let gt = hi;
    let i = lo;
    while (i <= gt) {
      if (trace) {
        trace.counters.comparisons++;
        trace.record({ kind: "compare", i, j: lt });
      }
      const c = cmp(a[i]!, pivot);
      if (c < 0) {
        swap(a, lt, i, trace);
        lt++;
        i++;
      } else if (c > 0) {
        swap(a, i, gt, trace);
        gt--;
      } else {
        i++;
      }
    }
    qs(lo, lt - 1);
    qs(gt + 1, hi);
  };
  qs(0, a.length - 1);
  return a;
}

/** In-place heap sort via an implicit max-heap (ascending by cmp). Returns a new array. */
export function heapSort<T>(input: T[], cmp: Cmp<T>, trace?: AlgoTrace): T[] {
  const a = input.slice();
  const n = a.length;

  const siftDown = (start: number, end: number): void => {
    let i = start;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let largest = i;
      if (l < end) {
        if (trace) {
          trace.counters.comparisons++;
          trace.record({ kind: "compare", i: l, j: largest });
        }
        if (cmp(a[l]!, a[largest]!) > 0) largest = l;
      }
      if (r < end) {
        if (trace) {
          trace.counters.comparisons++;
          trace.record({ kind: "compare", i: r, j: largest });
        }
        if (cmp(a[r]!, a[largest]!) > 0) largest = r;
      }
      if (largest === i) break;
      swap(a, i, largest, trace);
      i = largest;
    }
  };

  for (let i = (n >> 1) - 1; i >= 0; i--) siftDown(i, n);
  for (let end = n - 1; end > 0; end--) {
    swap(a, 0, end, trace);
    siftDown(0, end);
  }
  return a;
}

/**
 * Top-k smallest per cmp, ascending — equals the first k of a full sort when cmp
 * is a total order. Uses a size-k MAX-heap: O(n log k) time, O(k) space.
 */
export function topK<T>(input: T[], k: number, cmp: Cmp<T>, trace?: AlgoTrace): T[] {
  if (k <= 0) return [];
  const K = Math.min(k, input.length);
  // max-heap: peek() is the largest kept element (worst of the current top-k)
  const heap = new BinaryHeap<T>((x, y) => cmp(x, y) > 0);
  for (const x of input) {
    if (heap.size < K) {
      heap.push(x);
      if (trace) trace.counters.heapPushes++;
    } else {
      const worst = heap.peek()!;
      if (trace) trace.counters.comparisons++;
      if (cmp(x, worst) < 0) {
        heap.pop();
        heap.push(x);
        if (trace) {
          trace.counters.heapPops++;
          trace.counters.heapPushes++;
        }
      }
    }
  }
  const kept: T[] = [];
  while (!heap.isEmpty()) kept.push(heap.pop()!);
  return mergeSort(kept, cmp, trace);
}
