/**
 * src/algorithms/route.ts — Act 2: checkpoint-aware route planning (spec §5.2).
 *
 * The route planner MUST preserve mandatory checkpoint order. We plan leg-by-leg:
 * current -> next required checkpoint -> ... -> finish, running a shortest-path
 * search per leg and concatenating. A path directly to the finish is NOT valid
 * while checkpoints remain. After a closure or cost change, call this again from
 * the racer's current state to recompute.
 */

import type { Graph } from "../core/Graph";
import type { AlgoTrace } from "../core/instrumentation";
import type { EdgeCostFn, HeuristicFn, PathResult } from "./pathTypes";
import { NOT_FOUND } from "./pathTypes";
import { dijkstra } from "./dijkstra";
import { aStar } from "./astar";
import { bfs } from "./bfs";

export type RouteSolver = 'dijkstra' | 'astar' | 'bfs' | 'dfs';

/** DFS path finder: returns the FIRST path found (not cost-optimal). */
function dfsFindPath(g: Graph, start: number, goal: number): PathResult {
  if (start === goal) return { found: true, path: [start], cost: 0, edges: [] };
  const parent = new Map<number, { v: number; edgeId: number }>();
  const visited = new Set<number>([start]);
  const stack = [start];
  let found = false;
  while (stack.length > 0) {
    const u = stack.pop()!;
    if (u === goal) { found = true; break; }
    for (const { edge, to } of g.neighbors(u, { ignoreBlocked: true })) {
      if (visited.has(to)) continue;
      visited.add(to);
      parent.set(to, { v: u, edgeId: edge.id });
      stack.push(to);
    }
  }
  if (!found) return { found: false, path: [], cost: Infinity, edges: [] };
  const rpath: number[] = [];
  const redges: number[] = [];
  let c: number | undefined = goal;
  while (c !== undefined && c !== start) {
    rpath.push(c);
    const entry: { v: number; edgeId: number } = parent.get(c)!;
    redges.push(entry.edgeId);
    c = entry.v;
  }
  rpath.push(start);
  rpath.reverse();
  redges.reverse();
  return { found: true, path: rpath, cost: redges.length, edges: redges };
}

/** BFS path finder: fewest-edge path (not cost-optimal). */
function bfsFindPath(g: Graph, start: number, goal: number): PathResult {
  const r = bfs(g, start, goal);
  if (!r.found) return { found: false, path: [], cost: Infinity, edges: [] };
  const edgeIds: number[] = [];
  for (let i = 0; i + 1 < r.path.length; i++) {
    const hops = g.neighbors(r.path[i]!, { ignoreBlocked: true }).filter((n) => n.to === r.path[i + 1]);
    if (hops.length) edgeIds.push(hops.reduce((a, b) => (b.edge.distance < a.edge.distance ? b : a)).edge.id);
  }
  return { found: true, path: r.path, cost: r.edgeCount, edges: edgeIds };
}

export interface RoutePlan extends PathResult {
  /** Cost of each leg, in order (from->cp1, cp1->cp2, ..., ->finish). */
  legCosts: number[];
  /** The ordered waypoints that were routed through (from, checkpoints..., finish). */
  waypoints: number[];
}

/**
 * Plan a route from `from` visiting `orderedCheckpoints` IN ORDER, then `finish`.
 * Uses Dijkstra per leg by default; pass a heuristic to use A* per leg instead.
 * The `solver` override selects BFS (fewest edges) or DFS (first path found).
 */
export function planCheckpointRoute(
  g: Graph,
  from: number,
  orderedCheckpoints: number[],
  finish: number,
  cost: EdgeCostFn,
  trace?: AlgoTrace,
  heuristic?: HeuristicFn,
  solver?: RouteSolver,
): RoutePlan {
  const waypoints = [from, ...orderedCheckpoints, finish];
  const fullPath: number[] = [from];
  const fullEdges: number[] = [];
  const legCosts: number[] = [];
  let total = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    if (a === b) {
      legCosts.push(0);
      continue;
    }
    let leg: PathResult;
    if (solver === 'bfs') {
      leg = bfsFindPath(g, a, b);
    } else if (solver === 'dfs') {
      leg = dfsFindPath(g, a, b);
    } else if (heuristic || solver === 'astar') {
      leg = aStar(g, a, b, cost, heuristic ?? ((v: number) => { const vd = g.getVertex(v), gv = g.getVertex(b); return Math.hypot(vd.x - gv.x, vd.y - gv.y) * 0.01; }), trace);
    } else {
      leg = dijkstra(g, a, b, cost, trace);
    }
    if (!leg.found) {
      return { ...NOT_FOUND, legCosts, waypoints };
    }
    fullPath.push(...leg.path.slice(1));
    fullEdges.push(...leg.edges);
    legCosts.push(leg.cost);
    total += leg.cost;
  }

  return { found: true, path: fullPath, cost: total, edges: fullEdges, legCosts, waypoints };
}
