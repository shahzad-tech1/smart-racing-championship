import { describe, it, expect } from "vitest";
import { Graph } from "../../src/core/Graph";
import { validateCircuit } from "../../src/engine/validator";
import { buildCircuit1, CIRCUIT1_META } from "../../src/data/circuits/circuit1";
import { V, E } from "../algorithms/fixtures";

describe("circuit validator", () => {
  it("accepts the hand-authored circuit1", () => {
    const res = validateCircuit(buildCircuit1(), CIRCUIT1_META);
    expect(res.valid).toBe(true);
    expect(res.reasons).toEqual([]);
  });

  it("rejects a candidate with an unreachable checkpoint and explains why (Challenge 1)", () => {
    // vertex 1 (a mandatory checkpoint) has no edges -> unreachable + disconnected
    const g = new Graph(
      [V(0, { type: "Start" }), V(1, { type: "Checkpoint", checkpointOrder: 1 }), V(2, { type: "Finish" })],
      [E(1, 0, 2)],
    );
    const res = validateCircuit(g, { startVertex: 0, finishVertex: 2, checkpointOrder: [1] });
    expect(res.valid).toBe(false);
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  it("rejects a candidate with only one start->finish route (no alternative)", () => {
    // single path 0 - 1 - 2, checkpoint at 1: reachable & fuel-ok, but only ONE route
    const g = new Graph(
      [V(0, { type: "Start" }), V(1, { type: "Checkpoint", checkpointOrder: 1 }), V(2, { type: "Finish" })],
      [E(1, 0, 1), E(2, 1, 2)],
    );
    const res = validateCircuit(g, { startVertex: 0, finishVertex: 2, checkpointOrder: [1] });
    expect(res.valid).toBe(false);
    expect(res.reasons.some((r) => r.includes("alternative"))).toBe(true);
  });
});
