import { describe, it, expect } from "vitest";
import { dfs, findDeadEnds, typedDeadEnds, weaklyConnectedComponents } from "../../src/algorithms/dfs";
import { buildCircuit1, CIRCUIT1_META } from "../../src/data/circuits/circuit1";
import { singleVertex, lineChain, disconnected, triangle } from "./fixtures";

describe("DFS", () => {
  it("detects a cycle in a triangle", () => {
    expect(dfs(triangle(), 0).hasCycle).toBe(true);
  });

  it("reports no cycle in a simple path", () => {
    expect(dfs(lineChain(), 0).hasCycle).toBe(false);
  });

  it("finds the cycle in circuit1 (the outer ring)", () => {
    expect(dfs(buildCircuit1(), 0).hasCycle).toBe(true);
  });

  it("visits every vertex as a forest (components covered)", () => {
    const r = dfs(disconnected(), 0);
    expect(r.order.length).toBe(4); // both components traversed
    expect(r.discovery.size).toBe(4);
    expect(r.finish.size).toBe(4);
  });

  it("computes weakly-connected components", () => {
    expect(weaklyConnectedComponents(disconnected())).toEqual([[0, 1], [2, 3]]);
    expect(weaklyConnectedComponents(singleVertex())).toEqual([[0]]);
    expect(weaklyConnectedComponents(buildCircuit1()).length).toBe(1);
  });

  it("finds the dead-end spur in circuit1 and never flags a mandatory checkpoint", () => {
    const g = buildCircuit1();
    const deadEnds = findDeadEnds(g, { finish: CIRCUIT1_META.finishVertex });
    expect(deadEnds).toContain(15); // the DeadEnd-typed spur vertex
    // no mandatory checkpoint (ids 1..10) is ever a dead end
    for (const cp of CIRCUIT1_META.checkpointOrder) {
      expect(deadEnds).not.toContain(cp);
    }
    // the through-road intersection (v14, degree 2) is not a dead end
    expect(deadEnds).not.toContain(14);
  });

  it("the typed DeadEnd vertex is among the structurally detected dead ends", () => {
    const g = buildCircuit1();
    const typed = typedDeadEnds(g);
    const structural = findDeadEnds(g);
    expect(typed).toEqual([15]);
    for (const v of typed) expect(structural).toContain(v);
  });
});
