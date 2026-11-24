/**
 * src/engine/RaceEngine.ts — Act 4: the deterministic, fixed-step race engine.
 *
 * Same inputs (graph, racers, config, scheduled events) => identical results
 * (spec §4.4). The renderer interpolates between snapshots for smoothness but
 * never feeds values back into the sim.
 *
 * Integration (not duplication): racers route with the SAME planCheckpointRoute /
 * Dijkstra used everywhere; fuel uses engine/rules; closures use the SAME graph
 * and are excluded by the SAME neighbor filter. A road closure mid-race triggers
 * a reroute from the current state — the race is not restarted (spec §5.4).
 *
 * Simplifications (documented for the report): movement is per-edge with
 * fractional progress; an edge's travel time/fuel are charged on completion;
 * refuelling is a timed pause at a station; AI opponents do not use nitro.
 */

import type { Graph } from "../core/Graph";
import type { Racer } from "../core/types";
import { dijkstra } from "../algorithms/dijkstra";
import { planCheckpointRoute } from "../algorithms/route";
import type { EdgeCostFn } from "../algorithms/pathTypes";
import { costFn, PRESETS, REFS } from "../core/cost";
import { EffectLayer } from "./effects";
import { EventScheduler, type ScheduledEvent } from "./EventScheduler";
import { RULES, fuelForEdge } from "./rules";

export interface RaceConfig {
  laps: number;
  startVertex: number;
  finishVertex: number;
  checkpointOrder: readonly number[];
  dt?: number; // fixed step seconds (default 1/60)
  timeLimit?: number; // optional seconds
  maxClock?: number; // safety cap (default 100000s) to guarantee termination
}

export interface RaceResultRow {
  raceId: number;
  racerId: number;
  finishPosition: number;
  finishTime: number; // Infinity if DNF / unfinished
  fastestLap: number; // Infinity if never completed a lap
  bonusPoints: number;
  pointsAwarded: number; // filled by the championship layer (Act 5)
}

type Status = "racing" | "finished" | "dnf";

interface Runtime {
  id: number;
  name: string;
  isHuman: boolean;
  cost: EdgeCostFn;
  currentVertex: number;
  route: number[]; // vertex path, route[0] == currentVertex
  routeEdges: number[]; // routeEdges[i] connects route[i] -> route[i+1]
  edgeIndex: number;
  progressTime: number;
  pauseTimeLeft: number;
  fuelTenths: number;
  nitro: number;
  checkpointProgress: number; // how many required checkpoints visited this lap
  lap: number;
  totalTime: number;
  fastestLap: number;
  lapStartTime: number;
  status: Status;
  finishTime: number;
  refuelTarget: number | null;
}

export interface RacerSnapshot {
  id: number;
  name: string;
  isHuman: boolean;
  currentVertex: number;
  edgeId: number | null;
  progress: number; // 0..1 along the current edge (for interpolation)
  fuelTenths: number;
  nitro: number;
  lap: number;
  checkpointProgress: number;
  totalTime: number;
  status: Status;
}

export interface RaceState {
  clock: number;
  racers: RacerSnapshot[];
  finished: boolean;
}

export class RaceEngine {
  private readonly dt: number;
  private readonly maxClock: number;
  private clock = 0;
  private readonly runtimes: Runtime[] = [];
  private readonly layer = new EffectLayer();
  private readonly scheduler = new EventScheduler();
  private readonly restores: Array<{ expiresAt: number; apply: () => void }> = [];
  private finishCounter = 0;

  constructor(
    private readonly g: Graph,
    racers: Racer[],
    private readonly config: RaceConfig,
    scheduledEvents: ScheduledEvent[] = [],
  ) {
    this.dt = config.dt ?? 1 / 60;
    this.maxClock = config.maxClock ?? 100000;
    for (const ev of scheduledEvents) this.scheduler.schedule(ev);

    // deterministic racer order by id
    for (const r of [...racers].sort((a, b) => a.id - b.id)) {
      const rt: Runtime = {
        id: r.id,
        name: r.name,
        isHuman: r.isHuman,
        cost: this.strategyCost(r),
        currentVertex: config.startVertex,
        route: [],
        routeEdges: [],
        edgeIndex: 0,
        progressTime: 0,
        pauseTimeLeft: 0,
        fuelTenths: RULES.MAX_FUEL_TENTHS,
        nitro: r.nitroCharges,
        checkpointProgress: 0,
        lap: 0,
        totalTime: 0,
        fastestLap: Infinity,
        lapStartTime: 0,
        status: "racing",
        finishTime: Infinity,
        refuelTarget: null,
      };
      this.plan(rt);
      if (rt.routeEdges.length === 0) rt.status = "dnf"; // unroutable from the start
      this.runtimes.push(rt);
    }
  }

