import type { ChampionshipEntry } from '../core/types.ts';
import type { RaceResultRow } from '../engine/RaceEngine.ts';
import { buildStandings } from '../engine/championship.ts';
import { topK, mergeSort, quickSort, heapSort } from '../algorithms/sort.ts';
import { compareChampionship } from '../engine/comparator.ts';
import { CIRCUITS, type CircuitDef } from '../data/circuits/index.ts';

export type SortMethod = 'merge' | 'quick' | 'heap';

export interface ChampionshipState {
  raceResults: RaceResultRow[][];
  standings: ChampionshipEntry[];
  currentRaceIndex: number;
  finished: boolean;
  champion: ChampionshipEntry | null;
}

export class Championship {
  private _results: RaceResultRow[][] = [];
  private readonly _circuits: CircuitDef[];
  private _raceIndex = 0;

  constructor(circuits: CircuitDef[] = CIRCUITS) {
    this._circuits = circuits;
  }

  get raceIndex(): number { return this._raceIndex; }
  get circuits(): CircuitDef[] { return this._circuits; }
  get raceCount(): number { return this._circuits.length; }
  get finished(): boolean { return this._raceIndex >= this._circuits.length; }

  addRaceResult(result: RaceResultRow[]): void {
    this._results.push(result);
    this._raceIndex++;
  }

  standings(method: SortMethod = 'merge'): ChampionshipEntry[] {
    const all = buildStandings(this._results);
    if (method === 'quick') return quickSort([...all], compareChampionship);
    if (method === 'heap') return heapSort([...all], compareChampionship);
    return mergeSort([...all], compareChampionship);
  }

  /** Top-k podium using A's topK (size-k heap). */
  topPodium(k = 3): ChampionshipEntry[] {
    const all = buildStandings(this._results);
    return topK([...all], k, compareChampionship);
  }

  get champion(): ChampionshipEntry | null {
    if (!this.finished || this._results.length === 0) return null;
    return buildStandings(this._results)[0] ?? null;
  }

  getState(): ChampionshipState {
    const standings = buildStandings(this._results);
    return {
      raceResults: this._results,
      standings,
      currentRaceIndex: this._raceIndex,
      finished: this.finished,
      champion: this.finished ? (standings[0] ?? null) : null,
    };
  }

  reset(): void {
    this._results = [];
    this._raceIndex = 0;
  }
}
