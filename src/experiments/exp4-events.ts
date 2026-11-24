/** Experiment 4 — Event priority queue (spec §7). Insert/extract time + order check. */
import { EventScheduler, type ScheduledEvent } from "../engine/EventScheduler";
import type { EventType } from "../core/types";
import { makeRng, randInt } from "../core/rng";
import { benchmark, ms, type ExperimentResult } from "./harness";

const TYPES: EventType[] = ["RoadBlockage", "ShortcutToggle", "OilSpill", "SpeedRestriction", "FuelStationAvailability", "NitroBooster"];

function makeEvents(n: number, seed: number): ScheduledEvent[] {
  const rng = makeRng(seed);
  return Array.from({ length: n }, (_, i) => ({
    eventId: i + 1,
    type: TYPES[randInt(rng, 0, TYPES.length - 1)]!,
    triggerTime: randInt(rng, 0, 1000), // many ties on purpose
    priority: randInt(rng, 1, 6),
    targetEdgeOrVertex: randInt(rng, 0, 50),
    duration: 0,
  }));
}

function isOrdered(a: { triggerTime: number; priority: number; insertionSequence: number }, b: typeof a): boolean {
  if (a.triggerTime !== b.triggerTime) return a.triggerTime < b.triggerTime;
  if (a.priority !== b.priority) return a.priority < b.priority;
  return a.insertionSequence <= b.insertionSequence;
}

export function runExp4(sizes: number[] = [100, 1000, 10000, 50000]): ExperimentResult {
  const rows: Array<Array<string | number>> = [];
  for (const n of sizes) {
    const events = makeEvents(n, 4000 + n);

    const insertT = benchmark(() => {
      const s = new EventScheduler();
      for (const e of events) s.schedule(e);
    }, { runs: 5, warmup: 1 });

    const extractT = benchmark(() => {
      const s = new EventScheduler();
      for (const e of events) s.schedule(e);
      s.popDue(Infinity);
    }, { runs: 5, warmup: 1 });

    // verify ordering (correctness, untimed)
    const s = new EventScheduler();
    for (const e of events) s.schedule(e);
    const out = s.popDue(Infinity);
    for (let i = 1; i < out.length; i++) {
      if (!isOrdered(out[i - 1]!, out[i]!)) throw new Error(`Exp4: extraction order violated at ${i} (n=${n})`);
    }
    rows.push([n, ms(insertT.mean), ms(extractT.mean)]);
  }
  return {
    name: "exp4-events",
    headers: ["events", "insert_mean_ms", "insert+extract_mean_ms"],
    rows,
    notes: ["Order verified against (triggerTime, priority, insertionSequence).", "Lazy deletion trades memory for simplicity (spec §4.5)."],
  };
}