  // ---- strategy cost (opponents reuse the shared cost model) ----
  private strategyCost(r: Racer): EdgeCostFn {
    const base = costFn(PRESETS.Balanced, REFS, (e) => this.layer.effectiveEdge(e));
    if (r.strategyType === "ShortcutSeeker") {
      return (e) => (e.isShortcut ? base(e) * 0.2 : base(e));
    }
    if (r.strategyType === "MinDistance") {
      return (e) => this.layer.effectiveEdge(e).distance;
    }
    // FixedMainRoute and Human default to the balanced cost
    return base;
  }

  // ---- planning ----
  private plan(rt: Runtime): void {
    const remaining = this.config.checkpointOrder.slice(rt.checkpointProgress);
    const plan = planCheckpointRoute(
      this.g,
      rt.currentVertex,
      [...remaining],
      this.config.finishVertex,
      rt.cost,
    );
    rt.route = plan.found ? plan.path : [];
    rt.routeEdges = plan.found ? plan.edges : [];
    rt.edgeIndex = 0;
    rt.progressTime = 0;
  }

  private routeToStation(rt: Runtime, station: number): boolean {
    const path = dijkstra(this.g, rt.currentVertex, station, rt.cost);
    if (!path.found || path.edges.length === 0) return false;
    rt.route = path.path;
    rt.routeEdges = path.edges;
    rt.edgeIndex = 0;
    rt.progressTime = 0;
    rt.refuelTarget = station;
    return true;
  }

  private nearestStation(rt: Runtime): number | null {
    let best: number | null = null;
    let bestCost = Infinity;
    for (const v of this.g.allVertices()) {
      if (v.type !== "FuelStation" || !v.active) continue;
      const r = dijkstra(this.g, rt.currentVertex, v.id, rt.cost);
      if (r.found && r.cost < bestCost) {
        bestCost = r.cost;
        best = v.id;
      }
    }
    return best;
  }

  // ---- events ----
  private processEvents(): void {
    // expire temporary effects + restore graph mutations whose time has passed
    this.layer.expire(this.clock);
    for (let i = this.restores.length - 1; i >= 0; i--) {
      if (this.restores[i]!.expiresAt <= this.clock) {
        this.restores[i]!.apply();
        this.restores.splice(i, 1);
      }
    }

    const due = this.scheduler.popDue(this.clock);
    for (const ev of due) {
      const target = ev.targetEdgeOrVertex;
      const expiresAt = ev.duration > 0 ? this.clock + ev.duration : Infinity;
      switch (ev.type) {
        case "RoadBlockage":
        case "ShortcutToggle": {
          if (!this.hasEdge(target)) break; // validate target exists
          const wasOpen = this.g.getEdge(target).status;
          this.g.setEdgeStatus(target, "Blocked");
          if (expiresAt !== Infinity) {
            this.restores.push({ expiresAt, apply: () => this.g.setEdgeStatus(target, wasOpen) });
          }
          break;
        }
        case "OilSpill":
          if (this.hasEdge(target)) {
            this.layer.add({ sourceEventId: ev.eventId, type: ev.type, target, expiresAt, magnitude: 2 });
          }
          break;
        case "SpeedRestriction":
          if (this.hasEdge(target)) {
            this.layer.add({ sourceEventId: ev.eventId, type: ev.type, target, expiresAt, speedCap: 0.5 });
          }
          break;
        case "FuelStationAvailability":
        case "NitroBooster":
          if (this.g.hasVertex(target)) {
            const prev = this.g.getVertex(target).active;
            this.g.setVertexActive(target, true);
            if (expiresAt !== Infinity) {
              this.restores.push({ expiresAt, apply: () => this.g.setVertexActive(target, prev) });
            }
          }
          break;
      }
    }
  }

  private hasEdge(id: number): boolean {
    return this.g.allEdges().some((e) => e.id === id);
  }

  // ---- main step ----
  tick(dt: number = this.dt): void {
    if (this.finished) return;
    this.clock += dt;
    this.processEvents();
    for (const rt of this.runtimes) this.advance(rt, dt);
    if (this.config.timeLimit !== undefined && this.clock >= this.config.timeLimit) {
      for (const rt of this.runtimes) if (rt.status === "racing") rt.status = "dnf";
    }
    if (this.clock >= this.maxClock) {
      for (const rt of this.runtimes) if (rt.status === "racing") rt.status = "dnf";
    }
  }

