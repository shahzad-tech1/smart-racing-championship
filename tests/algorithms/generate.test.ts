import { describe, it, expect } from "vitest";
import { generateCircuit } from "../../src/algorithms/generate";
import { validateCircuit } from "../../src/engine/validator";

function signature(seed: number): string {
  const c = generateCircuit(seed);
  return JSON.stringify({ v: c.graph.allVertices(), e: c.graph.allEdges() });
}

describe("automatic track generation", () => {
  it("produces a circuit that passes the validator", () => {
    const c = generateCircuit(101);
    expect(validateCircuit(c.graph, c.meta).valid).toBe(true);
  });

  it("has the required features: 10 ordered checkpoints and >= 2 shortcuts", () => {
    const c = generateCircuit(101);
    const checkpoints = c.graph.allVertices().filter((v) => v.checkpointOrder != null);
    expect(checkpoints.length).toBe(10);
    const orders = checkpoints.map((v) => v.checkpointOrder).sort((a, b) => a! - b!);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const shortcuts = c.graph.allEdges().filter((e) => e.isShortcut);
    expect(shortcuts.length).toBeGreaterThanOrEqual(2);

    const deadEnds = c.graph.allVertices().filter((v) => v.type === "DeadEnd");
    expect(deadEnds.length).toBeGreaterThanOrEqual(1);
  });

  it("has an MST backbone of V-1 edges", () => {
    const c = generateCircuit(101);
    expect(c.backboneEdgeIds.length).toBe(c.graph.vertexCount - 1);
  });

  it("is deterministic for a given seed", () => {
    expect(signature(101)).toBe(signature(101));
  });

  it("produces different circuits for different seeds", () => {
    expect(signature(101)).not.toBe(signature(202));
  });

  it("circuits 2 and 3 (shipped seeds) both validate", () => {
    for (const seed of [101, 202]) {
      const c = generateCircuit(seed);
      expect(validateCircuit(c.graph, c.meta).valid).toBe(true);
    }
  });
});
