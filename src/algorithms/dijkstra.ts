/**
 * src/algorithms/dijkstra.ts — Act 2: Dijkstra's shortest path (spec §5.2).
 *
 * Optimal path for NON-NEGATIVE edge costs. O((V+E) log V) with a binary heap.
 * Blocked edges are excluded (via neighbors ignoreBlocked). Restricted edges stay
 * traversable; their effective cost is whatever the supplied `cost` function
 * returns (the cost model applies restriction effects there).
 *
 * Lazy deletion: we push (vertex, dist) entries and skip any popped entry whose
 * dist is stale (the vertex was already finalized). Simpler than decrease-key and
 * fine for sparse road graphs.
 */

import type { Graph } from "../core/Graph";
import { BinaryHeap } from "../core/BinaryHeap";
import type { AlgoTrace } from "../core/instrumentation";
import type { EdgeCostFn, PathResult } from "./pathTypes";

interface QEntry {
  vertex: number;
  dist: number;
  seq: number; // tie-break for deterministic heap order
}

export function dijkstra(
  g: Graph,
  start: number,
  goal: number,
  cost: EdgeCostFn,
  trace?: AlgoTrace,
): PathResult {
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, { v: number; edgeId: number }>();
  const done = new Set<number>();

  let seq = 0;
  const heap = new BinaryHeap<QEntry>((a, b) =>
    a.dist !== b.dist ? a.dist < b.dist : a.seq < b.seq,
  );
  heap.push({ vertex: start, dist: 0, seq: seq++ });
  if (trace) trace.counters.heapPushes++;

  while (!heap.isEmpty()) {
    const top = heap.pop()!;
    if (trace) trace.counters.heapPops++;
    const u = top.vertex;
    if (done.has(u)) continue; // stale entry (lazy deletion)
    done.add(u);
    if (trace) {
      trace.counters.visitedVertices++;
      trace.record({ kind: "visit", vertex: u });
    }
    if (u === goal) break;

    const du = top.dist;
    for (const { edge, to } of g.neighbors(u, { ignoreBlocked: true })) {
      if (trace) trace.counters.examinedEdges++;
      if (done.has(to)) continue;
      const w = cost(edge);
      const nd = du + w;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { v: u, edgeId: edge.id });
        heap.push({ vertex: to, dist: nd, seq: seq++ });
        if (trace) {
          trace.counters.relaxedEdges++;
          trace.counters.heapPushes++;
          trace.record({ kind: "relax", edge: edge.id, improved: true });
        }
      }
    }
  }

  return reconstruct(start, goal, dist, prev, trace);
}

/** Rebuild the PathResult from the predecessor map. Shared with A*. */
export function reconstruct(
  start: number,
  goal: number,
  dist: Map<number, number>,
  prev: Map<number, { v: number; edgeId: number }>,
  trace?: AlgoTrace,
): PathResult {
  if (start === goal) {
    if (trace) trace.record({ kind: "pathFound", vertices: [start], cost: 0 });
    return { found: true, path: [start], cost: 0, edges: [] };
  }
  if (!dist.has(goal)) return { found: false, path: [], cost: Infinity, edges: [] };

  const path: number[] = [];
  const edges: number[] = [];
  let cur: number | undefined = goal;
  while (cur !== undefined && cur !== start) {
    path.push(cur);
    const p = prev.get(cur);
    if (!p) return { found: false, path: [], cost: Infinity, edges: [] }; // defensive
    edges.push(p.edgeId);
    cur = p.v;
  }
  path.push(start);
  path.reverse();
  edges.reverse();
  const cost = dist.get(goal)!;
  if (trace) trace.record({ kind: "pathFound", vertices: path, cost });
  return { found: true, path, cost, edges };
}
