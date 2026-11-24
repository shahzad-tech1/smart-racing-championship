import { describe, it, expect } from "vitest";
import { mergeSort, quickSort, heapSort, topK } from "../../src/algorithms/sort";
import { makeRng, randInt } from "../../src/core/rng";

const num = (a: number, b: number) => a - b;

function inputs(rng: ReturnType<typeof makeRng>): Record<string, number[]> {
  const n = randInt(rng, 0, 40);
  const random = Array.from({ length: n }, () => randInt(rng, 0, 20));
  return {
    random,
    sorted: [...random].sort(num),
    reversed: [...random].sort(num).reverse(),
    duplicates: Array.from({ length: n }, () => randInt(rng, 0, 3)),
    empty: [],
    singleton: [7],
  };
}

describe("sorting — all three methods agree", () => {
  it("Merge, Quick and Heap sort produce identical output on every input shape", () => {
    const rng = makeRng(2026);
    for (let t = 0; t < 60; t++) {
      for (const arr of Object.values(inputs(rng))) {
        const expected = [...arr].sort(num);
        expect(mergeSort(arr, num)).toEqual(expected);
        expect(quickSort(arr, num)).toEqual(expected);
        expect(heapSort(arr, num)).toEqual(expected);
      }
    }
  });

  it("merge sort is stable (preserves input order among equal keys)", () => {
    const data = [
      { key: 1, order: 0 }, { key: 1, order: 1 }, { key: 0, order: 2 },
      { key: 1, order: 3 }, { key: 0, order: 4 },
    ];
    const out = mergeSort(data, (a, b) => a.key - b.key);
    const key1Orders = out.filter((d) => d.key === 1).map((d) => d.order);
    expect(key1Orders).toEqual([0, 1, 3]); // original relative order kept
  });

  it("does not mutate the input array", () => {
    const original = [3, 1, 2];
    const copy = [...original];
    mergeSort(original, num);
    quickSort(original, num);
    heapSort(original, num);
    expect(original).toEqual(copy);
  });
});

describe("top-k", () => {
  it("equals the first k of a full sort (small k and k ~ n)", () => {
    const rng = makeRng(99);
    for (let t = 0; t < 60; t++) {
      const n = randInt(rng, 0, 30);
      const arr = Array.from({ length: n }, () => randInt(rng, 0, 100));
      const full = mergeSort(arr, num);
      for (const k of [0, 1, 3, Math.floor(n / 2), n, n + 5]) {
        expect(topK(arr, k, num)).toEqual(full.slice(0, Math.max(0, Math.min(k, n))));
      }
    }
  });
});
