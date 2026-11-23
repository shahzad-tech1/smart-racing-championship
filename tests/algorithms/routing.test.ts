import { describe, it, expect } from "vitest";
import { Graph } from "../../src/core/Graph";
import type { Edge } from "../../src/core/types";
import { dijkstra } from "../../src/algorithms/dijkstra";
import { aStar, euclideanHeuristic, zeroHeuristic, weightedHeuristic } from "../../src/algorithms/astar";
import { planCheckpointRoute } from "../../src/algorithms/route";
import { enumerateSimplePaths } from "../../src/algorithms/paths";
import { recordingTrace } from "../../src/core/instrumentation";
import { costFn, PRESETS } from "../../src/core/cost";
import { buildCircuit1, CIRCUIT1_META } from "../../src/data/circuits/circuit1";
import { V, E, directedLine } from "./fixtures";

const dcost = (e: Edge) => e.distance; // distance-only cost for clean integer checks

/** Diamond with an equal-cost alternative: 0->3 optimal cost = 2 (two optimal paths). */
function diamond(): Graph {
  return new Graph(
    [V(0), V(1), V(2), V(3), V(4)],
    [
      E(1, 0, 1, { distance: 4 }),
      E(2, 1, 3, { distance: 1 }), // 0-1-3 = 5
      E(3, 0, 2, { distance: 1 }),
      E(4, 2, 3, { distance: 1 }), // 0-2-3 = 2
      E(5, 0, 4, { distance: 1 }),
      E(6, 4, 3, { distance: 1 }), // 0-4-3 = 2 (equal-cost alt)
    ],
  );
}

/** Brute-force min path cost over all simple paths (validation oracle, small graphs only). */
function bruteForceCost(g: Graph, s: number, t: number, cost: (e: Edge) => number): number {
  const paths = enumerateSimplePaths(g, s, t, { maxPaths: 1000, maxLen: 20 });
  let best = Infinity;
  for (const p of paths) {
    let c = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      const edges = g.neighbors(a, { ignoreBlocked: true }).filter((n) => n.to === b);
      c += Math.min(...edges.map((n) => cost(n.edge)));
    }
    best = Math.min(best, c);
  }
  return best;
}

describe("Dijkstra", () => {
  it("source == target costs 0 with a trivial path", () => {
    const r = dijkstra(diamond(), 0, 0, dcost);
    expect(r.found).toBe(true);
    expect(r.cost).toBe(0);
    expect(r.path).toEqual([0]);
    expect(r.edges).toEqual([]);
  });

  it("reports an unreachable target (one-way) without crashing", () => {
    const r = dijkstra(directedLine(), 2, 0, dcost);
    expect(r.found).toBe(false);
    expect(r.cost).toBe(Infinity);
    expect(r.path).toEqual([]);
  });

  it("is optimal vs brute force on the diamond", () => {
    const r = dijkstra(diamond(), 0, 3, dcost);
    expect(r.cost).toBe(2);
    expect(r.cost).toBe(bruteForceCost(diamond(), 0, 3, dcost));
  });

  it("handles zero-weight edges", () => {
    const g = new Graph([V(0), V(1), V(2)], [E(1, 0, 1, { distance: 0 }), E(2, 1, 2, { distance: 1 })]);
    const r = dijkstra(g, 0, 2, dcost);
    expect(r.cost).toBe(1);
    expect(r.path).toEqual([0, 1, 2]);
  });

  it("returns a valid connected path on circuit1 (consecutive edges exist)", () => {
    const g = buildCircuit1();
    const r = dijkstra(g, 0, 6, costFn(PRESETS.Balanced));
    expect(r.found).toBe(true);
    expect(r.path[0]).toBe(0);
    expect(r.path.at(-1)).toBe(6);
    expect(r.edges.length).toBe(r.path.length - 1);
  });

  it("excludes blocked edges and recomputes after a closure (no restart)", () => {
    const g = buildCircuit1();
    const first = dijkstra(g, 0, 6, dcost);
    expect(first.found).toBe(true);
    g.setEdgeStatus(first.edges[0]!, "Blocked"); // close the first edge on the route
    const again = dijkstra(g, 0, 6, dcost);
    expect(again.found).toBe(true); // a valid alternative still exists
    expect(again.edges).not.toContain(first.edges[0]);
  });

  it("records counters for Experiment 2", () => {
    const t = recordingTrace();
    dijkstra(buildCircuit1(), 0, 6, dcost, t);
    expect(t.counters.visitedVertices).toBeGreaterThan(0);
    expect(t.counters.relaxedEdges).toBeGreaterThan(0);
    expect(t.counters.heapPushes).toBeGreaterThan(0);
    expect(t.counters.heapPops).toBeGreaterThan(0);
  });
});

describe("A*", () => {
  it("with zero heuristic returns the same optimal cost as Dijkstra", () => {
    const d = dijkstra(diamond(), 0, 3, dcost);
    const a = aStar(diamond(), 0, 3, dcost, zeroHeuristic);
    expect(a.found).toBe(true);
    expect(a.cost).toBe(d.cost);
  });

  it("with an admissible Euclidean heuristic matches Dijkstra's cost on circuit1", () => {
    const g = buildCircuit1();
    for (const goal of [3, 6, 9, 11]) {
      const d = dijkstra(g, 0, goal, dcost);
      const a = aStar(g, 0, goal, dcost, euclideanHeuristic(g));
      expect(a.cost).toBeCloseTo(d.cost, 9);
      expect(a.found).toBe(d.found);
    }
  });

  it("weighted-cost heuristic still returns the optimal (same as Dijkstra) cost", () => {
    const g = buildCircuit1();
    const cost = costFn(PRESETS.Speed);
    const d = dijkstra(g, 0, 6, cost);
    const a = aStar(g, 0, 6, cost, weightedHeuristic(g, cost));
    expect(a.cost).toBeCloseTo(d.cost, 9);
  });
});

describe("checkpoint-aware route planning", () => {
  const g = buildCircuit1();
  const order = [...CIRCUIT1_META.checkpointOrder];

  it("visits every mandatory checkpoint in order and never skips one", () => {
    const plan = planCheckpointRoute(g, 0, order, CIRCUIT1_META.finishVertex, dcost);
    expect(plan.found).toBe(true);
    expect(plan.path[0]).toBe(0);
    expect(plan.path.at(-1)).toBe(CIRCUIT1_META.finishVertex);

    // every checkpoint present
    for (const cp of order) expect(plan.path).toContain(cp);

    // checkpoints appear in the required order
    const firstIndex = order.map((cp) => plan.path.indexOf(cp));
    for (let i = 1; i < firstIndex.length; i++) {
      expect(firstIndex[i]!).toBeGreaterThan(firstIndex[i - 1]!);
    }
  });

  it("total cost equals the sum of leg costs", () => {
    const plan = planCheckpointRoute(g, 0, order, CIRCUIT1_META.finishVertex, dcost);
    const sum = plan.legCosts.reduce((a, b) => a + b, 0);
    expect(plan.cost).toBeCloseTo(sum, 9);
  });

  it("A*-per-leg yields the same total cost as Dijkstra-per-leg", () => {
    const viaDijkstra = planCheckpointRoute(g, 0, order, CIRCUIT1_META.finishVertex, dcost);
    const viaAstar = planCheckpointRoute(g, 0, order, CIRCUIT1_META.finishVertex, dcost, undefined, euclideanHeuristic(g));
    expect(viaAstar.cost).toBeCloseTo(viaDijkstra.cost, 9);
  });
});
