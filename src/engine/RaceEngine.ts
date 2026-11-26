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
 *
 * Fuel & recovery policy (spec §4.2 rule 6, §4.3, §4.4 — identical for every racer):
 *   - a car never starts an edge without the fuel for it (fuel is clamped at 0, never negative);
 *   - one station stop sells at most 40 units (RULES.FUEL_STATION_MAX_PURCHASE_TENTHS) and takes
 *     the fixed stop time; a full tank buys nothing and costs no time;
 *   - a car that cannot afford its next edge buys fuel if it is standing on an active station,
 *     otherwise it reroutes to the nearest active station it can reach on the fuel it has;
 *   - if no such station exists the car is DNF (recorded, never frozen);
 *   - AI cars also stop at the first station they reach below 25% fuel (RULES.REFUEL_THRESHOLD).
 *
 * Event effects (spec §4.5): road closures, shortcut toggles and station activations are kept as
 * independent effects with their own expiry; the graph state is RE-DERIVED from the base state plus
 * every still-active effect, so one expiring never erases another that is still running.
 */

import type { Graph } from "../core/Graph";
import type { EdgeStatus, Racer } from "../core/types";
import { dijkstra } from "../algorithms/dijkstra";
import { planCheckpointRoute, type RouteSolver } from "../algorithms/route";
import { weightedHeuristic } from "../algorithms/astar";
import { planFuelStops, type RoutePosition } from "../algorithms/fuelPlan";
import { knapsack01, type Item } from "../algorithms/knapsack";
import { greedyKnapsack } from "../algorithms/greedy";
import type { EdgeCostFn } from "../algorithms/pathTypes";
import { costFn, PRESETS, REFS, type PresetName } from "../core/cost";
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
  /**
   * The routing the player picked in the Track Explorer: the human racer is routed with this cost preset,
   * and with A* (instead of plain Dijkstra) per checkpoint leg when `useAStar` is set. Both return the
   * same optimal cost; the point is that the player's chosen algorithm is the one driving the car.
   */
  humanPlan?: { preset: PresetName; useAStar: boolean };
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
  strategyType: import("../core/types").StrategyType;
  cost: EdgeCostFn;
  solver: RouteSolver;
  /** Multiplier on edge traversal speed (>1 = faster). Reflects the algorithm's route-quality. */
  speedFactor: number;
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
  /** Pickups this racer has already collected, so the planner never adds the same one to the route twice. */
  collected: Set<number>;
  /** True once this racer has bought fuel at the station it currently stands on (one purchase per stop). */
  refuelledHere: boolean;
  /** Next station stop chosen by the fuel DP: arrive at route[routeIndex], then detour to `station`. */
  nextStop: { routeIndex: number; station: number } | null;
  planVersion: number;
  nitroTimeLeft: number; // seconds of boost remaining (0 = inactive)
  nitroProgress: number; // seconds of base edge time covered under nitro on the current edge
}

/** A temporary change to the graph's own state (not the cost-only EffectLayer). */
interface GraphEffect {
  kind: "edge" | "vertex";
  target: number;
  /** block: edge is Blocked; open: a closed shortcut is Open; activate: a service vertex is active. */
  op: "block" | "open" | "activate";
  expiresAt: number;
}

