import { describe, it, expect } from "vitest";
import { BinaryHeap } from "../../src/core/BinaryHeap";

describe("BinaryHeap (min-heap)", () => {
  it("pops elements in ascending priority order", () => {
    const h = new BinaryHeap<number>((a, b) => a < b);
    const input = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0];
    for (const x of input) h.push(x);
    const out: number[] = [];
    while (!h.isEmpty()) out.push(h.pop()!);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("peek returns the minimum without removing it", () => {
    const h = new BinaryHeap<number>((a, b) => a < b);
    h.push(10);
    h.push(4);
    h.push(7);
    expect(h.peek()).toBe(4);
    expect(h.size).toBe(3);
  });

  it("pop on an empty heap returns undefined", () => {
    const h = new BinaryHeap<number>((a, b) => a < b);
    expect(h.pop()).toBeUndefined();
    expect(h.isEmpty()).toBe(true);
  });

  it("works with a composite comparator (object priorities)", () => {
    const h = new BinaryHeap<{ k: number; seq: number }>((a, b) =>
      a.k !== b.k ? a.k < b.k : a.seq < b.seq,
    );
    h.push({ k: 2, seq: 1 });
    h.push({ k: 1, seq: 2 });
    h.push({ k: 1, seq: 1 });
    expect(h.pop()).toEqual({ k: 1, seq: 1 });
    expect(h.pop()).toEqual({ k: 1, seq: 2 });
    expect(h.pop()).toEqual({ k: 2, seq: 1 });
  });
});
