import { describe, it, expect } from "vitest";
import { edgeCost, costFn, PRESETS, REFS } from "../../src/core/cost";
import { CIRCUIT1_EDGES } from "../../src/data/circuits/circuit1";
import type { Edge } from "../../src/core/types";

const ring0 = CIRCUIT1_EDGES[0]!; // id 1: dist 114, time 3.8, fuel 6, diff 1, obstacle 0
const shortcut = CIRCUIT1_EDGES.find((e) => e.id === 13)!; // diff 5, obstacle 3, long

describe("edgeCost", () => {
  it("matches a hand calculation under Balanced weights", () => {
    // D=114/600, T=3.8/20, F=6/30, R=1/5, O=0  -> sum 0.78, *0.2 = 0.156
    const c = edgeCost(ring0, PRESETS.Balanced, REFS);
    expect(c).toBeCloseTo(0.156, 6);
  });

  it("is non-negative for every circuit edge under every preset (Dijkstra requirement)", () => {
    for (const e of CIRCUIT1_EDGES) {
      for (const w of Object.values(PRESETS)) {
        expect(edgeCost(e, w, REFS)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("Safety penalises a hard, hazardous shortcut more than Speed does", () => {
    const safety = edgeCost(shortcut, PRESETS.Safety, REFS);
    const speed = edgeCost(shortcut, PRESETS.Speed, REFS);
    expect(safety).toBeGreaterThan(speed);
  });

  it("costFn is equivalent to edgeCost (the value routing minimizes == the value UI shows)", () => {
    const fn = costFn(PRESETS.Economy, REFS);
    for (const e of CIRCUIT1_EDGES) {
      expect(fn(e)).toBe(edgeCost(e, PRESETS.Economy, REFS));
    }
  });

  it("applies an effectiveEdge transform when provided", () => {
    const worsen = (e: Edge): Edge => ({ ...e, difficulty: 5, obstacle: 5 });
    const plain = edgeCost(ring0, PRESETS.Safety, REFS);
    const worsened = edgeCost(ring0, PRESETS.Safety, REFS, worsen);
    expect(worsened).toBeGreaterThan(plain);
  });
});
