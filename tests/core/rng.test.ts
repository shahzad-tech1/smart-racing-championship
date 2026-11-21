import { describe, it, expect } from "vitest";
import { makeRng, randInt, shuffle } from "../../src/core/rng";

describe("seeded RNG (determinism foundation)", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toBe(b());
  });

  it("returns floats in [0,1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("randInt stays within the inclusive range", () => {
    const r = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const x = randInt(r, 3, 8);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(8);
    }
  });

  it("shuffle is deterministic for a given seed and is a permutation", () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = shuffle(makeRng(42), [...base]);
    const s2 = shuffle(makeRng(42), [...base]);
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(base);
  });
});
