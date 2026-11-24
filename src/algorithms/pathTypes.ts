/**
 * src/algorithms/pathTypes.ts — shared routing types (contract §7).
 */
import type { Edge } from "../core/types";

/** Cost of traversing a single edge; usually `costFn(weights, refs)` from cost.ts. */
export type EdgeCostFn = (edge: Edge) => number;

/** Admissible estimate of the remaining optimal cost from a vertex to the goal. */
export type HeuristicFn = (vertexId: number, goalId: number) => number;

export interface PathResult {
  found: boolean;
  /** Vertex ids start..goal; empty if not found. */
  path: number[];
  /** The EXACT scalar cost the algorithm minimized; Infinity if not found. This is the value the UI displays. */
  cost: number;
  /** Edge ids traversed along the path, in order; empty if not found. */
  edges: number[];
}

export const NOT_FOUND: PathResult = { found: false, path: [], cost: Infinity, edges: [] };
