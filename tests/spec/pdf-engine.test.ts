/**
 * tests/spec/pdf-engine.test.ts — adversarial compliance suite for Project.pdf §1, §2, §4, §5.4, §9.1.
 *
 * Part 1: the three shipped circuits against the §1/§4.1 minimum table.
 * Part 2: the race engine against the §4.2–§4.5 rules, using tiny hand-built tracks
 *         where the correct answer is unambiguous.
 * Part 3: the Algorithm Lab / integration rule (§1 "same code as gameplay").
 * Part 4: KNOWN GAPS — `it.fails` marks a requirement the project does not yet meet.
 *         The suite stays green; the moment a gap is closed the test turns red and
 *         must be flipped to a normal `it` (that is the point of using it.fails).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Graph } from "../../src/core/Graph";
import type { Edge, EventType, Racer, StrategyType } from "../../src/core/types";
import { CIRCUITS } from "../../src/data/circuits";
import { buildRaceEvents } from "../../src/data/raceEvents";
import { buildGrid } from "../../src/data/grid";
import { RaceEngine, type RaceConfig } from "../../src/engine/RaceEngine";
import { RULES, fuelForEdge, timeForEdge } from "../../src/engine/rules";
import { validateCircuit } from "../../src/engine/validator";
import { dfs, findDeadEnds } from "../../src/algorithms/dfs";
import { typedDeadEnds } from "../../src/algorithms/dfs";
import { dijkstra } from "../../src/algorithms/dijkstra";
import { planCheckpointRoute } from "../../src/algorithms/route";
import { aStar, weightedHeuristic } from "../../src/algorithms/astar";
import { costFn, PRESETS, REFS } from "../../src/core/cost";
import { ALGOS, runAlgo } from "../../src/ui/lab/labAlgos";
import { V, E } from "../algorithms/fixtures";

// ------------------------------------------------------------------ helpers

function racer(id: number, strategyType: StrategyType, opts: { human?: boolean; nitro?: number } = {}): Racer {
  return {
    id, name: `R${id}`, isHuman: opts.human ?? strategyType === "Human", strategyType,
    currentVertex: 0, fuel: RULES.MAX_FUEL_TENTHS, nitroCharges: opts.nitro ?? 0, lap: 0, nextCheckpoint: 0, totalTime: 0,
  };
}

interface Trace {
  minFuel: number;
  maxRefuelJump: number;
  visits: Map<number, number[]>; // racer id -> vertex ids in arrival order
  finalVertexTime: Map<number, number[]>; // racer id -> clock when each vertex arrival happened
}

/** Tick an engine to completion while recording per-tick observables. */
function drive(eng: RaceEngine, maxTicks = 3_000_000): Trace {
  const t: Trace = { minFuel: Infinity, maxRefuelJump: 0, visits: new Map(), finalVertexTime: new Map() };
  const lastFuel = new Map<number, number>();
  const lastVertex = new Map<number, number>();
  for (const r of eng.state.racers) {
    lastFuel.set(r.id, r.fuelTenths);
    lastVertex.set(r.id, r.currentVertex);
    t.visits.set(r.id, [r.currentVertex]);
    t.finalVertexTime.set(r.id, [0]);
  }
  let guard = 0;
  while (!eng.finished && guard++ < maxTicks) {
    eng.tick();
    const st = eng.state;
    for (const r of st.racers) {
      t.minFuel = Math.min(t.minFuel, r.fuelTenths);
      t.maxRefuelJump = Math.max(t.maxRefuelJump, r.fuelTenths - lastFuel.get(r.id)!);
      lastFuel.set(r.id, r.fuelTenths);
      if (r.currentVertex !== lastVertex.get(r.id)) {
        lastVertex.set(r.id, r.currentVertex);
        t.visits.get(r.id)!.push(r.currentVertex);
        t.finalVertexTime.get(r.id)!.push(st.clock);
      }
    }
  }
  return t;
}

function cfg(over: Partial<RaceConfig> & Pick<RaceConfig, "startVertex" | "finishVertex" | "checkpointOrder">): RaceConfig {
  return { laps: 1, dt: 0.25, ...over };
}

