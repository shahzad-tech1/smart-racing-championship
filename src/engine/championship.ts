/**
 * src/engine/championship.ts — Act 5: standings & top-k (spec §2.2, §4.6).
 *
 * Aggregates per-race results into championship entries, awards points via the
 * full table, and ranks with the single compareChampionship total order. The
 * champion is the top-ranked entry after the final race.
 */

import type { ChampionshipEntry } from "../core/types";
import type { RaceResultRow } from "./RaceEngine";
import { awardPoints, compareChampionship } from "./comparator";
import { mergeSort, topK } from "../algorithms/sort";

/** Accumulate a list of races (each an array of result rows) into ranked standings. */
export function buildStandings(races: RaceResultRow[][]): ChampionshipEntry[] {
  const byId = new Map<number, ChampionshipEntry>();

  const entryFor = (id: number): ChampionshipEntry => {
    let e = byId.get(id);
    if (!e) {
      e = { racerId: id, totalPoints: 0, wins: 0, sumOfFinishPositions: 0, bestFastestLap: Infinity };
      byId.set(id, e);
    }
    return e;
  };

  for (const race of races) {
    for (const row of race) {
      const e = entryFor(row.racerId);
      e.totalPoints += awardPoints(row.finishPosition) + row.bonusPoints;
      if (row.finishPosition === 1) e.wins++;
      e.sumOfFinishPositions += row.finishPosition;
      e.bestFastestLap = Math.min(e.bestFastestLap, row.fastestLap);
    }
  }

  // ranked with the single total-order comparator (Merge Sort = primary ranking)
  return mergeSort([...byId.values()], compareChampionship);
}

/** The champion is the top-ranked entry (undefined if no races). */
export function champion(races: RaceResultRow[][]): ChampionshipEntry | undefined {
  return buildStandings(races)[0];
}

/** Live top-k racers using the size-k heap (Challenge 3). */
export function topRacers(standings: ChampionshipEntry[], k: number): ChampionshipEntry[] {
  return topK(standings, k, compareChampionship);
}
