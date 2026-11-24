/**
 * tests/algorithms/fixtures.ts — tiny hand-built graphs for Act 1 tests.
 * Covers the spec §9.1 graph cases: single vertex, disconnected, cyclic,
 * branching, directed, plus the §5.1 BFS min-edge example.
 */
import { Graph } from "../../src/core/Graph";
import type { Edge, Vertex } from "../../src/core/types";

export function V(id: number, extra: Partial<Vertex> = {}): Vertex {
  return { id, x: id * 10, y: 0, type: "Intersection", checkpointOrder: null, active: true, ...extra };
}

export function E(id: number, from: number, to: number, extra: Partial<Edge> = {}): Edge {
  return {
    id, from, to,
    distance: 1, baseTime: 1, fuelCost: 1, difficulty: 1,
    status: "Open", isShortcut: false, directed: false,
    ...extra,
  };
}

/** One isolated vertex, no edges. */
export const singleVertex = () => new Graph([V(0)], []);

/** 0 - 1 - 2 - 3 (a path / no cycle). */
export const lineChain = () =>
  new Graph([V(0), V(1), V(2), V(3)], [E(1, 0, 1), E(2, 1, 2), E(3, 2, 3)]);

/** Two components: {0-1} and {2-3}. */
export const disconnected = () =>
  new Graph([V(0), V(1), V(2), V(3)], [E(1, 0, 1), E(2, 2, 3)]);

/** Triangle 0-1-2-0 (one cycle). */
export const triangle = () =>
  new Graph([V(0), V(1), V(2)], [E(1, 0, 1), E(2, 1, 2), E(3, 2, 0)]);

/**
 * The §5.1 example: direct S(0)->T(1) is ONE edge of length 10; the detour
 * S(0)-A(2)-B(3)-T(1) is THREE edges of length 2 each (total distance 6).
 * BFS must choose the 1-edge direct road (fewest edges), not the shorter detour.
 */
export const bfsEdgeExample = () =>
  new Graph(
    [V(0), V(1), V(2), V(3)],
    [
      E(1, 0, 1, { distance: 10, baseTime: 10, fuelCost: 10 }),
      E(2, 0, 2, { distance: 2, baseTime: 2, fuelCost: 2 }),
      E(3, 2, 3, { distance: 2, baseTime: 2, fuelCost: 2 }),
      E(4, 3, 1, { distance: 2, baseTime: 2, fuelCost: 2 }),
    ],
  );

/** Directed 0->1->2, with 2 unable to reach 0 (one-way). */
export const directedLine = () =>
  new Graph(
    [V(0), V(1), V(2)],
    [E(1, 0, 1, { directed: true }), E(2, 1, 2, { directed: true })],
  );
