/**
 * src/state/session.ts — the championship session shared by Racing and Dashboard.
 * Races run in the Racing screen (or are simulated headlessly by the same engine)
 * push their real results here; the Dashboard only reads.
 */
import { Championship } from './Championship.ts';
import type { PresetName } from '../core/cost.ts';

/** A route plan chosen in the Track Explorer; the race engine drives the player's car with it. */
export interface RoutePlan {
  circuitId: string;
  algorithm: 'Dijkstra' | 'A*';
  preset: PresetName;
}

export const session = {
  championship: new Championship(),
  /** Names for the four grid slots, keyed by racer id. */
  racerNames: { 1: 'You', 2: 'A* Racer', 3: 'BFS Scout', 4: 'DFS Diver' } as Record<number, string>,
  /** Garage livery for the player's car (presentation only). */
  livery: 'white' as string,
  /** Set by "Race this plan" in the Track Explorer; read once by the Racing screen. */
  plan: null as RoutePlan | null,
  reset(): void {
    this.championship.reset();
  },
};

export function racerName(id: number): string {
  return session.racerNames[id] ?? `Racer ${id}`;
}
