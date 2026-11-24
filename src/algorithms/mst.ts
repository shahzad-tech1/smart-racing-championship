/**
 * src/algorithms/mst.ts — Act 4: Minimum Spanning Tree via Kruskal (spec §5.4).
 *
 * Builds the undirected MST "backbone" for track generation. O(E log E) with
 * union-find. We ship Kruskal (not Prim); either satisfies the checklist.
 *
 * If the candidate graph is disconnected the result is a minimum spanning FOREST
 * (one tree per component) — the generator must ensure connectivity before relying
 * on a single spanning tree (spec §5.4).
 */

import type { Graph } from "../core/Graph";
import type { Edge } from "../core/types";
import { UnionFind } from "../core/UnionFind";
import type { AlgoTrace } from "../core/instrumentation";

/**
 * @param weight edge weight (default: distance).
 * @returns the chosen MST/forest edges, in the order Kruskal selected them.
 */
export function kruskalMST(
  g: Graph,
  weight: (e: Edge) => number = (e) => e.distance,
  trace?: AlgoTrace,
): Edge[] {
  // map arbitrary vertex ids to dense 0..n-1 indices for union-find
  const index = new Map<number, number>();
  for (const v of g.allVertices()) index.set(v.id, index.size);
  const uf = new UnionFind(index.size);

  const edges = g
    .allEdges()
    .filter((e) => e.status !== "Blocked")
    .slice()
    .sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa !== wb) return wa - wb;
      return a.id - b.id; // deterministic tie-break
    });

  const chosen: Edge[] = [];
  for (const e of edges) {
    if (trace) trace.counters.examinedEdges++;
    const a = index.get(e.from)!;
    const b = index.get(e.to)!;
    if (uf.union(a, b)) {
      chosen.push(e);
      if (trace) trace.record({ kind: "relax", edge: e.id, improved: true });
      if (chosen.length === index.size - 1) break; // full spanning tree reached
    }
  }
  return chosen;
}

/** Total weight of an MST/forest edge set. */
export function mstWeight(edges: Edge[], weight: (e: Edge) => number = (e) => e.distance): number {
  return edges.reduce((sum, e) => sum + weight(e), 0);
}
