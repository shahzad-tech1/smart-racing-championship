import { describe, it, expect } from "vitest";
import { RaceEngine, type RaceConfig } from "../../src/engine/RaceEngine";
import { EventScheduler, type ScheduledEvent } from "../../src/engine/EventScheduler";
import { Graph } from "../../src/core/Graph";
import type { Racer, StrategyType } from "../../src/core/types";
import { buildCircuit1, CIRCUIT1_META } from "../../src/data/circuits/circuit1";
import { V, E } from "../algorithms/fixtures";

function racers(): Racer[] {
  const specs: Array<[number, string, boolean, StrategyType]> = [
    [1, "You", true, "Human"],
    [2, "Fixo", false, "FixedMainRoute"],
    [3, "Dash", false, "ShortcutSeeker"],
    [4, "Mini", false, "MinDistance"],
  ];
  return specs.map(([id, name, isHuman, strategyType]) => ({
    id, name, isHuman, strategyType,
    currentVertex: CIRCUIT1_META.startVertex,
    fuel: 1000, nitroCharges: 0, lap: 0,
    nextCheckpoint: 1, totalTime: 0,
  }));
}

function config(extra: Partial<RaceConfig> = {}): RaceConfig {
  return {
    laps: CIRCUIT1_META.laps,
    startVertex: CIRCUIT1_META.startVertex,
    finishVertex: CIRCUIT1_META.finishVertex,
    checkpointOrder: CIRCUIT1_META.checkpointOrder,
    dt: 0.25,
    ...extra,
  };
}

describe("RaceEngine", () => {
  it("runs a full 1+3 race to completion and produces ranked results", () => {
    const eng = new RaceEngine(buildCircuit1(), racers(), config());
    const ticks = eng.run();
    expect(ticks).toBeGreaterThan(0);
    expect(eng.finished).toBe(true);

    const res = eng.results();
    expect(res.length).toBe(4);
    // every racer finished (circuit valid, fuel sufficient)
    expect(res.every((r) => Number.isFinite(r.finishTime))).toBe(true);
    // finish positions are 1..4 and ordered by finishTime
    expect(res.map((r) => r.finishPosition)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < res.length; i++) {
      expect(res[i]!.finishTime).toBeGreaterThanOrEqual(res[i - 1]!.finishTime);
    }
  });

  it("is deterministic: same inputs => identical results (spec §4.4)", () => {
    const a = new RaceEngine(buildCircuit1(), racers(), config());
    const b = new RaceEngine(buildCircuit1(), racers(), config());
    a.run();
    b.run();
    expect(JSON.stringify(a.results())).toBe(JSON.stringify(b.results()));
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it("reroutes around a mid-race road closure without restarting", () => {
    const blockage: ScheduledEvent = {
      eventId: 1, type: "RoadBlockage", triggerTime: 1, priority: 1,
      targetEdgeOrVertex: 1 /* the 0->1 ring edge */, duration: 0,
    };
    const eng = new RaceEngine(buildCircuit1(), racers(), config(), [blockage]);
    eng.run();
    expect(eng.finished).toBe(true);
    // an alternative route to checkpoint 1 exists, so racers still finish
    expect(eng.results().some((r) => Number.isFinite(r.finishTime))).toBe(true);
  });

  it("records a DNF when the finish is unreachable (never freezes)", () => {
    // start isolated from checkpoint + finish
    const g = new Graph(
      [
        V(0, { type: "Start" }),
        V(1, { type: "Checkpoint", checkpointOrder: 1 }),
        V(2, { type: "Finish" }),
      ],
      [E(1, 1, 2)], // 0 is isolated; cannot reach 1 or 2
    );
    const one: Racer = {
      id: 1, name: "Solo", isHuman: false, strategyType: "MinDistance",
      currentVertex: 0, fuel: 1000, nitroCharges: 0, lap: 0, nextCheckpoint: 1, totalTime: 0,
    };
    const eng = new RaceEngine(g, [one], {
      laps: 1, startVertex: 0, finishVertex: 2, checkpointOrder: [1], dt: 0.5, maxClock: 100,
    });
    eng.run();
    expect(eng.finished).toBe(true);
    const res = eng.results();
    expect(res[0]!.finishTime).toBe(Infinity); // DNF
  });

  it("the scheduler integrates: a cancelled blockage never fires", () => {
    const s = new EventScheduler();
    s.schedule({ eventId: 1, type: "RoadBlockage", triggerTime: 1, priority: 1, targetEdgeOrVertex: 1, duration: 0 });
    s.cancel(1);
    expect(s.popDue(10)).toEqual([]);
  });
});
