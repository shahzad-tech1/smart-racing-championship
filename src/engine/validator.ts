/**
 * src/engine/validator.ts — track playability validator (spec §5.4).
 *
 * A connected graph is NOT automatically playable. Validation confirms:
 *   1. connectivity (start, finish and every checkpoint in one component);
 *   2. ordered-checkpoint reachability (start->cp1->...->cp10->finish) and the
 *      lap/return transition (finish->start);
 *   3. at least two alternative start->finish routes;
 *   4. at least one feasible fuel plan (full tank + refuels along the route).
 *
 * Reuses the SAME BFS / routing / fuel code as gameplay (integration, not a
 * detached duplicate). Returns reasons so an invalid candidate can be explained
 * (Challenge 1).
 */

import type { Graph } from "../core/Graph";
import { bfs } from "../algorithms/bfs";
import { weaklyConnectedComponents } from "../algorithms/dfs";
import { enumerateSimplePaths } from "../algorithms/paths";
import { planCheckpointRoute } from "../algorithms/route";
import { costFn, PRESETS } from "../core/cost";
import { RULES, fuelForEdge } from "./rules";

export interface CircuitMetaLike {
  startVertex: number;
  finishVertex: number;
  checkpointOrder: readonly number[];
}

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

export function validateCircuit(g: Graph, meta: CircuitMetaLike): ValidationResult {
  const reasons: string[] = [];
  const { startVertex: start, finishVertex: finish, checkpointOrder } = meta;

  // 1. connectivity
  const comps = weaklyConnectedComponents(g);
  const compOf = new Map<number, number>();
  comps.forEach((c, i) => c.forEach((v) => compOf.set(v, i)));
  const required = [start, finish, ...checkpointOrder];
  const startComp = compOf.get(start);
  if (required.some((v) => compOf.get(v) !== startComp)) {
    reasons.push("Not all of start/finish/checkpoints are in one connected component.");
  }

  // 2. ordered reachability + lap return
  const sequence = [start, ...checkpointOrder, finish];
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i]!;
    const b = sequence[i + 1]!;
    if (!bfs(g, a, b).found) {
      reasons.push(`Checkpoint sequence broken: ${a} cannot reach ${b}.`);
    }
  }
  if (!bfs(g, finish, start).found) {
    reasons.push("Lap/return transition broken: finish cannot reach start.");
  }

  // 3. at least two alternative start->finish routes
  const paths = enumerateSimplePaths(g, start, finish, { maxPaths: 2, maxLen: g.vertexCount });
  if (paths.length < 2) {
    reasons.push("Fewer than two alternative start->finish routes exist.");
  }

  // 4. at least one feasible fuel plan over the checkpoint route
  if (!hasFeasibleFuelPlan(g, start, checkpointOrder, finish)) {
    reasons.push("No feasible fuel plan for the checkpoint route.");
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Feasibility proxy: start with a full tank; traverse the ordered checkpoint
 * route; refuel to full when passing an active fuel station. If the fuel used
 * between two refuel opportunities would exceed capacity, the plan is infeasible.
 */
function hasFeasibleFuelPlan(
  g: Graph,
  start: number,
  checkpointOrder: readonly number[],
  finish: number,
): boolean {
  const plan = planCheckpointRoute(g, start, [...checkpointOrder], finish, costFn(PRESETS.Balanced));
  if (!plan.found) return false;

  let sinceRefuel = 0; // fuel (tenths) used since last full tank
  for (let i = 0; i < plan.edges.length; i++) {
    const edge = g.getEdge(plan.edges[i]!);
    sinceRefuel += fuelForEdge(edge);
    if (sinceRefuel > RULES.MAX_FUEL_TENTHS) return false;
    // arriving at the far vertex of this edge: refuel if it's an active station
    const arrived = g.getVertex(plan.path[i + 1]!);
    if (arrived.type === "FuelStation" && arrived.active) sinceRefuel = 0;
  }
  return true;
}