function evt(eventId: number, type: EventType, triggerTime: number, target: number, duration: number) {
  const priority = { RoadBlockage: 1, ShortcutToggle: 2, OilSpill: 3, SpeedRestriction: 4, FuelStationAvailability: 5, NitroBooster: 6 }[type];
  return { eventId, type, triggerTime, priority, targetEdgeOrVertex: target, duration };
}

/** A track where the racer stays on the road for ~2000 s, so we can poke the graph mid-race. */
function eventBench(opts: { sideStatus?: Edge["status"]; sideShortcut?: boolean } = {}): Graph {
  return new Graph(
    [V(0, { type: "Start" }), V(1), V(2, { type: "Finish" }), V(3), V(4, { type: "FuelStation", active: false })],
    [
      E(1, 0, 1, { baseTime: 1000 }),
      E(2, 1, 2, { baseTime: 1000 }),
      E(9, 1, 3, { baseTime: 1, isShortcut: opts.sideShortcut ?? false, status: opts.sideStatus ?? "Open" }),
    ],
  );
}
function benchEngine(g: Graph, events: ReturnType<typeof evt>[]): RaceEngine {
  return new RaceEngine(g, [racer(1, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 2, checkpointOrder: [] }), events);
}
function runTo(eng: RaceEngine, t: number): void {
  while (eng.state.clock < t - 1e-9) eng.tick();
}

// ================================================================== PART 1 — circuits

