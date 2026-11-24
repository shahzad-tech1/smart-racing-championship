import { describe, it, expect } from 'vitest';
import { recordingTrace, countingTrace } from '../../src/core/instrumentation';
import { mergeSort, quickSort, heapSort } from '../../src/algorithms/sort';
import { dijkstra } from '../../src/algorithms/dijkstra';
import { aStar, weightedHeuristic } from '../../src/algorithms/astar';
import { placeObstacles } from '../../src/algorithms/generate';
import { makeRng } from '../../src/core/rng';
import { costFn, PRESETS, REFS } from '../../src/core/cost';
import { CIRCUITS } from '../../src/data/circuits';
import { ALGOS, runAlgo } from '../../src/ui/lab/labAlgos';

const cmp = (a: number, b: number): number => a - b;
const sample = [9, 3, 7, 1, 8, 2, 6, 5, 4, 0, 11, 10];

describe('traces do not change results', () => {
  it('sorts return the same output with and without a recording trace', () => {
    for (const sort of [mergeSort, quickSort, heapSort]) {
      expect(sort([...sample], cmp, recordingTrace())).toEqual(sort([...sample], cmp));
      expect(sort([...sample], cmp, countingTrace())).toEqual([...sample].sort(cmp));
    }
  });
  it('merge sort records compare + write steps', () => {
    const t = recordingTrace();
    mergeSort([...sample], cmp, t);
    const kinds = new Set((t.steps ?? []).map((s) => s.kind));
    expect(kinds.has('compare')).toBe(true);
    expect(kinds.has('write')).toBe(true);
  });
  it('Dijkstra and A* find the same cost; relax steps carry the target and cost', () => {
    const def = CIRCUITS[0]!;
    const g = def.build();
    const cost = costFn(PRESETS.Balanced, REFS);
    const t1 = recordingTrace();
    const d = dijkstra(g, def.meta.startVertex, def.meta.checkpointOrder[3]!, cost, t1);
    const a = aStar(g, def.meta.startVertex, def.meta.checkpointOrder[3]!, cost, weightedHeuristic(g, cost), recordingTrace());
    expect(a.cost).toBeCloseTo(d.cost, 9);
    const relax = (t1.steps ?? []).filter((s) => s.kind === 'relax');
    expect(relax.length).toBeGreaterThan(0);
    expect(relax.every((s) => s.kind === 'relax' && s.to !== undefined && s.g !== undefined)).toBe(true);
  });
  it('backtracking trace is consistent with its answer and does not change it', () => {
    const t = recordingTrace();
    const withTrace = placeObstacles(14, 5, makeRng(3), t);
    const without = placeObstacles(14, 5, makeRng(3));
    expect(withTrace).toEqual(without);
    const live = new Set<number>();
    for (const s of t.steps ?? []) {
      if (s.kind === 'place') live.add(s.index);
      if (s.kind === 'unplace') live.delete(s.index);
    }
    expect([...live].sort((x, y) => x - y)).toEqual(withTrace);
  });
});

describe('Algorithm Lab catalogue', () => {
  it('lists 12 algorithms and every one runs the real implementation to a result', () => {
    expect(ALGOS).toHaveLength(12);
    const def = CIRCUITS[0]!;
    for (const a of ALGOS) {
      const run = runAlgo(a.id, def.build(), def.meta, 5);
      expect(run.result.length, a.id).toBeGreaterThan(0);
      expect(run.steps.length, a.id).toBeGreaterThan(0);
    }
  });
  it('is deterministic for the same seed', () => {
    const def = CIRCUITS[0]!;
    const a = runAlgo('quick', def.build(), def.meta, 9);
    const b = runAlgo('quick', def.build(), def.meta, 9);
    expect(a.steps).toEqual(b.steps);
  });
});
