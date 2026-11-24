/**
 * src/core/cost.ts — Route cost model (contract §3, spec §3.3).
 *
 * cost(e) = wD·D + wT·T + wF·F + wR·R + wO·O   over NORMALIZED attributes in [0,1].
 *
 * INVARIANT: the value the Route Planner UI displays MUST equal the value the
 * routing algorithm minimizes. Both call edgeCost(); the UI never recomputes cost
 * a second way. See docs/06_COST_MODEL_DEFENSE.md for the rationale and
 * docs/03 §2 for the enforcing test.
 */

import type { Edge } from "./types";

export interface CostWeights {
  wD: number;
  wT: number;
  wF: number;
  wR: number;
  wO: number;
} // all >= 0

export interface NormalizationRefs {
  maxDistance: number;
  maxTime: number;
  maxFuel: number;
  maxDifficulty: number;
  maxObstacle: number;
}

export type PresetName = "Balanced" | "Speed" | "Economy" | "Safety";

/**
 * FROZEN preset weights. Rationale + divergence evidence in docs/06.
 * Re-confirm divergence on the final three circuits before the experiments.
 */
export const PRESETS: Record<PresetName, CostWeights> = {
  Balanced: { wD: 0.2, wT: 0.2, wF: 0.2, wR: 0.2, wO: 0.2 },
  Speed: { wD: 0.15, wT: 0.5, wF: 0.1, wR: 0.15, wO: 0.1 },
  Economy: { wD: 0.15, wT: 0.1, wF: 0.5, wR: 0.15, wO: 0.1 },
  Safety: { wD: 0.1, wT: 0.1, wF: 0.1, wR: 0.4, wO: 0.3 },
};

/**
 * FROZEN normalization references (docs/06). Bounded attributes use fixed maxima;
 * physical attributes use the union-max across all circuits, rounded up for
 * headroom. Re-run `npm run measure-refs` on the final circuits and update here.
 */
export const REFS: NormalizationRefs = {
  maxDistance: 600,
  maxTime: 20,
  maxFuel: 30,
  maxDifficulty: 5,
  maxObstacle: 5,
};

/** Optional hook so routing can cost the Restricted/effect-adjusted edge (Phase 4). */
export type EffectiveEdgeFn = (edge: Edge) => Edge;

/**
 * Speed cap of a Restricted road (spec §3.1: a Restricted edge stays traversable but its
 * effective time/cost must reflect the restriction). Effective time = baseTime / cap, the
 * same rule the SpeedRestriction event uses, so a restriction costs the same either way.
 */
export const RESTRICTED_SPEED_CAP = 0.5;

/** The edge as drivers experience it: a Restricted road is slower; every other status is unchanged. */
export function withRestriction(edge: Edge): Edge {
  return edge.status === "Restricted" ? { ...edge, baseTime: edge.baseTime / RESTRICTED_SPEED_CAP } : edge;
}

/**
 * The single scalar cost of traversing one edge. Non-negative, so Dijkstra applies.
 * Pass `effectiveEdge` (the EffectLayer) to reflect temporary event effects; it must itself
 * apply `withRestriction`. Without it, the Restricted status alone is still honoured.
 */
export function edgeCost(
  edge: Edge,
  weights: CostWeights,
  refs: NormalizationRefs = REFS,
  effectiveEdge?: EffectiveEdgeFn,
): number {
  const e = effectiveEdge ? effectiveEdge(edge) : withRestriction(edge);
  const D = e.distance / refs.maxDistance;
  const T = e.baseTime / refs.maxTime;
  const F = e.fuelCost / refs.maxFuel;
  const R = e.difficulty / refs.maxDifficulty;
  const O = (e.obstacle ?? 0) / refs.maxObstacle;
  return weights.wD * D + weights.wT * T + weights.wF * F + weights.wR * R + weights.wO * O;
}

/** Make an EdgeCostFn bound to weights/refs, for passing to dijkstra()/aStar(). */
export function costFn(
  weights: CostWeights,
  refs: NormalizationRefs = REFS,
  effectiveEdge?: EffectiveEdgeFn,
): (edge: Edge) => number {
  return (edge: Edge) => edgeCost(edge, weights, refs, effectiveEdge);
}
