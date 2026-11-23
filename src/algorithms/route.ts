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

export interface RoutePlan extends PathResult {
  /** Cost of each leg, in order (from->cp1, cp1->cp2, ..., ->finish). */
  legCosts: number[];
  /** The ordered waypoints that were routed through (from, checkpoints..., finish). */
  waypoints: number[];
}

/**
 * Plan a route from `from` visiting `orderedCheckpoints` IN ORDER, then `finish`.
 * Uses Dijkstra per leg by default; pass a heuristic to use A* per leg instead.
 */
export function planCheckpointRoute(
  g: Graph,
  from: number,
  orderedCheckpoints: number[],
  finish: number,
  cost: EdgeCostFn,
  trace?: AlgoTrace,
  heuristic?: HeuristicFn,
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
      continue; // already there (e.g. from == first checkpoint)
    }
    const leg = heuristic
      ? aStar(g, a, b, cost, heuristic, trace)
      : dijkstra(g, a, b, cost, trace);
    if (!leg.found) {
      return { ...NOT_FOUND, legCosts, waypoints };
    }
    // append leg path without duplicating the shared waypoint vertex
    fullPath.push(...leg.path.slice(1));
    fullEdges.push(...leg.edges);
    legCosts.push(leg.cost);
    total += leg.cost;
  }

  return { found: true, path: fullPath, cost: total, edges: fullEdges, legCosts, waypoints };
}