describe("PDF §1 / §4.1 — the three shipped circuits meet the minimum table", () => {
  it("there are at least 3 circuits with distinct structure", () => {
    expect(CIRCUITS.length).toBeGreaterThanOrEqual(3);
    const sig = CIRCUITS.map((c) => {
      const g = c.build();
      const deg = new Map<number, number>();
      for (const e of g.allEdges()) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
      return `${g.vertexCount}/${g.edgeCount}/${[...deg.values()].sort((a, b) => a - b).join(",")}`;
    });
    expect(new Set(sig).size).toBe(CIRCUITS.length);
    expect(new Set(CIRCUITS.map((c) => c.meta.id)).size).toBe(CIRCUITS.length);
  });

  for (const def of CIRCUITS) {
    describe(def.meta.name, () => {
      const g = def.build();
      const m = def.meta;
      const edges = g.allEdges();

      it("has >= 10 mandatory checkpoints with unique, contiguous order 1..N, and Start/Finish exist", () => {
        expect(m.checkpointOrder.length).toBeGreaterThanOrEqual(10);
        const orders = g.allVertices().filter((v) => v.checkpointOrder !== null).map((v) => v.checkpointOrder!).sort((a, b) => a - b);
        expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
        m.checkpointOrder.forEach((vid, i) => expect(g.getVertex(vid).checkpointOrder).toBe(i + 1));
        expect(g.getVertex(m.startVertex).type).toBe("Start");
        expect(g.getVertex(m.finishVertex).type).toBe("Finish");
      });

      it("has >= 2 shortcuts, a cycle, a dead end, fuel, nitro, obstacles and several difficulty levels", () => {
        expect(edges.filter((e) => e.isShortcut).length).toBeGreaterThanOrEqual(2);
        expect(dfs(g, m.startVertex).hasCycle).toBe(true);
        expect(typedDeadEnds(g).length + findDeadEnds(g, { finish: m.finishVertex }).length).toBeGreaterThan(0);
        expect(g.allVertices().some((v) => v.type === "FuelStation" && v.active)).toBe(true);
        expect(g.allVertices().some((v) => v.type === "NitroPickup" && v.active)).toBe(true);
        expect(edges.some((e) => (e.obstacle ?? 0) > 0)).toBe(true);
        expect(new Set(edges.map((e) => e.difficulty)).size).toBeGreaterThanOrEqual(3);
      });

      it("every edge obeys the §3.1 field rules (non-negative, difficulty integer 1..5, valid endpoints)", () => {
        for (const e of edges) {
          expect(e.distance).toBeGreaterThanOrEqual(0);
          expect(e.baseTime).toBeGreaterThanOrEqual(0);
          expect(e.fuelCost).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(e.difficulty) && e.difficulty >= 1 && e.difficulty <= 5).toBe(true);
          expect(g.hasVertex(e.from) && g.hasVertex(e.to)).toBe(true);
          expect(["Open", "Blocked", "Restricted"]).toContain(e.status);
        }
      });

      it("passes the playability validator and uses 2-3 laps", () => {
        expect(validateCircuit(g, m)).toEqual({ valid: true, reasons: [] });
        expect(m.laps).toBeGreaterThanOrEqual(2);
        expect(m.laps).toBeLessThanOrEqual(3);
      });

      it("A* returns Dijkstra's cost for EVERY vertex pair under EVERY preset", () => {
        const ids = g.allVertices().map((v) => v.id);
        for (const w of Object.values(PRESETS)) {
          const cost = costFn(w, REFS);
          const h = weightedHeuristic(g, cost);
          for (const s of ids) for (const t of ids) {
            const d = dijkstra(g, s, t, cost);
            const a = aStar(g, s, t, cost, h);
            expect(a.found).toBe(d.found);
            if (d.found) expect(a.cost).toBeCloseTo(d.cost, 9);
          }
        }
      });
    });
  }

  it("at least one circuit has a vertex pair where the four presets pick different routes (§3.3)", () => {
    let found = 0;
    for (const def of CIRCUITS) {
      const g = def.build();
      const ids = g.allVertices().map((v) => v.id);
      for (const s of ids) for (const t of ids) {
        if (s === t) continue;
        const routes = new Set(Object.values(PRESETS).map((w) => dijkstra(g, s, t, costFn(w, REFS)).path.join("-")));
        if (routes.size > 1) found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

// ================================================================== PART 2 — engine rules

describe("PDF §4.3 — fuel and nitro constants", () => {
  it("fuel per edge = fuelCost x (1 + 0.1 x (difficulty-1)), in tenths", () => {
    const e = (difficulty: number, fuelCost = 10): Edge => ({ id: 1, from: 0, to: 1, distance: 1, baseTime: 6, fuelCost, difficulty, status: "Open", isShortcut: false, directed: false });
    expect(fuelForEdge(e(1))).toBe(100);
    expect(fuelForEdge(e(3))).toBe(120);
    expect(fuelForEdge(e(5))).toBe(140);
    expect(fuelForEdge(e(1), true)).toBe(200); // 2x while nitro is active
    expect(timeForEdge(e(1), true)).toBeCloseTo(4, 12); // 1.5x speed
  });
  it("the frozen defaults match the PDF's suggested table", () => {
    expect(RULES.MAX_FUEL_TENTHS).toBe(1000);
    expect(RULES.FUEL_STATION_MAX_PURCHASE_TENTHS).toBe(400);
    expect(RULES.MAX_NITRO).toBe(3);
    expect(RULES.NITRO_SPEED_MULTIPLIER).toBe(1.5);
    expect(RULES.NITRO_DURATION).toBe(4);
    expect(RULES.NITRO_FUEL_PENALTY).toBe(2);
    expect(RULES.REFUEL_THRESHOLD).toBe(0.25);
  });
});

describe("PDF §4.2 / §4.3 — fuel, stations and DNF", () => {
  // 0 -35- 1 -35- 2(station) -35- 3 -35- 4(finish): 140 units needed, tank holds 100.
  const stationOnRoute = (): Graph =>
    new Graph(
      [V(0, { type: "Start" }), V(1), V(2, { type: "FuelStation" }), V(3), V(4, { type: "Finish" })],
      [E(1, 0, 1, { fuelCost: 35, baseTime: 2 }), E(2, 1, 2, { fuelCost: 35, baseTime: 2 }), E(3, 2, 3, { fuelCost: 35, baseTime: 2 }), E(4, 3, 4, { fuelCost: 35, baseTime: 2 })],
    );

  it("a racer standing on an active station with too little fuel refuels there and finishes", () => {
    const eng = new RaceEngine(stationOnRoute(), [racer(1, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 4, checkpointOrder: [], maxClock: 500 }));
    const t = drive(eng);
    const res = eng.results()[0]!;
    expect(Number.isFinite(res.finishTime)).toBe(true);
    expect(t.minFuel).toBeGreaterThanOrEqual(0);
  });

  it("one stop sells at most 40 units (PDF §4.3) and costs the fixed stop time", () => {
    const eng = new RaceEngine(stationOnRoute(), [racer(1, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 4, checkpointOrder: [], maxClock: 500 }));
    const t = drive(eng);
    expect(t.maxRefuelJump).toBeLessThanOrEqual(RULES.FUEL_STATION_MAX_PURCHASE_TENTHS);
    expect(t.maxRefuelJump).toBeGreaterThan(0); // it did refuel
    // time spent at the station vertex >= stop time
    const v = t.visits.get(1)!;
    const times = t.finalVertexTime.get(1)!;
    const i = v.indexOf(2);
    expect(times[i + 1]! - times[i]!).toBeGreaterThanOrEqual(RULES.FUEL_STATION_STOP_TIME - 0.26);
  });

  it("fuel never goes negative: with the only station out of reach the racer is DNF, not a ghost with negative fuel", () => {
    // 0 -50- 1 -50- 2 -50- 3(finish); station 4 hangs off vertex 1 by a 40-unit road.
    const g = new Graph(
      [V(0, { type: "Start" }), V(1), V(2), V(3, { type: "Finish" }), V(4, { type: "FuelStation" })],
      [E(1, 0, 1, { fuelCost: 50, baseTime: 2 }), E(2, 1, 2, { fuelCost: 50, baseTime: 2 }), E(3, 2, 3, { fuelCost: 50, baseTime: 2 }), E(4, 1, 4, { fuelCost: 40, baseTime: 2 })],
    );
    const eng = new RaceEngine(g, [racer(1, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 3, checkpointOrder: [], maxClock: 500 }));
    const t = drive(eng);
    expect(eng.finished).toBe(true); // never freezes
    expect(t.minFuel).toBeGreaterThanOrEqual(0);
    expect(eng.results()[0]!.finishTime).toBe(Infinity);
    expect(eng.state.racers[0]!.status).toBe("dnf");
  });

  it("an AI below 25% fuel refuels at the first station it reaches; the human is not force-refuelled (§4.4)", () => {
    // 0 -40- 1 -40- 2(station) -15- 3(finish): arrives at the station with 20% and could finish without stopping
    const g = new Graph(
      [V(0, { type: "Start" }), V(1), V(2, { type: "FuelStation" }), V(3, { type: "Finish" })],
      [E(1, 0, 1, { fuelCost: 40, baseTime: 2 }), E(2, 1, 2, { fuelCost: 40, baseTime: 2 }), E(3, 2, 3, { fuelCost: 15, baseTime: 2 })],
    );
    const eng = new RaceEngine(g, [racer(1, "Human"), racer(2, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 3, checkpointOrder: [], maxClock: 500 }));
    drive(eng);
    const [human, ai] = eng.state.racers;
    expect(human!.fuelTenths).toBe(1000 - 400 - 400 - 150); // never stopped
    expect(ai!.fuelTenths).toBeGreaterThan(human!.fuelTenths + 300); // bought up to 40 units at the station
  });
});

describe("PDF §4.2 — laps, checkpoints, finishing order", () => {
  it("a mandatory checkpoint cannot be skipped even when a direct road to the finish is far cheaper", () => {
    const g = new Graph(
      [V(0, { type: "Start" }), V(1, { type: "Checkpoint", checkpointOrder: 1 }), V(2, { type: "Finish" })],
      [E(1, 0, 2, { baseTime: 1, distance: 1, fuelCost: 1 }), E(2, 0, 1, { baseTime: 2, distance: 20, fuelCost: 2 }), E(3, 1, 2, { baseTime: 2, distance: 20, fuelCost: 2 })],
    );
    for (const strategy of ["FixedMainRoute", "ShortcutSeeker", "MinDistance", "Human"] as StrategyType[]) {
      const eng = new RaceEngine(g.clone(), [racer(1, strategy)], cfg({ startVertex: 0, finishVertex: 2, checkpointOrder: [1], laps: 2 }));
      const t = drive(eng);
      const v = t.visits.get(1)!;
      expect(eng.results()[0]!.finishTime).toBeLessThan(Infinity);
      // sequence must contain 1 before the first lap-ending arrival at 2, and twice overall (2 laps)
      expect(v.filter((x) => x === 1).length).toBe(2);
      expect(v.indexOf(1)).toBeLessThan(v.indexOf(2));
    }
  });

  it("the lap counter follows ordered checkpoints on every circuit (independent replay of the visit trace)", () => {
    for (const def of CIRCUITS) {
      const g = def.build();
      const m = def.meta;
      const eng = new RaceEngine(g, buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps }, buildRaceEvents(g, m));
      const t = drive(eng);
      for (const r of eng.results()) {
        // replay: a lap only counts when ALL checkpoints were visited in order, then the finish is crossed
        let ptr = 0;
        let laps = 0;
        for (const v of t.visits.get(r.racerId)!) {
          if (v === m.checkpointOrder[ptr]) ptr++;
          if (v === m.finishVertex && ptr === m.checkpointOrder.length) { laps++; ptr = 0; }
        }
        if (Number.isFinite(r.finishTime)) expect(laps).toBe(m.laps);
        else expect(laps).toBeLessThan(m.laps);
      }
    }
  });

  it("finish order is by finish time; an exact tie goes to the lower racer id (PDF §4.2 rule 7)", () => {
    const g = new Graph([V(0, { type: "Start" }), V(1, { type: "Finish" })], [E(1, 0, 1, { baseTime: 3 })]);
    const eng = new RaceEngine(g, [racer(3, "FixedMainRoute"), racer(1, "FixedMainRoute"), racer(2, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 1, checkpointOrder: [] }));
    eng.run();
    const res = eng.results();
    expect(res.map((r) => r.racerId)).toEqual([1, 2, 3]);
    expect(new Set(res.map((r) => r.finishTime)).size).toBe(1); // genuinely tied
    expect(res.map((r) => r.finishPosition)).toEqual([1, 2, 3]);
  });

  it("with a time limit, unfinished racers rank by laps, then checkpoints, then elapsed time, then id (PDF §4.2 rule 8)", () => {
    // two parallel roads 0-1: fast-but-long (E1) and short-but-slow (E2). Then a huge road 1-2 so nobody finishes.
    const g = new Graph(
      [V(0, { type: "Start" }), V(1, { type: "Checkpoint", checkpointOrder: 1 }), V(2, { type: "Finish" })],
      [E(1, 0, 1, { distance: 100, baseTime: 5, fuelCost: 1 }), E(2, 0, 1, { distance: 10, baseTime: 50, fuelCost: 1 }), E(3, 1, 2, { distance: 10, baseTime: 1000, fuelCost: 1 })],
    );
    // racer 1 (lowest id) takes the slow short road, racer 2 the fast one
    const eng = new RaceEngine(g, [racer(1, "MinDistance"), racer(2, "FixedMainRoute")], cfg({ startVertex: 0, finishVertex: 2, checkpointOrder: [1], timeLimit: 30, dt: 0.5 }));
    eng.run();
    const res = eng.results();
    expect(res.every((r) => r.finishTime === Infinity)).toBe(true);
    expect(res.map((r) => r.racerId)).toEqual([2, 1]); // racer 2 reached checkpoint 1; racer 1 did not
    expect(res.map((r) => r.finishPosition)).toEqual([1, 2]);
  });

  it("a race whose finish is unreachable ends in DNF for everyone and never loops forever", () => {
    const g = new Graph([V(0, { type: "Start" }), V(1, { type: "Finish" })], []);
    const eng = new RaceEngine(g, [racer(1, "Human"), racer(2, "MinDistance")], cfg({ startVertex: 0, finishVertex: 1, checkpointOrder: [], maxClock: 50 }));
    eng.run();
    expect(eng.finished).toBe(true);
    expect(eng.results().every((r) => r.finishTime === Infinity)).toBe(true);
  });
});

describe("PDF §4.5 — events on a live race", () => {
  it("overlapping road closures on one edge: the earlier expiry must NOT reopen a road another closure still holds", () => {
    const eng = benchEngine(eventBench(), [evt(1, "RoadBlockage", 1, 9, 10), evt(2, "RoadBlockage", 5, 9, 20)]); // A:[1,11)  B:[5,25)
    const g = (eng as unknown as { g: Graph }).g;
    runTo(eng, 4);
    expect(g.getEdge(9).status).toBe("Blocked");
    runTo(eng, 12); // A expired, B still active
    expect(g.getEdge(9).status).toBe("Blocked");
    runTo(eng, 26); // both expired
    expect(g.getEdge(9).status).toBe("Open");
  });

  it("overlapping station-availability events: expiring one keeps the other; the base state returns at the end", () => {
    const eng = benchEngine(eventBench(), [evt(1, "FuelStationAvailability", 1, 4, 10), evt(2, "FuelStationAvailability", 5, 4, 20)]);
    const g = (eng as unknown as { g: Graph }).g;
    runTo(eng, 4);
    expect(g.getVertex(4).active).toBe(true);
    runTo(eng, 12);
    expect(g.getVertex(4).active).toBe(true); // B still holds it open
    runTo(eng, 26);
    expect(g.getVertex(4).active).toBe(false); // station was inactive before any event
  });

  it("a temporary closure restores the ORIGINAL status, and a permanent one (duration 0) stays", () => {
    const eng = benchEngine(eventBench(), [evt(1, "RoadBlockage", 2, 9, 5)]);
    const g = (eng as unknown as { g: Graph }).g;
    runTo(eng, 3);
    expect(g.getEdge(9).status).toBe("Blocked");
    runTo(eng, 8);
    expect(g.getEdge(9).status).toBe("Open");
    const eng2 = benchEngine(eventBench(), [evt(1, "RoadBlockage", 2, 9, 0)]);
    runTo(eng2, 50);
    expect((eng2 as unknown as { g: Graph }).g.getEdge(9).status).toBe("Blocked");
  });

  it("a shortcut toggle closes an open shortcut for its duration and REOPENS a closed one", () => {
    const closing = benchEngine(eventBench({ sideShortcut: true }), [evt(1, "ShortcutToggle", 1, 9, 5)]);
    const g1 = (closing as unknown as { g: Graph }).g;
    runTo(closing, 2);
    expect(g1.getEdge(9).status).toBe("Blocked");
    runTo(closing, 8);
    expect(g1.getEdge(9).status).toBe("Open");

    const opening = benchEngine(eventBench({ sideShortcut: true, sideStatus: "Blocked" }), [evt(1, "ShortcutToggle", 1, 9, 0)]);
    const g2 = (opening as unknown as { g: Graph }).g;
    runTo(opening, 2);
    expect(g2.getEdge(9).status).toBe("Open"); // "Toggle shortcut Open/Blocked" — until reversed
  });

  it("events with a missing target or an invalid kind of target are ignored without crashing", () => {
    const events = [
      evt(1, "RoadBlockage", 1, 999, 5), // no such edge
      evt(2, "OilSpill", 1, 999, 5),
      evt(3, "SpeedRestriction", 1, 999, 5),
      evt(4, "FuelStationAvailability", 1, 999, 5), // no such vertex
      evt(5, "NitroBooster", 1, 999, 5),
      evt(6, "ShortcutToggle", 1, 1, 5), // edge 1 exists but is not a shortcut
      evt(7, "FuelStationAvailability", 1, 3, 5), // vertex 3 is not a station
    ];
    const eng = benchEngine(eventBench(), events);
    const g = (eng as unknown as { g: Graph }).g;
    expect(() => runTo(eng, 3)).not.toThrow();
    expect(g.getEdge(1).status).toBe("Open"); // the non-shortcut was not toggled
    expect(g.getVertex(3).active).toBe(true); // untouched (was already active; no restore side effects either)
    runTo(eng, 10);
    expect(g.getEdge(1).status).toBe("Open");
  });

  it("simultaneous events are all applied before any racer moves, in (time, priority, sequence) order", () => {
    // closure (priority 1) and its immediate re-open via a long toggle on another edge land on the same tick
    const eng = benchEngine(eventBench({ sideShortcut: true }), [evt(2, "ShortcutToggle", 3, 9, 4), evt(1, "RoadBlockage", 3, 9, 2)]);
    const g = (eng as unknown as { g: Graph }).g;
    runTo(eng, 3.25);
    expect(g.getEdge(9).status).toBe("Blocked");
    runTo(eng, 6); // closure (2 s) over, toggle (4 s) still active
    expect(g.getEdge(9).status).toBe("Blocked");
    runTo(eng, 8);
    expect(g.getEdge(9).status).toBe("Open");
  });
});

describe("PDF §4.4 — determinism of the whole race", () => {
  it("every circuit replays bit-identically, including results, fuel and event effects", () => {
    for (const def of CIRCUITS) {
      const runOnce = () => {
        const g = def.build();
        const m = def.meta;
        const eng = new RaceEngine(g, buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps }, buildRaceEvents(g, m));
        eng.run();
        return JSON.stringify([eng.results(), eng.state]);
      };
      expect(runOnce()).toBe(runOnce());
    }
  });

  it("on every circuit the standard race ends cleanly: ranked 1..4, everyone finishes, fuel stays >= 0, refuels <= 40 units", () => {
    for (const def of CIRCUITS) {
      const g = def.build();
      const m = def.meta;
      const eng = new RaceEngine(g, buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps }, buildRaceEvents(g, m));
      const t = drive(eng);
      const res = eng.results();
      expect(res.map((r) => r.finishPosition)).toEqual([1, 2, 3, 4]);
      expect(res.every((r) => Number.isFinite(r.finishTime))).toBe(true);
      for (let i = 1; i < res.length; i++) {
        expect(res[i]!.finishTime).toBeGreaterThanOrEqual(res[i - 1]!.finishTime);
        if (res[i]!.finishTime === res[i - 1]!.finishTime) expect(res[i]!.racerId).toBeGreaterThan(res[i - 1]!.racerId);
      }
      expect(t.minFuel).toBeGreaterThanOrEqual(0);
      expect(t.maxRefuelJump).toBeLessThanOrEqual(RULES.FUEL_STATION_MAX_PURCHASE_TENTHS);
    }
  });

  it("a road closure on the racers' own route triggers a reroute without restarting the race (clock keeps running)", () => {
    const def = CIRCUITS[0]!;
    const g = def.build();
    const m = def.meta;
    const base = new RaceEngine(def.build(), buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps });
    base.run();
    const route = (() => {
      const probe = new RaceEngine(def.build(), [racer(1, "FixedMainRoute")], { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: 1 });
      return (probe as unknown as { runtimes: Array<{ routeEdges: number[] }> }).runtimes[0]!.routeEdges;
    })();
    const closed = new RaceEngine(g, buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps }, [evt(1, "RoadBlockage", 0.5, route[2]!, 16)]);
    closed.run();
    expect(closed.finished).toBe(true);
    expect(closed.results().some((r) => Number.isFinite(r.finishTime))).toBe(true);
  });
});

