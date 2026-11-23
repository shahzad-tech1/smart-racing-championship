/**
 * src/engine/rules.ts — frozen game rules & resource math (spec §4.3).
 * All fuel quantities are integer tenths-of-a-unit (contract §5).
 */

import type { Edge } from "../core/types";

export const RULES = {
  MAX_FUEL_TENTHS: 1000, // 100 units
  FUEL_STATION_MAX_PURCHASE_TENTHS: 400, // 40 units per stop
  FUEL_STATION_STOP_TIME: 3, // seconds for any positive purchase
  MAX_NITRO: 3,
  NITRO_SPEED_MULTIPLIER: 1.5,
  NITRO_DURATION: 4, // seconds
  NITRO_FUEL_PENALTY: 2, // x fuel while active
  REFUEL_THRESHOLD: 0.25, // opponents refuel below 25%
} as const;

/** Fuel (in tenths) to traverse an edge: fuelCost × (1 + 0.1×(difficulty−1)). */
export function fuelForEdge(edge: Edge, nitroActive = false): number {
  const multiplier = 1 + 0.1 * (edge.difficulty - 1);
  const base = edge.fuelCost * multiplier * (nitroActive ? RULES.NITRO_FUEL_PENALTY : 1);
  return Math.round(base * 10); // convert units -> tenths
}

/** Travel time (seconds) across an edge, optionally under nitro. */
export function timeForEdge(edge: Edge, nitroActive = false): number {
  return edge.baseTime / (nitroActive ? RULES.NITRO_SPEED_MULTIPLIER : 1);
}
