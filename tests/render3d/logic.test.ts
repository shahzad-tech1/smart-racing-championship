import { describe, it, expect } from 'vitest';
import { liveOrder, type RankInput } from '../../src/render3d/ranking';
import { heightAt, bridgeLift, kmh } from '../../src/render3d/heightField';
import type { RacerSnapshot } from '../../src/engine/RaceEngine';

const snap = (o: Partial<RacerSnapshot>): RacerSnapshot => ({
  id: 1, name: 'x', isHuman: false, strategyType: 'FixedMainRoute', currentVertex: 0, edgeId: null, progress: 0, fuelTenths: 1000, nitro: 0, nitroActive: false,
  lap: 0, checkpointProgress: 0, totalTime: 0, status: 'racing', ...o,
});

describe('liveOrder', () => {
  it('ranks finished before racing before DNF', () => {
    const rows: RankInput[] = [
      { snap: snap({ id: 1, status: 'dnf' }), distToNext: 0 },
      { snap: snap({ id: 2, status: 'racing', checkpointProgress: 5 }), distToNext: 10 },
      { snap: snap({ id: 3, status: 'finished', totalTime: 80 }), distToNext: 0 },
    ];
    expect(liveOrder(rows).map((r) => r.snap.id)).toEqual([3, 2, 1]);
  });
  it('orders racers by lap, checkpoints, then distance to the next checkpoint', () => {
    const rows: RankInput[] = [
      { snap: snap({ id: 1, lap: 0, checkpointProgress: 4 }), distToNext: 5 },
      { snap: snap({ id: 2, lap: 1, checkpointProgress: 0 }), distToNext: 90 },
      { snap: snap({ id: 3, lap: 0, checkpointProgress: 4 }), distToNext: 2 },
    ];
    expect(liveOrder(rows).map((r) => r.snap.id)).toEqual([2, 3, 1]);
  });
  it('is deterministic on exact ties (lower id first)', () => {
    const rows: RankInput[] = [
      { snap: snap({ id: 4 }), distToNext: 1 },
      { snap: snap({ id: 2 }), distToNext: 1 },
    ];
    expect(liveOrder(rows).map((r) => r.snap.id)).toEqual([2, 4]);
  });
});

describe('height field', () => {
  it('is deterministic and finite', () => {
    expect(heightAt(120, -40)).toBe(heightAt(120, -40));
    expect(Number.isFinite(heightAt(1e3, 1e3))).toBe(true);
  });
  it('bridge arch is zero at the ends and peaks mid-span', () => {
    expect(bridgeLift(0, 8)).toBeCloseTo(0, 5);
    expect(bridgeLift(1, 8)).toBeCloseTo(0, 5);
    expect(bridgeLift(0.5, 8)).toBeGreaterThan(bridgeLift(0.2, 8));
  });
  it('converts world speed to km/h at 1 unit = 1.8 m', () => {
    expect(kmh(10)).toBeCloseTo(10 * 1.8 * 3.6, 5);
  });
});