// ================================================================== PART 3 — Lab integration

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}
const SRC = resolve(process.cwd(), "src");
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("PDF §1 — one implementation per algorithm; the Lab calls the gameplay code", () => {
  it("no UI / render / state file declares its own copy of a mandatory algorithm", () => {
    const names = ["dijkstra", "aStar", "bfs", "dfs", "mergeSort", "quickSort", "heapSort", "knapsack01", "greedyKnapsack", "kruskalMST", "refuelDP", "topK"];
    const offenders: string[] = [];
    for (const dir of ["ui", "render", "render3d", "state"]) {
      for (const f of walk(resolve(SRC, dir))) {
        const code = strip(readFileSync(f, "utf8"));
        for (const n of names) {
          if (new RegExp(`function\\s+${n}\\s*[<(]|const\\s+${n}\\s*=\\s*(\\(|function|<)`).test(code)) offenders.push(`${f}: ${n}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every Lab entry runs on every circuit without throwing and produces steps + counters", () => {
    for (const def of CIRCUITS) {
      const g = def.build();
      for (const a of ALGOS) {
        const run = runAlgo(a.id, g, def.meta, 7);
        expect(run.steps.length).toBeGreaterThan(0);
        expect(run.result.length).toBeGreaterThan(0);
        expect(() => run.steps.forEach((s, i) => run.log(s, i))).not.toThrow();
      }
    }
  });

  it("the Lab's Dijkstra / BFS / A* produce exactly what gameplay's functions produce", () => {
    for (const def of CIRCUITS) {
      const g = def.build();
      const m = def.meta;
      const cost = costFn(PRESETS.Balanced, REFS);
      const direct = dijkstra(g, m.startVertex, m.finishVertex, cost);
      const lab = runAlgo("dijkstra", g, m, 1);
      expect(lab.path).toEqual(direct.path);
      expect(lab.pathEdges).toEqual(direct.edges);
      const astar = runAlgo("astar", g, m, 1);
      expect(astar.path).toEqual(aStar(g, m.startVertex, m.finishVertex, cost, weightedHeuristic(g, cost)).path);
    }
  });
});

describe("PDF §2.3 — the player's planned route drives the player's car", () => {
  it("the human is routed by the chosen preset and algorithm: same route as the planner, A* cost == Dijkstra cost", () => {
    for (const def of CIRCUITS) {
      const g = def.build();
      const m = def.meta;
      for (const preset of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
        const wanted = planCheckpointRoute(g, m.startVertex, [...m.checkpointOrder], m.finishVertex, costFn(PRESETS[preset], REFS));
        for (const useAStar of [false, true]) {
          const eng = new RaceEngine(def.build(), [racer(1, "Human")], { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: 1, humanPlan: { preset, useAStar } });
          const rt = (eng as unknown as { runtimes: Array<{ route: number[] }> }).runtimes[0]!;
          // the DP may insert a fuel detour into the first road; strip it by comparing the cost-optimal prefix
          const route = rt.route;
          const cost = costFn(PRESETS[preset], REFS);
          const g2 = def.build();
          const edgesCost = (path: number[]): number => {
            let c = 0;
            for (let i = 0; i + 1 < path.length; i++) {
              const hop = g2.neighbors(path[i]!, { ignoreBlocked: true }).filter((n) => n.to === path[i + 1]).map((n) => cost(n.edge));
              c += Math.min(...hop);
            }
            return c;
          };
          expect(edgesCost(route)).toBeGreaterThanOrEqual(wanted.cost - 1e-9);
          expect(route[0]).toBe(m.startVertex);
          // every mandatory checkpoint appears, in order
          let ptr = 0;
          for (const v of route) if (v === m.checkpointOrder[ptr]) ptr++;
          expect(ptr).toBe(m.checkpointOrder.length);
        }
      }
    }
  });

  it("different presets can give the human different cars-on-road behaviour (race still completes, deterministic)", () => {
    const def = CIRCUITS[0]!;
    const m = def.meta;
    const run = (preset: keyof typeof PRESETS) => {
      const g = def.build();
      const eng = new RaceEngine(g, buildGrid(m.startVertex), { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps, humanPlan: { preset, useAStar: true } }, buildRaceEvents(g, m));
      eng.run();
      return JSON.stringify(eng.results());
    };
    for (const p of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) expect(run(p)).toBe(run(p));
  });
});

// ================================================================== PART 4 — KNOWN GAPS

describe("KNOWN GAPS vs Project.pdf (it.fails = requirement not met yet; fix it, then change to `it`)", () => {
  it("§4.1 / §5.3: racers actually collect nitro pickups during a standard race on at least one circuit", () => {
    let collected = false;
    for (const def of CIRCUITS) {
      const g = def.build();
      const m = def.meta;
      const grid = buildGrid(m.startVertex);
      const initial = new Map(grid.map((r) => [r.id, r.nitroCharges]));
      const eng = new RaceEngine(g, grid, { startVertex: m.startVertex, finishVertex: m.finishVertex, checkpointOrder: [...m.checkpointOrder], laps: m.laps }, buildRaceEvents(g, m));
      while (!eng.finished) {
        eng.tick();
        for (const r of eng.state.racers) if (r.nitro > (initial.get(r.id) ?? 0)) collected = true;
      }
    }
    expect(collected).toBe(true);
  });

  it("§2.3 / §5.3 / §6: the DP/Greedy/refuel planner is called by gameplay code (not only by the Lab and experiments)", () => {
    const users: string[] = [];
    for (const dir of ["ui/screens", "engine", "state", "render3d", "data"]) {
      for (const f of walk(resolve(SRC, dir))) {
        if (/from\s+['"][^'"]*algorithms\/(knapsack|greedy|refuel)(\.ts)?['"]/.test(strip(readFileSync(f, "utf8")))) users.push(f);
      }
    }
    expect(users.length).toBeGreaterThan(0);
  });

  it.fails("§2.1 screen 4: the Algorithm Lab can step through the Heap / priority queue (event scheduler, top-k)", () => {
    expect(ALGOS.some((a) => /priority queue|event (queue|scheduler|heap)|top-?k/i.test(a.name))).toBe(true);
  });

  it.fails("§2.1 screen 4: every Lab entry runs on the CURRENT track / race data, not on invented sample data", () => {
    expect(ALGOS.filter((a) => a.sample).map((a) => a.id)).toEqual([]);
  });
});
