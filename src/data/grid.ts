/** The four-car starting grid shared by the Racing screen and headless championship simulation. */
import type { Racer } from '../core/types';
import { RULES } from '../engine/rules';
import { racerName } from '../state/session';

export function buildGrid(startVertex: number): Racer[] {
  const base = { currentVertex: startVertex, fuel: RULES.MAX_FUEL_TENTHS, lap: 0, nextCheckpoint: 0, totalTime: 0 };
  return [
    { id: 1, name: racerName(1), isHuman: true, strategyType: 'Human', nitroCharges: 2, ...base },
    { id: 2, name: racerName(2), isHuman: false, strategyType: 'AStarRouter', nitroCharges: 0, ...base },
    { id: 3, name: racerName(3), isHuman: false, strategyType: 'BFSRouter', nitroCharges: 0, ...base },
    { id: 4, name: racerName(4), isHuman: false, strategyType: 'DFSRouter', nitroCharges: 0, ...base },
  ];
}
