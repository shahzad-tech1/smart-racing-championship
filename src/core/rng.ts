/**
 * src/core/rng.ts — The ONLY source of randomness in the whole project.
 *
 * Determinism is a hard requirement (spec §4.4: opponents must behave identically
 * given the same track, event sequence and starting conditions). Never call
 * Math.random() in src/algorithms, src/engine or src/core — always thread an Rng
 * created here. The determinism-guard test enforces this.
 *
 * Algorithm: mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 */

export type Rng = () => number; // returns a float in [0, 1)

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Deterministic pick of one element. Throws on empty array. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick() on empty array");
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Deterministic in-place Fisher–Yates shuffle (returns the same array). */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
