/**
 * src/data/circuits/index.ts — Circuit registry.
 * Circuits 2 & 3 (generated via MST + backtracking) are added in Phase 4.
 */

import type { Graph } from "../../core/Graph";
import { buildCircuit1, CIRCUIT1_META } from "./circuit1";

export interface CircuitMeta {
  id: string;
  name: string;
  startVertex: number;
  finishVertex: number;
  laps: number;
  checkpointOrder: readonly number[];
}

export interface CircuitDef {
  meta: CircuitMeta;
  build: () => Graph;
}

export const CIRCUITS: CircuitDef[] = [
  { meta: CIRCUIT1_META, build: buildCircuit1 },
  // Phase 4: { meta: CIRCUIT2_META, build: buildCircuit2 },
  // Phase 4: { meta: CIRCUIT3_META, build: buildCircuit3 },
];

/** Built Graph instances — consumed by measure-refs and the UI. */
export const ALL_CIRCUITS: Graph[] = CIRCUITS.map((c) => c.build());
