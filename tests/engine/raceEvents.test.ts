import { describe, it, expect } from 'vitest';
import { CIRCUITS } from '../../src/data/circuits';
import { buildRaceEvents } from '../../src/data/raceEvents';
import { buildGrid } from '../../src/data/grid';
import { RaceEngine } from '../../src/engine/RaceEngine';

function runRace(i: number) {
  const def = CIRCUITS[i]!;
  const g = def.build();
  const m = def.meta;
  const ev = buildRaceEvents(g, m);
  const e = new RaceEngine(g, buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps }, ev);
  e.run();
  return { ev, results: e.results(0) };
}

describe('race events + grid', () => {
  it('the schedule is deterministic and well-formed for every circuit', () => {
    CIRCUITS.forEach((def, i) => {
      const a = buildRaceEvents(def.build(), def.meta);
      const b = buildRaceEvents(def.build(), def.meta);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(0);
      expect(new Set(a.map((x) => x.eventId)).size).toBe(a.length);
      void i;
    });
  });
  it('a full evented race is reproducible and every driver gets a distinct position', () => {
    for (let i = 0; i < CIRCUITS.length; i++) {
      const r1 = runRace(i);
      const r2 = runRace(i);
      expect(r1.results).toEqual(r2.results);
      expect(new Set(r1.results.map((r) => r.finishPosition)).size).toBe(r1.results.length);
    }
  });
  it('the grid has one human and unique ids', () => {
    const grid = buildGrid(0);
    expect(grid.filter((r) => r.isHuman)).toHaveLength(1);
    expect(new Set(grid.map((r) => r.id)).size).toBe(grid.length);
  });
});
