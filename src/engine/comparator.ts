/**
 * src/engine/comparator.ts — the ONE championship total order (spec §4.6).
 *
 * Every sort and the top-k heap use compareChampionship and nothing else, so all
 * ranking methods agree exactly. Order of precedence:
 *   1) higher totalPoints
 *   2) higher wins
 *   3) lower sumOfFinishPositions
 *   4) lower bestFastestLap   (lower lap time is better)
 *   5) lower racerId          (final deterministic tie-breaker)
 *
 * Returns < 0 if a ranks ahead of b, > 0 if b ahead, 0 only for identical ids
 * (never for two distinct racers — the order is total).
 */

import type { ChampionshipEntry } from "../core/types";

/** Points for finishing positions 1..10 (spec §4.6); 0 beyond 10th. */
export const POINTS: readonly number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function awardPoints(position: number): number {
  return position >= 1 && position <= POINTS.length ? POINTS[position - 1]! : 0;
}

export function compareChampionship(a: ChampionshipEntry, b: ChampionshipEntry): number {
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (a.sumOfFinishPositions !== b.sumOfFinishPositions) {
    return a.sumOfFinishPositions - b.sumOfFinishPositions;
  }
  if (a.bestFastestLap !== b.bestFastestLap) return a.bestFastestLap - b.bestFastestLap;
  return a.racerId - b.racerId;
}
