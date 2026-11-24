/**
 * src/data/circuits/index.ts — Circuit registry.
 * circuit1 is hand-authored; circuits 2 & 3 are generated (MST + backtracking)
 * from fixed seeds, so they are deterministic and validated.
 */

import type { Graph } from "../../core/Graph";
import type { CircuitMeta } from "./meta";
import { buildCircuit1, CIRCUIT1_META } from "./circuit1";
import { generateCircuit } from "../../algorithms/generate";

export type { CircuitMeta } from "./meta";

export interface CircuitDef {
  meta: CircuitMeta;
  build: () => Graph;
}

const circuit2 = generateCircuit(101, { name: "Vortex" });
const circuit3 = generateCircuit(202, { name: "Serpentine" });

export const CIRCUITS: CircuitDef[] = [
  { meta: CIRCUIT1_META, build: buildCircuit1 },
  { meta: circuit2.meta, build: () => generateCircuit(101, { name: "Vortex" }).graph },
  { meta: circuit3.meta, build: () => generateCircuit(202, { name: "Serpentine" }).graph },
];

/** Built Graph instances — consumed by measure-refs and the UI. */
export const ALL_CIRCUITS: Graph[] = CIRCUITS.map((c) => c.build());
