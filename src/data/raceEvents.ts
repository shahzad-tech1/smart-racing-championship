/**
 * src/data/raceEvents.ts — deterministic live-event schedule for a circuit (spec §4.5).
 * Same graph + meta => the same schedule, so races stay reproducible.
 * Events are chosen from the real route the racers drive, so each one is visible:
 * a closure lands on the main route (forcing a recalculated detour), an oil spill and
 * speed cap hit later legs, a shortcut is toggled, a nitro booster is armed.
 */
import type { Graph } from '../core/Graph';
import type { CircuitMeta } from './circuits/meta';
import type { EventType } from '../core/types';
import type { ScheduledEvent } from '../engine/EventScheduler';
import { planCheckpointRoute } from '../algorithms/route';
import { costFn, PRESETS, REFS } from '../core/cost';

/** Spec §4.5 priority numbers (lower fires first on ties). */
export const EVENT_PRIORITY: Record<EventType, number> = {
  RoadBlockage: 1,
  ShortcutToggle: 2,
  OilSpill: 3,
  SpeedRestriction: 4,
  FuelStationAvailability: 5,
  NitroBooster: 6,
};

export const EVENT_LABEL: Record<EventType, string> = {
  RoadBlockage: 'Road closure',
  ShortcutToggle: 'Shortcut closed',
  OilSpill: 'Oil spill',
  SpeedRestriction: 'Speed restriction',
  FuelStationAvailability: 'Fuel station online',
  NitroBooster: 'Nitro booster armed',
};

export function buildRaceEvents(graph: Graph, meta: CircuitMeta): ScheduledEvent[] {
  const plan = planCheckpointRoute(
    graph,
    meta.startVertex,
    [...meta.checkpointOrder],
    meta.finishVertex,
    costFn(PRESETS.Balanced, REFS),
  );
  const route = plan.found ? plan.edges : [];
  const events: ScheduledEvent[] = [];
  let id = 1;
  const add = (type: EventType, triggerTime: number, target: number, duration: number): void => {
    events.push({ eventId: id++, type, triggerTime, priority: EVENT_PRIORITY[type], targetEdgeOrVertex: target, duration });
  };
  const pick = (i: number): number | undefined => (route.length ? route[i % route.length] : undefined);

  const nitroVertex = graph.allVertices().find((v) => v.type === 'NitroPickup');
  if (nitroVertex) add('NitroBooster', 5, nitroVertex.id, 25);

  const closure = pick(3);
  if (closure !== undefined) add('RoadBlockage', 11, closure, 16);
  const oil = pick(6);
  if (oil !== undefined) add('OilSpill', 15, oil, 20);
  const cap = pick(9);
  if (cap !== undefined) add('SpeedRestriction', 21, cap, 15);

  const shortcut = graph.allEdges().find((e) => e.isShortcut && e.status === 'Open');
  if (shortcut) add('ShortcutToggle', 27, shortcut.id, 12);

  return events;
}
