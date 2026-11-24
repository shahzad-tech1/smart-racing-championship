import { describe, it, expect } from "vitest";
import { bfs, reachableCheckpoints } from "../../src/algorithms/bfs";
import { recordingTrace } from "../../src/core/instrumentation";
import { buildCircuit1 } from "../../src/data/circuits/circuit1";
import {
  singleVertex, disconnected, bfsEdgeExample, directedLine, lineChain,
} from "./fixtures";

describe("BFS", () => {
  it("source == target returns a trivial path of zero edges", () => {
    const r = bfs(singleVertex(), 0, 0);
    expect(r.found).toBe(true);
    expect(r.path).toEqual([0]);
    expect(r.edgeCount).toBe(0);
  });

  it("chooses the minimum EDGE count, not the shorter distance (§5.1 example)", () => {
    const r = bfs(bfsEdgeExample(), 0, 1);
    expect(r.found).toBe(true);
    expect(r.path).toEqual([0, 1]); // the 1-edge direct road, not 0-2-3-1
    expect(r.edgeCount).toBe(1);
  });

  it("reports an unreachable target without crashing or looping", () => {
    const r = bfs(disconnected(), 0, 3); // 3 is in the other component
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
    expect(r.edgeCount).toBe(-1);
  });

  it("respects edge direction (cannot go backward on a one-way road)", () => {
    const g = directedLine();
    expect(bfs(g, 0, 2).found).toBe(true); // forward ok
    expect(bfs(g, 2, 0).found).toBe(false); // backward blocked
  });

  it("excludes blocked edges from reachability", () => {
    const g = lineChain();
    expect(bfs(g, 0, 3).found).toBe(true);
    g.setEdgeStatus(2, "Blocked"); // 1-2 edge
    const r = bfs(g, 0, 3);
    expect(r.found).toBe(false);
    expect(r.reachable.has(2)).toBe(false);
  });

  it("computes correct edge-count distances on the detour example", () => {
    const r = bfs(bfsEdgeExample(), 0);
    expect(r.dist.get(1)).toBe(1); // direct
    expect(r.dist.get(3)).toBe(2); // via 0-2-3
  });

  it("records trace steps and counters", () => {
    const t = recordingTrace();
    bfs(bfsEdgeExample(), 0, 1, t);
    expect(t.counters.visitedVertices).toBeGreaterThan(0);
    expect(t.counters.examinedEdges).toBeGreaterThan(0);
    expect(t.steps!.some((s) => s.kind === "pathFound")).toBe(true);
  });

  it("splits reachable vs unreachable mandatory checkpoints", () => {
    const g = buildCircuit1();
    const { reachable, unreachable } = reachableCheckpoints(g, 0);
    expect(reachable.length).toBe(10); // all 10 checkpoints reachable in circuit1
    expect(unreachable.length).toBe(0);
  });
});
