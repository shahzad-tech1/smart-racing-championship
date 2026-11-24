/**
 * src/core/instrumentation.ts — Counters & traces (contract §7).
 *
 * This is the mechanism that lets ONE algorithm implementation serve gameplay,
 * the Algorithm Lab and the experiment harness:
 *   - gameplay passes no trace            -> zero overhead
 *   - experiments pass countingTrace()    -> counts only, fast
 *   - the Lab passes recordingTrace()     -> records ordered steps to animate
 *
 * Algorithms MUTATE trace.counters directly (e.g. trace.counters.visitedVertices++)
 * and call trace.record(step) for each visualizable step.
 */

export interface Counters {
  visitedVertices: number;
  examinedEdges: number;
  relaxedEdges: number; // Dijkstra / A*
  heapPushes: number;
  heapPops: number;
  comparisons: number; // sorts
  dpStatesComputed: number; // DP
}

export function makeCounters(): Counters {
  return {
    visitedVertices: 0,
    examinedEdges: 0,
    relaxedEdges: 0,
    heapPushes: 0,
    heapPops: 0,
    comparisons: 0,
    dpStatesComputed: 0,
  };
}

export type AlgoStep =
  | { kind: "visit"; vertex: number }
  | { kind: "enqueue"; vertex: number }
  | { kind: "relax"; edge: number; improved: boolean }
  | { kind: "frontier"; vertices: number[] }
  | { kind: "pathFound"; vertices: number[]; cost: number }
  | { kind: "compare"; i: number; j: number }
  | { kind: "swap"; i: number; j: number }
  | { kind: "dpCell"; i: number; b: number; value: number };

export interface AlgoTrace {
  counters: Counters;
  steps?: AlgoStep[];
  record(step: AlgoStep): void;
}

/** Counts only; does not store steps (use in experiments / hot paths). */
export function countingTrace(): AlgoTrace {
  return {
    counters: makeCounters(),
    record() {
      /* intentionally empty — counting only */
    },
  };
}

/** Records every step for the Algorithm Lab to animate. */
export function recordingTrace(): AlgoTrace {
  const steps: AlgoStep[] = [];
  return {
    counters: makeCounters(),
    steps,
    record(step: AlgoStep) {
      steps.push(step);
    },
  };
}
