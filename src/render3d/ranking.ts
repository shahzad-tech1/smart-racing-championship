/**
 * src/render3d/ranking.ts — live race order for the HUD tower (display only; the
 * authoritative finishing order is RaceEngine.results()).
 */
import type { RacerSnapshot } from '../engine/RaceEngine';

export interface RankInput {
  snap: RacerSnapshot;
  /** Straight-line distance to the next required checkpoint (smaller = further ahead). */
  distToNext: number;
}

/** Order: finished (by time) > racing (lap, checkpoints, then closer to next checkpoint) > DNF. */
export function liveOrder(rows: RankInput[]): RankInput[] {
  const rank = (s: RacerSnapshot): number => (s.status === 'finished' ? 0 : s.status === 'racing' ? 1 : 2);
  return [...rows].sort((a, b) => {
    const ra = rank(a.snap);
    const rb = rank(b.snap);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.snap.totalTime - b.snap.totalTime || a.snap.id - b.snap.id;
    if (ra === 2) return a.snap.id - b.snap.id;
    if (a.snap.lap !== b.snap.lap) return b.snap.lap - a.snap.lap;
    if (a.snap.checkpointProgress !== b.snap.checkpointProgress) return b.snap.checkpointProgress - a.snap.checkpointProgress;
    return a.distToNext - b.distToNext || a.snap.id - b.snap.id;
  });
}
