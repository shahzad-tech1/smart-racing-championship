/**
 * src/data/circuits/circuit1.ts — Hand-authored circuit fixture (Phase 0).
 *
 * Structure (satisfies spec §4.1 feature list):
 *   - 12-node outer ring = the required CYCLE and the main race loop.
 *   - Start (v0) and Finish (v11); ring edge 11->0 is the lap boundary.
 *   - 10 mandatory CHECKPOINTS v1..v10 with checkpointOrder 1..10.
 *   - 2 SHORTCUTS: cross-chords 2-8 and 4-10 (shorter than the ring arc, harder).
 *   - 1 extra alternative route through centre Intersection v14 (1-14-7).
 *   - Services: FuelStation v12 (spur off v3), NitroPickup v13 (spur off v9).
 *   - 1 DEAD END v15 (spur off v6): non-mandatory, finish unreachable without reversing.
 *
 * Edge distances are the Euclidean length between endpoints, so distance is a valid
 * straight-line lower bound and the A* Euclidean heuristic is admissible.
 *
 * NOTE: full playability validation (ordered-checkpoint reachability, lap/return,
 * ≥2 alternative routes, feasible fuel plan) is the Phase-4 validator's job. This
 * fixture gives the 3D renderer real data to draw and feeds `measure-refs`.
 */

import { Graph } from "../../core/Graph";
import type { Edge, Vertex } from "../../core/types";

export const CIRCUIT1_VERTICES: Vertex[] = [
  { id: 0, x: 400, y: 80, type: "Start", checkpointOrder: null, active: true },
  { id: 1, x: 510, y: 109, type: "Checkpoint", checkpointOrder: 1, active: true },
  { id: 2, x: 591, y: 190, type: "Checkpoint", checkpointOrder: 2, active: true },
  { id: 3, x: 620, y: 300, type: "Checkpoint", checkpointOrder: 3, active: true },
  { id: 4, x: 591, y: 410, type: "Checkpoint", checkpointOrder: 4, active: true },
  { id: 5, x: 510, y: 491, type: "Checkpoint", checkpointOrder: 5, active: true },
  { id: 6, x: 400, y: 520, type: "Checkpoint", checkpointOrder: 6, active: true },
  { id: 7, x: 290, y: 491, type: "Checkpoint", checkpointOrder: 7, active: true },
  { id: 8, x: 209, y: 410, type: "Checkpoint", checkpointOrder: 8, active: true },
  { id: 9, x: 180, y: 300, type: "Checkpoint", checkpointOrder: 9, active: true },
  { id: 10, x: 209, y: 190, type: "Checkpoint", checkpointOrder: 10, active: true },
  { id: 11, x: 290, y: 109, type: "Finish", checkpointOrder: null, active: true },
  { id: 12, x: 620, y: 470, type: "FuelStation", checkpointOrder: null, active: true },
  { id: 13, x: 180, y: 470, type: "NitroPickup", checkpointOrder: null, active: true },
  { id: 14, x: 400, y: 300, type: "Intersection", checkpointOrder: null, active: true },
  { id: 15, x: 700, y: 110, type: "DeadEnd", checkpointOrder: null, active: true },
];

export const CIRCUIT1_EDGES: Edge[] = [
  // outer ring (the cycle + main loop)
  { id: 1, from: 0, to: 1, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 2, from: 1, to: 2, distance: 115, baseTime: 3.83, fuelCost: 6, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 3, from: 2, to: 3, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 3, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 4, from: 3, to: 4, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 5, from: 4, to: 5, distance: 115, baseTime: 3.83, fuelCost: 6, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 6, from: 5, to: 6, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 3, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 7, from: 6, to: 7, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 8, from: 7, to: 8, distance: 115, baseTime: 3.83, fuelCost: 6, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 9, from: 8, to: 9, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 3, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 10, from: 9, to: 10, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 11, from: 10, to: 11, distance: 115, baseTime: 3.83, fuelCost: 6, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 12, from: 11, to: 0, distance: 114, baseTime: 3.8, fuelCost: 6, difficulty: 3, status: "Open", isShortcut: false, directed: false, obstacle: 0 }, // lap boundary
  // shortcuts (cross-chords: shorter than the 6-arc ring path, but hard + hazardous)
  { id: 13, from: 2, to: 8, distance: 441, baseTime: 14.7, fuelCost: 22, difficulty: 5, status: "Open", isShortcut: true, directed: false, obstacle: 3 },
  { id: 14, from: 4, to: 10, distance: 441, baseTime: 14.7, fuelCost: 22, difficulty: 4, status: "Open", isShortcut: true, directed: false, obstacle: 3 },
  // alternative route through the centre intersection
  { id: 15, from: 1, to: 14, distance: 220, baseTime: 7.33, fuelCost: 11, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 16, from: 14, to: 7, distance: 220, baseTime: 7.33, fuelCost: 11, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  // service spurs
  { id: 17, from: 3, to: 12, distance: 170, baseTime: 5.67, fuelCost: 8, difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  { id: 18, from: 9, to: 13, distance: 170, baseTime: 5.67, fuelCost: 8, difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
  // dead-end spur
  { id: 19, from: 6, to: 15, distance: 508, baseTime: 16.93, fuelCost: 25, difficulty: 3, status: "Open", isShortcut: false, directed: false, obstacle: 0 },
];

export function buildCircuit1(): Graph {
  // Build from COPIES so in-race mutations (block/unblock, activate/deactivate)
  // never leak back into the shared module-level fixture or into another Graph
  // built from it. The fixture arrays must stay pristine.
  return new Graph(
    CIRCUIT1_VERTICES.map((v) => ({ ...v })),
    CIRCUIT1_EDGES.map((e) => ({ ...e })),
  );
}

export const CIRCUIT1_META = {
  id: "circuit1",
  name: "Neon Ring",
  startVertex: 0,
  finishVertex: 11,
  laps: 2,
  checkpointOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
} as const;
