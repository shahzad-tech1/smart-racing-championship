import { describe, it, expect } from "vitest";
import { POINTS, awardPoints, compareChampionship } from "../../src/engine/comparator";
import { buildStandings, champion, topRacers } from "../../src/engine/championship";
import { mergeSort, quickSort, heapSort, topK } from "../../src/algorithms/sort";
import type { ChampionshipEntry } from "../../src/core/types";
import type { RaceResultRow } from "../../src/engine/RaceEngine";

function row(racerId: number, pos: number, time: number, lap: number): RaceResultRow {
  return { raceId: 0, racerId, finishPosition: pos, finishTime: time, fastestLap: lap, bonusPoints: 0, pointsAwarded: 0 };
}

describe("points table (spec §4.6)", () => {
  it("awards the full 1..10 table and 0 beyond", () => {
    expect(POINTS).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
    expect(awardPoints(1)).toBe(25);
    expect(awardPoints(10)).toBe(1);
    expect(awardPoints(11)).toBe(0);
    expect(awardPoints(0)).toBe(0);
  });
});

describe("compareChampionship tie-break chain", () => {
  const base: ChampionshipEntry = { racerId: 1, totalPoints: 10, wins: 1, sumOfFinishPositions: 5, bestFastestLap: 60 };

  it("orders by points, then wins, then sumPositions, then fastest lap, then id", () => {
    expect(compareChampionship(base, { ...base, racerId: 2, totalPoints: 9 })).toBeLessThan(0); // more points first
    expect(compareChampionship(base, { ...base, racerId: 2, wins: 0 })).toBeLessThan(0); // more wins first
    expect(compareChampionship(base, { ...base, racerId: 2, sumOfFinishPositions: 8 })).toBeLessThan(0); // lower sum first
    expect(compareChampionship(base, { ...base, racerId: 2, bestFastestLap: 70 })).toBeLessThan(0); // lower lap first
  });

  it("falls back to the lower racer ID when everything else ties", () => {
    const a: ChampionshipEntry = { racerId: 3, totalPoints: 10, wins: 1, sumOfFinishPositions: 5, bestFastestLap: 60 };
    const b: ChampionshipEntry = { ...a, racerId: 7 };
    expect(compareChampionship(a, b)).toBeLessThan(0);
    expect(compareChampionship(b, a)).toBeGreaterThan(0);
  });
});

describe("championship standings", () => {
  // race 1: r1 1st, r2 2nd, r3 3rd ; race 2: r2 1st, r1 2nd, r3 3rd
  const races: RaceResultRow[][] = [
    [row(1, 1, 100, 48), row(2, 2, 110, 50), row(3, 3, 120, 55)],
    [row(2, 1, 95, 47), row(1, 2, 101, 46), row(3, 3, 130, 56)],
  ];

  it("aggregates points, wins, positions and best lap", () => {
    const standings = buildStandings(races);
    const r1 = standings.find((e) => e.racerId === 1)!;
    expect(r1.totalPoints).toBe(25 + 18); // 1st + 2nd
    expect(r1.wins).toBe(1);
    expect(r1.sumOfFinishPositions).toBe(1 + 2);
    expect(r1.bestFastestLap).toBe(46);
  });

  it("r1 and r2 tie on points/wins/positions -> broken by best fastest lap", () => {
    // r1: 43 pts, 1 win, sum 3, best lap 46 ; r2: 43 pts, 1 win, sum 3, best lap 47
    const standings = buildStandings(races);
    expect(standings[0]!.racerId).toBe(1); // lower best lap (46 < 47)
    expect(champion(races)!.racerId).toBe(1);
  });

  it("all three sorts agree on the standings order", () => {
    const entries = buildStandings(races);
    const byMerge = mergeSort(entries, compareChampionship).map((e) => e.racerId);
    const byQuick = quickSort(entries, compareChampionship).map((e) => e.racerId);
    const byHeap = heapSort(entries, compareChampionship).map((e) => e.racerId);
    expect(byQuick).toEqual(byMerge);
    expect(byHeap).toEqual(byMerge);
  });

  it("top-k equals the first k of the full standings", () => {
    const entries = buildStandings(races);
    const full = mergeSort(entries, compareChampionship);
    for (const k of [1, 2, entries.length]) {
      expect(topRacers(entries, k)).toEqual(full.slice(0, k));
      expect(topK(entries, k, compareChampionship)).toEqual(full.slice(0, k));
    }
  });

  it("uses the racer-ID tiebreaker when standings are otherwise identical", () => {
    const tie: RaceResultRow[][] = [[row(5, 1, 100, 50), row(2, 1, 100, 50)]];
    // both 1st in their own 'race rows' -> identical stats, lower id (2) ranks first
    const standings = buildStandings(tie);
    expect(standings[0]!.racerId).toBe(2);
  });
});