export interface RacerSnapshot {
  id: number;
  name: string;
  isHuman: boolean;
  strategyType: import("../core/types").StrategyType;
  currentVertex: number;
  edgeId: number | null;
  progress: number; // 0..1 along the current edge (for interpolation)
  fuelTenths: number;
  nitro: number;
  /** True while a nitro charge is burning (1.5x speed, 2x fuel on that portion). */
  nitroActive: boolean;
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
  private graphEffects: GraphEffect[] = [];
  /** Original state of every edge / vertex a graph effect has touched (taken before the first change). */
  private readonly baseEdge = new Map<number, EdgeStatus>();
  private readonly baseVertex = new Map<number, boolean>();
  /** Bumped whenever the graph or an active effect changes; racers re-plan fuel stops when it moves. */
  private graphVersion = 0;
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
        strategyType: r.strategyType,
        cost: this.strategyCost(r),
        solver: this.strategySolver(r),
        speedFactor: this.strategySpeed(r),
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
        collected: new Set<number>(),
        refuelledHere: false,
        nextStop: null,
        planVersion: 0,
        nitroTimeLeft: 0,
        nitroProgress: 0,
      };
      this.plan(rt);
      if (rt.routeEdges.length === 0) rt.status = "dnf"; // unroutable from the start
      this.runtimes.push(rt);
    }
  }

  // ---- strategy cost and solver (opponents reuse the shared cost model) ----
  private strategyCost(r: Racer): EdgeCostFn {
    if (r.isHuman && this.config.humanPlan) {
      return costFn(PRESETS[this.config.humanPlan.preset], REFS, (e) => this.layer.effectiveEdge(e));
    }
    if (r.strategyType === "AStarRouter") {
      return costFn(PRESETS.Speed, REFS, (e) => this.layer.effectiveEdge(e));
    }
    const base = costFn(PRESETS.Balanced, REFS, (e) => this.layer.effectiveEdge(e));
    if (r.strategyType === "ShortcutSeeker") {
      return (e) => (e.isShortcut ? base(e) * 0.2 : base(e));
    }
    if (r.strategyType === "MinDistance") {
      return (e) => this.layer.effectiveEdge(e).distance;
    }
    return base;
  }

  private strategySolver(r: Racer): RouteSolver {
    if (r.isHuman && this.config.humanPlan?.useAStar) return 'astar';
    if (r.strategyType === "AStarRouter") return 'astar';
    if (r.strategyType === "BFSRouter") return 'bfs';
    if (r.strategyType === "DFSRouter") return 'dfs';
    return 'dijkstra';
  }

  private strategySpeed(r: Racer): number {
    if (r.strategyType === "AStarRouter") return 1.08;
    if (r.strategyType === "BFSRouter") return 0.92;
    if (r.strategyType === "DFSRouter") return 0.85;
    return 1.0;
  }

  // ---- planning ----
  private plan(rt: Runtime): void {
    const remaining = this.config.checkpointOrder.slice(rt.checkpointProgress);
    // Optional nitro pickups chosen by the knapsack/greedy planner, inserted as waypoints BEFORE the
    // mandatory checkpoints. They never reorder checkpoints (those stay in required order) and the fuel
    // planner prices the whole route including the detour, so a pickup can never strand the car.
    const firstWaypoint = remaining[0] ?? this.config.finishVertex;
    const pickups = this.choosePickups(rt, firstWaypoint);
    const heuristic = rt.solver === 'astar' ? weightedHeuristic(this.g, rt.cost) : undefined;
    let plan = planCheckpointRoute(
      this.g,
      rt.currentVertex,
      [...pickups, ...remaining],
      this.config.finishVertex,
      rt.cost,
      undefined,
      heuristic,
      rt.solver,
    );
    // BFS/DFS may produce a route so long the fuel plan is infeasible; fall back to Dijkstra
    if (!plan.found && (rt.solver === 'bfs' || rt.solver === 'dfs')) {
      plan = planCheckpointRoute(this.g, rt.currentVertex, [...remaining], this.config.finishVertex, rt.cost);
    }
    rt.route = plan.found ? plan.path : [];
    rt.routeEdges = plan.found ? plan.edges : [];
    rt.edgeIndex = 0;
    rt.progressTime = 0;
    rt.planVersion = this.graphVersion;
    this.planStops(rt);
    this.executeStop(rt);
  }

  /** Detour to `station`. Planned stops follow the fuel-cheapest road (what the DP priced); others use the racer's cost. */
  private routeToStation(rt: Runtime, station: number, byFuel = false): boolean {
    const cost: EdgeCostFn = byFuel ? (e) => fuelForEdge(this.layer.effectiveEdge(e)) : rt.cost;
    const path = dijkstra(this.g, rt.currentVertex, station, cost);
    if (!path.found || path.edges.length === 0) return false;
    rt.route = path.path;
    rt.routeEdges = path.edges;
    rt.edgeIndex = 0;
    rt.progressTime = 0;
    rt.refuelTarget = station;
    rt.nextStop = null;
    return true;
  }

  /**
   * Fuel planning (spec §5.3): run the refuelling DP over the rest of the race — this lap's route plus
   * every remaining lap — and remember the FIRST station stop it asks for. Re-run whenever the route
   * changes (closure, lap end, after a stop) or the world changes, so the plan starts from the real state.
   *
   * Recovery rule (identical for every racer): if NO stop plan makes the current route feasible, reroute
   * for economy (fuel-heavy cost) and plan again; if that is infeasible too, keep the route and let
   * handleLowFuel() refuel or DNF the car when it truly runs dry.
   */
  private planStops(rt: Runtime): void {
    rt.nextStop = null;
    if (rt.routeEdges.length === 0) return;
    let r = this.evaluateHorizons(rt, rt.route.slice(rt.edgeIndex), rt.routeEdges.slice(rt.edgeIndex), rt.cost);
    let base = rt.edgeIndex;
    if (!r.feasible && rt.refuelTarget === null) {
      const economy = costFn(PRESETS.Economy, REFS, (e) => this.layer.effectiveEdge(e));
      const remaining = this.config.checkpointOrder.slice(rt.checkpointProgress);
      const alt = planCheckpointRoute(this.g, rt.currentVertex, [...remaining], this.config.finishVertex, economy);
      if (alt.found && alt.edges.length > 0) {
        const ra = this.evaluateHorizons(rt, alt.path, alt.edges, economy);
        if (ra.feasible) {
          rt.route = alt.path;
          rt.routeEdges = alt.edges;
          rt.edgeIndex = 0;
          rt.progressTime = 0;
          r = ra;
          base = 0;
        }
      }
    }
    if (r.first) rt.nextStop = { routeIndex: base + r.first.position, station: r.first.station };
  }

  /**
   * Plan over the whole remaining race; if that is infeasible (e.g. a temporary closure makes the NEXT
   * lap look unaffordable) fall back to this lap only and re-plan at the lap boundary with fresher data.
   */
  private evaluateHorizons(rt: Runtime, verts: number[], edges: number[], lapCost: EdgeCostFn) {
    // later laps are priced as if TEMPORARY closures had ended (their expiry is known); permanent ones stay
    const optimistic = this.withTemporaryClosuresLifted(() => this.evaluateStops(rt, verts, edges, lapCost, true));
    if (optimistic.feasible) return optimistic;
    const full = this.evaluateStops(rt, verts, edges, lapCost, true);
    return full.feasible ? full : this.evaluateStops(rt, verts, edges, lapCost, false);
  }

  /** Run `fn` with every edge held closed ONLY by temporary effects reopened, then restore the exact statuses. */
  private withTemporaryClosuresLifted<T>(fn: () => T): T {
    const saved: Array<[number, EdgeStatus]> = [];
    for (const [id, base] of this.baseEdge) {
      const permanent = this.graphEffects.some((e) => e.kind === "edge" && e.target === id && e.expiresAt === Infinity);
      if (permanent) continue;
      saved.push([id, this.g.getEdge(id).status]);
      this.g.setEdgeStatus(id, base);
    }
    try {
      return fn();
    } finally {
      for (const [id, status] of saved) this.g.setEdgeStatus(id, status);
    }
  }

  /** Run the DP on this lap's remaining road (verts/edges) + all later laps; report feasibility and the first stop. */
  private evaluateStops(
    rt: Runtime,
    lapVerts: number[],
    lapEdges: number[],
    lapCost: EdgeCostFn,
    futureLaps: boolean,
  ): { feasible: boolean; first: { position: number; station: number } | null } {
    const fuelCost: EdgeCostFn = (e) => fuelForEdge(this.layer.effectiveEdge(e));
    const verts = [...lapVerts];
    const edges = [...lapEdges];
    const thisLapLen = verts.length;
    for (let lap = rt.lap + 1; futureLaps && lap < this.config.laps; lap++) {
      const next = planCheckpointRoute(this.g, this.config.finishVertex, [...this.config.checkpointOrder], this.config.finishVertex, lapCost);
      if (!next.found) break;
      verts.push(...next.path.slice(1));
      edges.push(...next.edges);
    }

    const stations = this.g.allVertices().filter((v) => v.type === "FuelStation" && v.active).map((v) => v.id);
    const stationOf = new Map<number, number>();
    const detours = new Map<number, RoutePosition["detour"]>();
    const pathTime = (ids: number[]): number => ids.reduce((t, id) => t + this.layer.effectiveEdge(this.g.getEdge(id)).baseTime, 0);
    const detourFor = (v: number): RoutePosition["detour"] => {
      if (detours.has(v)) return detours.get(v)!;
      let best: RoutePosition["detour"] = null;
      let bestTotal = Infinity;
      for (const s of stations) {
        if (s === v) {
          best = { goFuel: 0, backFuel: 0, time: 0 };
          stationOf.set(v, s);
          break;
        }
        const go = dijkstra(this.g, v, s, fuelCost);
        const back = dijkstra(this.g, s, v, fuelCost);
        if (!go.found || !back.found || go.cost + back.cost >= bestTotal) continue;
        bestTotal = go.cost + back.cost;
        best = { goFuel: go.cost, backFuel: back.cost, time: pathTime(go.edges) + pathTime(back.edges) };
        stationOf.set(v, s);
      }
      detours.set(v, best);
      return best;
    };

    const positions: RoutePosition[] = verts.map((v, k) => {
      const e = k < edges.length ? this.layer.effectiveEdge(this.g.getEdge(edges[k]!)) : null;
      return {
        legFuel: e ? fuelForEdge(e) : 0,
        legTime: e ? e.baseTime : 0,
        detour: k === 0 && rt.refuelledHere ? null : detourFor(v),
      };
    });
    const result = planFuelStops({
      positions,
      capacity: RULES.MAX_FUEL_TENTHS,
      startFuel: rt.fuelTenths,
      maxPurchase: RULES.FUEL_STATION_MAX_PURCHASE_TENTHS,
      stopTime: RULES.FUEL_STATION_STOP_TIME,
      buyStep: 10, // buy whole units: bounds the DP's purchase options at 40
    });
    const first = result.feasible ? result.stops[0] : undefined;
    return {
      feasible: result.feasible,
      first: first && first.position < thisLapLen ? { position: first.position, station: stationOf.get(verts[first.position]!)! } : null,
    };
  }

  /** Carry out the planned stop if the racer is at its position now. Returns true if it started one. */
  private executeStop(rt: Runtime): boolean {
    const s = rt.nextStop;
    if (!s || s.routeIndex !== rt.edgeIndex) return false;
    rt.nextStop = null;
    if (s.station === rt.currentVertex) {
      if (rt.refuelledHere) return false;
      this.buyFuel(rt);
      this.planStops(rt); // replan from the new fuel level (position 0 is now excluded)
      return true;
    }
    return this.routeToStation(rt, s.station, true);
  }

  /** Fuel (tenths) needed to drive these edges under the effects active right now. */
  private pathFuel(edgeIds: readonly number[]): number {
    let sum = 0;
    for (const id of edgeIds) sum += fuelForEdge(this.layer.effectiveEdge(this.g.getEdge(id)));
    return sum;
  }

  /**
   * Cheapest active station (other than the vertex the racer stands on) that the racer can
   * actually REACH on the fuel it has left — a station it would run dry before reaching is
   * not a recovery route (spec §4.2 rule 6).
   */
  private nearestStation(rt: Runtime): number | null {
    let best: number | null = null;
    let bestCost = Infinity;
    for (const v of this.g.allVertices()) {
      if (v.type !== "FuelStation" || !v.active || v.id === rt.currentVertex) continue;
      const r = dijkstra(this.g, rt.currentVertex, v.id, rt.cost);
      if (!r.found || r.cost >= bestCost) continue;
      if (this.pathFuel(r.edges) > rt.fuelTenths) continue;
      bestCost = r.cost;
      best = v.id;
    }
    return best;
  }

  /** One purchase at the station the racer stands on: at most 40 units, fixed stop time if > 0. */
  private buyFuel(rt: Runtime): void {
    const buy = Math.min(RULES.MAX_FUEL_TENTHS - rt.fuelTenths, RULES.FUEL_STATION_MAX_PURCHASE_TENTHS);
    if (buy > 0) {
      rt.fuelTenths += buy;
      rt.pauseTimeLeft = RULES.FUEL_STATION_STOP_TIME;
    }
    rt.refuelledHere = true;
  }

  /** The racer cannot afford its next edge: refuel here, reroute to a reachable station, or DNF. */
  private handleLowFuel(rt: Runtime): void {
    const here = this.g.getVertex(rt.currentVertex);
    if (here.type === "FuelStation" && here.active && !rt.refuelledHere) {
      this.buyFuel(rt);
      rt.refuelTarget = null;
      this.plan(rt);
      return;
    }
    const station = this.nearestStation(rt);
    if (station === null || !this.routeToStation(rt, station)) rt.status = "dnf";
  }

  /**
   * Pickup planner (spec §5.3, §6): choose which optional nitro pickups are worth adding to the route,
   * using the 0/1 Knapsack DP — the SAME knapsack01 the Algorithm Lab shows. Each uncollected, reachable,
   * cheap-to-reach pickup is an item: cost = extra fuel (whole units) to swing by it from the current
   * position, benefit = the value of a nitro charge; the budget caps the total detour the racer will
   * accept, and at most (MAX_NITRO - nitro) charges are useful. BFS/DFS/shortcut styles use the GREEDY
   * heuristic instead of the DP, so greedy also drives real gameplay.
   *
   * The selected pickups are returned as extra WAYPOINTS (nearest first) to prepend to the checkpoint
   * route. Because they go through the normal planCheckpointRoute + fuel-stop DP, the fuel planner sees
   * the whole trip and schedules refuels for it — a pickup can never strand a car. AI only; the human
   * collects by driving where they chose.
   */
  private choosePickups(rt: Runtime, nextWaypoint: number): number[] {
    if (rt.isHuman || rt.nitro >= RULES.MAX_NITRO) return [];
    const want = RULES.MAX_NITRO - rt.nitro;
    const DETOUR_BUDGET_UNITS = 25; // willingness to spend fuel on pickups across this plan

    const fuelCost: EdgeCostFn = (e) => fuelForEdge(this.layer.effectiveEdge(e));
    const reach = new Map<number, number>(); // pickup id -> one-way fuel (tenths) from current position
    const items: Item[] = [];
    for (const v of this.g.allVertices()) {
      if (v.type !== "NitroPickup" || !v.active || v.id === rt.currentVertex) continue;
      if (rt.collected.has(v.id)) continue;
      const go = dijkstra(this.g, rt.currentVertex, v.id, fuelCost);
      if (!go.found) continue;
      // extra fuel to swing by the pickup vs. going straight to the next waypoint
      const straight = dijkstra(this.g, rt.currentVertex, nextWaypoint, fuelCost);
      const viaPickup = dijkstra(this.g, v.id, nextWaypoint, fuelCost);
      if (!viaPickup.found) continue;
      const extra = go.cost + viaPickup.cost - (straight.found ? straight.cost : 0);
      const costUnits = Math.max(1, Math.ceil(extra / 10));
      if (costUnits > DETOUR_BUDGET_UNITS) continue;
      reach.set(v.id, go.cost);
      items.push({ id: v.id, cost: costUnits, benefit: 10 });
    }
    if (items.length === 0) return [];

    const useGreedy =
      rt.strategyType === "ShortcutSeeker" || rt.strategyType === "BFSRouter" || rt.strategyType === "DFSRouter";
    const chosen = useGreedy ? greedyKnapsack(items, DETOUR_BUDGET_UNITS) : knapsack01(items, DETOUR_BUDGET_UNITS);

    // keep at most `want` charges, nearest-first so the inserted detour stays short
    return chosen.selected
      .slice()
      .sort((a, b) => (reach.get(a) ?? 0) - (reach.get(b) ?? 0))
      .slice(0, want);
  }

  // ---- events ----
  private processEvents(): void {
    // drop expired temporary effects; the graph is re-derived below if anything changed
    const fxBefore = this.layer.activeCount();
    this.layer.expire(this.clock);
    let changed = this.layer.activeCount() !== fxBefore;
    const alive = this.graphEffects.filter((e) => e.expiresAt > this.clock);
    let dirty = alive.length !== this.graphEffects.length;
    this.graphEffects = alive;

    const due = this.scheduler.popDue(this.clock);
    for (const ev of due) {
      const target = ev.targetEdgeOrVertex;
      const expiresAt = ev.duration > 0 ? this.clock + ev.duration : Infinity;
      switch (ev.type) {
        case "RoadBlockage":
          if (!this.hasEdge(target)) break; // validate target exists
          this.addGraphEffect({ kind: "edge", target, op: "block", expiresAt });
          dirty = true;
          break;
        case "ShortcutToggle": {
          // valid only on a real shortcut edge. Direction comes from the shortcut's ORIGINAL state
          // (open -> close, closed -> open), so it does not depend on other events of the same tick.
          if (!this.hasEdge(target) || !this.g.getEdge(target).isShortcut) break;
          this.snapshotEdge(target);
          const op = this.baseEdge.get(target) === "Blocked" ? "open" : "block";
          this.addGraphEffect({ kind: "edge", target, op, expiresAt });
          dirty = true;
          break;
        }
        case "OilSpill":
          if (this.hasEdge(target)) {
            this.layer.add({ sourceEventId: ev.eventId, type: ev.type, target, expiresAt, magnitude: 2 });
            changed = true;
          }
          break;
        case "SpeedRestriction":
          if (this.hasEdge(target)) {
            this.layer.add({ sourceEventId: ev.eventId, type: ev.type, target, expiresAt, speedCap: 0.5 });
            changed = true;
          }
          break;
        case "FuelStationAvailability":
        case "NitroBooster": {
          if (!this.g.hasVertex(target)) break;
          const wanted = ev.type === "FuelStationAvailability" ? "FuelStation" : "NitroPickup";
          if (this.g.getVertex(target).type !== wanted) break; // event not valid for this kind of vertex
          this.addGraphEffect({ kind: "vertex", target, op: "activate", expiresAt });
          dirty = true;
          break;
        }
      }
    }
    if (dirty) this.applyGraphEffects();
    if (dirty || changed) this.graphVersion++;
  }

  private snapshotEdge(id: number): void {
    if (!this.baseEdge.has(id)) this.baseEdge.set(id, this.g.getEdge(id).status);
  }

  private addGraphEffect(effect: GraphEffect): void {
    if (effect.kind === "edge") this.snapshotEdge(effect.target);
    else if (!this.baseVertex.has(effect.target)) this.baseVertex.set(effect.target, this.g.getVertex(effect.target).active);
    this.graphEffects.push(effect);
  }

  /**
   * Re-derive every touched edge/vertex from its ORIGINAL state plus all effects still running
   * (documented combination order: a closure beats a re-open; any activation keeps a station on).
   * When nothing is running on a target any more, its original state is restored exactly.
   */
  private applyGraphEffects(): void {
    for (const [id, base] of [...this.baseEdge]) {
      const fx = this.graphEffects.filter((e) => e.kind === "edge" && e.target === id);
      let status: EdgeStatus = base;
      if (fx.some((e) => e.op === "block")) status = "Blocked";
      else if (fx.some((e) => e.op === "open")) status = base === "Blocked" ? "Open" : base;
      this.g.setEdgeStatus(id, status);
      if (fx.length === 0) this.baseEdge.delete(id);
    }
    for (const [id, base] of [...this.baseVertex]) {
      const fx = this.graphEffects.filter((e) => e.kind === "vertex" && e.target === id);
      this.g.setVertexActive(id, fx.length > 0 ? true : base);
      if (fx.length === 0) this.baseVertex.delete(id);
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

    // the world changed since the fuel plan was made (a road reopened, a station went offline, ...): re-plan stops
    if (rt.progressTime === 0 && rt.refuelTarget === null && rt.planVersion !== this.graphVersion) {
      rt.planVersion = this.graphVersion;
      this.planStops(rt);
      if (this.executeStop(rt)) return;
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
      if (rt.fuelTenths < need) {
        this.handleLowFuel(rt); // refuel here, reroute to a reachable station, or DNF — never drive dry
        return;
      }
    }

    const eff = this.layer.effectiveEdge(edge);
    // Nitro (spec §4.3): 1.5x speed while a charge burns; the covered portion burns 2x fuel.
    let step = dt * rt.speedFactor;
    if (rt.nitroTimeLeft > 0) {
      step = dt * rt.speedFactor * RULES.NITRO_SPEED_MULTIPLIER;
      rt.nitroProgress += step;
      rt.nitroTimeLeft = Math.max(0, rt.nitroTimeLeft - dt);
    }
    rt.progressTime += step;
    if (rt.progressTime >= eff.baseTime) {
      const base = fuelForEdge(eff);
      const nitroFrac = eff.baseTime > 0 ? Math.min(1, rt.nitroProgress / eff.baseTime) : 0;
      // Fuel was verified at the start of the edge; a nitro burst or a hazard that appeared mid-edge
      // can only overdraw by a few tenths, so the tank is clamped at 0 and never reads negative.
      rt.fuelTenths = Math.max(0, rt.fuelTenths - Math.round(base * (1 + (RULES.NITRO_FUEL_PENALTY - 1) * nitroFrac)));
      rt.nitroProgress = 0;
      rt.currentVertex = rt.route[rt.edgeIndex + 1]!;
      rt.edgeIndex++;
      rt.progressTime = 0;
      this.onArrive(rt);
    }
  }

  private onArrive(rt: Runtime): void {
    const v = this.g.getVertex(rt.currentVertex);
    rt.refuelledHere = false; // a new vertex => a new purchase is allowed

    // refuel detour reached (the station may have gone offline while we drove: then buy nothing)
    if (rt.refuelTarget === rt.currentVertex) {
      rt.refuelTarget = null;
      if (v.active) this.buyFuel(rt);
      this.plan(rt);
      return;
    }

    // nitro pickup (collected by driving through it; the knapsack planner put it on the route)
    if (v.type === "NitroPickup" && v.active && rt.nitro < RULES.MAX_NITRO) {
      rt.nitro++;
      rt.collected.add(v.id);
    }

    // AI nitro usage: fire one charge at the start of a fresh lap (fuel is at its highest)
    if (!rt.isHuman && rt.nitro > 0 && rt.nitroTimeLeft === 0 && rt.edgeIndex <= 1 && rt.fuelTenths >= RULES.MAX_FUEL_TENTHS * 0.9) {
      rt.nitro--;
      rt.nitroTimeLeft = RULES.NITRO_DURATION;
    }

    // AI rule (spec §4.4): stop at the first eligible station reached while below the 25% threshold
    if (
      v.type === "FuelStation" &&
      v.active &&
      !rt.isHuman &&
      rt.fuelTenths < RULES.REFUEL_THRESHOLD * RULES.MAX_FUEL_TENTHS
    ) {
      this.buyFuel(rt);
      return;
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

    // the DP's next planned station stop (all racers)
    if (rt.refuelTarget === null && this.executeStop(rt)) return;

    // proactive AI refuel below threshold
    if (
      !rt.isHuman &&
      rt.refuelTarget === null &&
      v.type !== "FuelStation" &&
      rt.fuelTenths < RULES.REFUEL_THRESHOLD * RULES.MAX_FUEL_TENTHS
    ) {
      const station = this.nearestStation(rt);
      if (station !== null) {
        this.routeToStation(rt, station);
        return;
      }
    }
  }

  /**
   * Human/driver input: burn one nitro charge (spec §4.3). Returns false if the racer
   * is not racing, has no charge, or a boost is already active. Never called by the
   * deterministic AI, so unused races are unchanged.
   */
  activateNitro(racerId: number): boolean {
    const rt = this.runtimes.find((r) => r.id === racerId);
    if (!rt || rt.status !== "racing" || rt.nitro <= 0 || rt.nitroTimeLeft > 0) return false;
    rt.nitro--;
    rt.nitroTimeLeft = RULES.NITRO_DURATION;
    return true;
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
          strategyType: rt.strategyType,
          currentVertex: rt.currentVertex,
          edgeId: edge ? edge.id : null,
          progress: eff && eff.baseTime > 0 ? Math.min(1, rt.progressTime / eff.baseTime) : 0,
          fuelTenths: rt.fuelTenths,
          nitro: rt.nitro,
          nitroActive: rt.nitroTimeLeft > 0,
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
    // spec §4.2 rule 8: unfinished racers rank by laps completed, checkpoints completed,
    // elapsed time, then racer id. They are classified after every finisher.
    const others = this.runtimes
      .filter((r) => r.status !== "finished")
      .sort(
        (a, b) =>
          b.lap - a.lap ||
          b.checkpointProgress - a.checkpointProgress ||
          a.totalTime - b.totalTime ||
          a.id - b.id,
      );

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