  private advance(rt: Runtime, dt: number): void {
    if (rt.status !== "racing") return;
    rt.totalTime = this.clock;

    if (rt.pauseTimeLeft > 0) {
      rt.pauseTimeLeft -= dt;
      return;
    }

    if (rt.edgeIndex >= rt.routeEdges.length) {
      this.plan(rt);
      if (rt.routeEdges.length === 0) {
        rt.status = "dnf";
        return;
      }
    }

    const edge = this.g.getEdge(rt.routeEdges[rt.edgeIndex]!);

    // at the start of an edge: handle closure + fuel
    if (rt.progressTime === 0) {
      if (edge.status === "Blocked") {
        this.plan(rt); // reroute from current state (no restart)
        if (rt.routeEdges.length === 0) rt.status = "dnf";
        return;
      }
      const eff = this.layer.effectiveEdge(edge);
      const need = fuelForEdge(eff);
      if (rt.fuelTenths < need && rt.refuelTarget === null) {
        const station = this.nearestStation(rt);
        if (station === null || !this.routeToStation(rt, station)) {
          rt.status = "dnf";
        }
        return;
      }
    }

    const eff = this.layer.effectiveEdge(edge);
    rt.progressTime += dt;
    if (rt.progressTime >= eff.baseTime) {
      rt.fuelTenths -= fuelForEdge(eff);
      rt.currentVertex = rt.route[rt.edgeIndex + 1]!;
      rt.edgeIndex++;
      rt.progressTime = 0;
      this.onArrive(rt);
    }
  }

  private onArrive(rt: Runtime): void {
    const v = this.g.getVertex(rt.currentVertex);

    // refuel detour reached
    if (rt.refuelTarget === rt.currentVertex) {
      rt.fuelTenths = RULES.MAX_FUEL_TENTHS;
      rt.pauseTimeLeft = RULES.FUEL_STATION_STOP_TIME;
      rt.refuelTarget = null;
      this.plan(rt);
      return;
    }

    // nitro pickup
    if (v.type === "NitroPickup" && v.active && rt.nitro < RULES.MAX_NITRO) {
      rt.nitro++;
    }

    // checkpoint progression (must be the next required one, in order)
    const nextRequired = this.config.checkpointOrder[rt.checkpointProgress];
    if (nextRequired !== undefined && rt.currentVertex === nextRequired) {
      rt.checkpointProgress++;
    }

    // lap / finish
    if (
      rt.currentVertex === this.config.finishVertex &&
      rt.checkpointProgress === this.config.checkpointOrder.length
    ) {
      const lapTime = this.clock - rt.lapStartTime;
      rt.fastestLap = Math.min(rt.fastestLap, lapTime);
      rt.lap++;
      rt.lapStartTime = this.clock;
      rt.checkpointProgress = 0;
      if (rt.lap >= this.config.laps) {
        rt.status = "finished";
        rt.finishTime = this.clock;
        this.finishCounter++;
        return;
      }
      this.plan(rt); // next lap from the finish line
      return;
    }

    // proactive AI refuel below threshold
    if (
      !rt.isHuman &&
      rt.refuelTarget === null &&
      v.type !== "FuelStation" &&
      rt.fuelTenths < RULES.REFUEL_THRESHOLD * RULES.MAX_FUEL_TENTHS
    ) {
      const station = this.nearestStation(rt);
      if (station !== null) this.routeToStation(rt, station);
    }
  }

  // ---- outputs ----
  get finished(): boolean {
    return this.runtimes.every((r) => r.status !== "racing");
  }

  get state(): RaceState {
    return {
      clock: this.clock,
      finished: this.finished,
      racers: this.runtimes.map((rt) => {
        const edge = rt.edgeIndex < rt.routeEdges.length ? this.g.getEdge(rt.routeEdges[rt.edgeIndex]!) : null;
        const eff = edge ? this.layer.effectiveEdge(edge) : null;
        return {
          id: rt.id,
          name: rt.name,
          isHuman: rt.isHuman,
          currentVertex: rt.currentVertex,
          edgeId: edge ? edge.id : null,
          progress: eff && eff.baseTime > 0 ? Math.min(1, rt.progressTime / eff.baseTime) : 0,
          fuelTenths: rt.fuelTenths,
          nitro: rt.nitro,
          lap: rt.lap,
          checkpointProgress: rt.checkpointProgress,
          totalTime: rt.totalTime,
          status: rt.status,
        };
      }),
    };
  }

  /** Run to completion deterministically. Returns the number of ticks executed. */
  run(): number {
    let ticks = 0;
    while (!this.finished && this.clock < this.maxClock) {
      this.tick();
      ticks++;
    }
    return ticks;
  }

  results(raceId = 0): RaceResultRow[] {
    const finishers = this.runtimes
      .filter((r) => r.status === "finished")
      .sort((a, b) => (a.finishTime !== b.finishTime ? a.finishTime - b.finishTime : a.id - b.id));
    const others = this.runtimes
      .filter((r) => r.status !== "finished")
      .sort((a, b) => a.id - b.id);

    const ordered = [...finishers, ...others];
    return ordered.map((rt, i) => ({
      raceId,
      racerId: rt.id,
      finishPosition: i + 1,
      finishTime: rt.status === "finished" ? rt.finishTime : Infinity,
      fastestLap: rt.fastestLap,
      bonusPoints: 0,
      pointsAwarded: 0,
    }));
  }
}
