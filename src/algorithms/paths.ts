/**
 * src/algorithms/paths.ts — Act 1: bounded simple-path enumeration (spec §5.1).
 *
 * The "important correction" in §5.1: one DFS traversal is O(V+E), but enumerating
 * ALL simple paths is exponential in the worst case. So the alternative-route panel
 * MUST impose and document hard limits. This function caps both the number of paths
 * returned (`maxPaths`) and the path length in edges (`maxLen`); it can therefore
 * never blow up, regardless of graph size.
 */

import type { Graph } from "../core/Graph";
import type { AlgoTrace } from "../core/instrumentation";

export interface PathLimit {
  /** Stop after collecting this many paths. */
  maxPaths: number;
  /** Abandon a branch once it reaches this many edges. */
  maxLen: number;
}

/** All simple (vertex-disjoint) start->goal paths, up to the documented limits. */
export function enumerateSimplePaths(
  g: Graph,
  start: number,
  goal: number,
  limit: PathLimit,
  trace?: AlgoTrace,
): number[][] {
  if (start === goal) return [[start]];

  const results: number[][] = [];
  const path: number[] = [start];
  const onPath = new Set<number>([start]);

  // returns false to signal "stop the whole search" (limit reached)
  const walk = (u: number, depthEdges: number): boolean => {
    if (results.length >= limit.maxPaths) return false;
    if (depthEdges >= limit.maxLen) return true;

    for (const { to } of g.neighbors(u, { ignoreBlocked: true })) {
      if (trace) trace.counters.examinedEdges++;
      if (onPath.has(to)) continue; // keep paths simple (no repeated vertex)

      path.push(to);
      onPath.add(to);

      if (to === goal) {
        results.push([...path]);
        if (trace) trace.record({ kind: "pathFound", vertices: [...path], cost: path.length - 1 });
        path.pop();
        onPath.delete(to);
        if (results.length >= limit.maxPaths) return false;
        continue;
      }

      const keepGoing = walk(to, depthEdges + 1);
      path.pop();
      onPath.delete(to);
      if (!keepGoing) return false;
    }
    return true;
  };

  walk(start, 0);
  return results;
}

/** True if two vertex paths are identical sequences. */
export function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Alternative routes (spec §5.1): simple start->goal paths that differ from the
 * given main route by at least one edge. Bounded by the same limits.
 */
export function alternativeRoutes(
  g: Graph,
  start: number,
  goal: number,
  mainRoute: number[],
  limit: PathLimit,
  trace?: AlgoTrace,
): number[][] {
  return enumerateSimplePaths(g, start, goal, limit, trace).filter(
    (p) => !samePath(p, mainRoute),
  );
}
