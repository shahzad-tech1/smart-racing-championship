/**
 * src/algorithms/bfs.ts — Act 1: Breadth-First Search (spec §5.1).
 *
 * Role: reachability and the MINIMUM-EDGE-COUNT path on an unweighted graph.
 * BFS does NOT minimize distance, travel time or the weighted route cost — that
 * is Dijkstra/A* (Act 2). The §5.1 example proves this: a 1-edge road of length
 * 10 is chosen over a 3-edge path of total length 6.
 *
 * Structures: FIFO queue, visited set, parent map.  Complexity: O(V+E) time, O(V) space.
 * Blocked edges are excluded (spec: "Blocked edges are excluded from route searches").
 */

import type { Graph } from "../core/Graph";
import type { AlgoTrace } from "../core/instrumentation";

export interface BfsResult {
  /** Every vertex reachable from start (respecting direction, excluding blocked edges). */
  reachable: Set<number>;
  /** BFS-tree predecessor of each reachable vertex; start maps to null. */
  parent: Map<number, number | null>;
  /** Edge-count distance from start to each reachable vertex. */
  dist: Map<number, number>;
  /** True iff a goal was given and reached. */
  found: boolean;
  /** start..goal vertex path (minimum edges) when found; otherwise []. */
  path: number[];
  /** Number of edges in `path` when found; otherwise -1. */
  edgeCount: number;
}

export function bfs(
  g: Graph,
  start: number,
  goal?: number,
  trace?: AlgoTrace,
): BfsResult {
  const reachable = new Set<number>([start]);
  const parent = new Map<number, number | null>([[start, null]]);
  const dist = new Map<number, number>([[start, 0]]);

  const queue: number[] = [start];
  let head = 0; // index-based queue avoids O(n) shift()

  if (trace) trace.record({ kind: "enqueue", vertex: start });

  while (head < queue.length) {
    const v = queue[head++]!;
    if (trace) {
      trace.counters.visitedVertices++;
      trace.record({ kind: "visit", vertex: v });
    }
    if (goal !== undefined && v === goal) break; // found the goal; stop early

    for (const { to } of g.neighbors(v, { ignoreBlocked: true })) {
      if (trace) trace.counters.examinedEdges++;
      if (!reachable.has(to)) {
        reachable.add(to);
        parent.set(to, v);
        dist.set(to, (dist.get(v) ?? 0) + 1);
        queue.push(to);
        if (trace) trace.record({ kind: "enqueue", vertex: to });
      }
    }
  }

  let found = false;
  let path: number[] = [];
  let edgeCount = -1;

  if (goal !== undefined && reachable.has(goal)) {
    found = true;
    const rev: number[] = [];
    let cur: number | null | undefined = goal;
    while (cur !== null && cur !== undefined) {
      rev.push(cur);
      cur = parent.get(cur) ?? null;
    }
    path = rev.reverse();
    edgeCount = path.length - 1;
    if (trace) trace.record({ kind: "pathFound", vertices: path, cost: edgeCount });
  }

  return { reachable, parent, dist, found, path, edgeCount };
}

/**
 * Convenience for the Track Explorer: which mandatory checkpoints are reachable
 * from `start`, and which are not. Returns checkpoint vertex ids split in two.
 */
export function reachableCheckpoints(
  g: Graph,
  start: number,
): { reachable: number[]; unreachable: number[] } {
  const { reachable } = bfs(g, start);
  const reach: number[] = [];
  const unreach: number[] = [];
  for (const v of g.allVertices()) {
    if (v.checkpointOrder == null) continue;
    (reachable.has(v.id) ? reach : unreach).push(v.id);
  }
  return { reachable: reach, unreachable: unreach };
}
