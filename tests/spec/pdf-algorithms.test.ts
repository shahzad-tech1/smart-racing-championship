/**
 * tests/spec/pdf-algorithms.test.ts — adversarial compliance suite for Project.pdf §3, §5, §6, §9.1.
 *
 * Every algorithm is checked against an INDEPENDENT reference (Bellman-Ford, subset
 * enumeration, exhaustive recursion, Array.sort) over seeded random instances, so a
 * bug cannot hide behind a test that shares its logic. Seeds are fixed -> reproducible.
 */
import { describe, it, expect } from "vitest";
import { Graph } from "../../src/core/Graph";
import type { ChampionshipEntry, Edge, Vertex } from "../../src/core/types";
import { makeRng, randInt, shuffle } from "../../src/core/rng";
import { PRESETS, REFS, costFn, edgeCost } from "../../src/core/cost";
import { bfs } from "../../src/algorithms/bfs";
import { dfs, weaklyConnectedComponents } from "../../src/algorithms/dfs";
import { dijkstra } from "../../src/algorithms/dijkstra";
import { aStar, euclideanHeuristic, weightedHeuristic } from "../../src/algorithms/astar";
import { planCheckpointRoute } from "../../src/algorithms/route";
import { enumerateSimplePaths } from "../../src/algorithms/paths";
import { knapsack01, knapsack01Value, type Item } from "../../src/algorithms/knapsack";
import { greedyKnapsack } from "../../src/algorithms/greedy";
import { refuelDP } from "../../src/algorithms/refuel";
import { planFuelStops, type RoutePosition } from "../../src/algorithms/fuelPlan";
import { mergeSort, quickSort, heapSort, topK } from "../../src/algorithms/sort";
import { kruskalMST, mstWeight } from "../../src/algorithms/mst";
import { compareChampionship, awardPoints, POINTS } from "../../src/engine/comparator";
import { buildStandings } from "../../src/engine/championship";
import { EventScheduler } from "../../src/engine/EventScheduler";
import { countingTrace } from "../../src/core/instrumentation";
import { V, E } from "../algorithms/fixtures";

// ------------------------------------------------------------------ helpers

interface GenOpts {
  blockedProb?: number;
  restrictedProb?: number;
  directedProb?: number;
  selfLoops?: boolean;
}

/** Random graph whose edge lengths are >= the straight-line distance (A* precondition, PDF §5.2). */
function randomGraph(seed: number, o: GenOpts = {}): Graph {
  const rng = makeRng(seed);
  const n = randInt(rng, 1, 9);
  const vs: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    vs.push({ id: i, x: randInt(rng, 0, 30), y: randInt(rng, 0, 30), type: "Intersection", checkpointOrder: null, active: true });
  }
  const m = n === 1 ? randInt(rng, 0, 1) : randInt(rng, 0, n * 2 + 2);
  const es: Edge[] = [];
  for (let k = 1; k <= m; k++) {
    const from = randInt(rng, 0, n - 1);
    let to = randInt(rng, 0, n - 1);
    if (!o.selfLoops && n > 1) while (to === from) to = randInt(rng, 0, n - 1);
    if (!o.selfLoops && n === 1) break;
    const a = vs[from]!;
    const b = vs[to]!;
    const eu = Math.hypot(a.x - b.x, a.y - b.y);
    const r = rng();
    es.push({
      id: k, from, to,
      distance: Math.ceil(eu) + randInt(rng, 0, 3),
      baseTime: randInt(rng, 0, 8),
      fuelCost: randInt(rng, 0, 6),
      difficulty: randInt(rng, 1, 5),
      obstacle: randInt(rng, 0, 5),
      status: r < (o.blockedProb ?? 0) ? "Blocked" : r < (o.blockedProb ?? 0) + (o.restrictedProb ?? 0) ? "Restricted" : "Open",
      isShortcut: false,
      directed: rng() < (o.directedProb ?? 0),
    });
  }
  return new Graph(vs, es);
}

/** Independent reference: Bellman-Ford over directed arcs, Blocked edges removed. */
function bellmanFord(g: Graph, src: number, w: (e: Edge) => number): Map<number, number> {
  const dist = new Map<number, number>(g.allVertices().map((v) => [v.id, Infinity]));
  dist.set(src, 0);
  const arcs: Array<[number, number, number]> = [];
  for (const e of g.allEdges()) {
    if (e.status === "Blocked") continue;
    arcs.push([e.from, e.to, w(e)]);
    if (!e.directed) arcs.push([e.to, e.from, w(e)]);
  }
  for (let i = 0; i < g.vertexCount; i++) {
    for (const [u, v, c] of arcs) {
      if (dist.get(u)! + c < dist.get(v)!) dist.set(v, dist.get(u)! + c);
    }
  }
  return dist;
}

/** A returned path must be a real, unblocked, direction-respecting walk whose edge costs sum to `cost`. */
function expectValidPath(g: Graph, res: { path: number[]; edges: number[]; cost: number }, s: number, t: number, w: (e: Edge) => number): void {
  expect(res.path[0]).toBe(s);
  expect(res.path[res.path.length - 1]).toBe(t);
  expect(res.edges.length).toBe(res.path.length - 1);
  let sum = 0;
  res.edges.forEach((id, i) => {
    const e = g.getEdge(id);
    expect(e.status).not.toBe("Blocked");
    const a = res.path[i]!;
    const b = res.path[i + 1]!;
    const forward = e.from === a && e.to === b;
    const backward = !e.directed && e.from === b && e.to === a;
    expect(forward || backward).toBe(true);
    sum += w(e);
  });
  expect(sum).toBeCloseTo(res.cost, 9);
}

const SEEDS = Array.from({ length: 300 }, (_, i) => 1000 + i);

// ------------------------------------------------------------------ §3.3 cost model

describe("PDF §3.3 — route cost and normalisation", () => {
  it("defines the four presets, all with non-negative weights", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["Balanced", "Economy", "Safety", "Speed"]);
    for (const w of Object.values(PRESETS)) {
      for (const x of Object.values(w)) expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("preset emphasis matches the PDF table (Speed: time, Economy: fuel, Safety: difficulty+obstacle)", () => {
    const { Balanced, Speed, Economy, Safety } = PRESETS;
    expect(Speed.wT).toBeGreaterThan(Balanced.wT);
    expect(Speed.wF).toBeLessThan(Balanced.wF);
    expect(Economy.wF).toBeGreaterThan(Balanced.wF);
    expect(Safety.wR).toBeGreaterThan(Balanced.wR);
    expect(Safety.wO).toBeGreaterThan(Balanced.wO);
  });

  it("cost is non-negative and monotone in every attribute", () => {
    const base: Edge = { id: 1, from: 0, to: 1, distance: 10, baseTime: 2, fuelCost: 3, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 1 };
    for (const w of Object.values(PRESETS)) {
      const c0 = edgeCost(base, w);
      expect(c0).toBeGreaterThanOrEqual(0);
      for (const bump of [{ distance: 20 }, { baseTime: 4 }, { fuelCost: 6 }, { difficulty: 4 }, { obstacle: 3 }] as Array<Partial<Edge>>) {
        expect(edgeCost({ ...base, ...bump }, w)).toBeGreaterThanOrEqual(c0);
      }
    }
  });

  it("a Restricted edge stays traversable but its effective cost is HIGHER than the same Open edge (PDF §3.1)", () => {
    const open: Edge = { id: 1, from: 0, to: 1, distance: 10, baseTime: 2, fuelCost: 3, difficulty: 2, status: "Open", isShortcut: false, directed: false, obstacle: 0 };
    const restricted: Edge = { ...open, status: "Restricted" };
    for (const w of Object.values(PRESETS)) {
      if (w.wT === 0) continue;
      expect(edgeCost(restricted, w)).toBeGreaterThan(edgeCost(open, w));
    }
    const g = new Graph([V(0), V(1)], [restricted]);
    expect(dijkstra(g, 0, 1, costFn(PRESETS.Balanced)).found).toBe(true); // still traversable
  });

  it("the cost shown to the player equals the cost the router optimised (leg costs sum to the plan cost)", () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const g = randomGraph(seed, { restrictedProb: 0.3 });
      const cost = costFn(PRESETS.Speed, REFS);
      const t = g.vertexCount - 1;
      const plan = planCheckpointRoute(g, 0, [], t, cost);
      if (!plan.found) continue;
      const recomputed = plan.edges.reduce((s, id) => s + cost(g.getEdge(id)), 0);
      expect(recomputed).toBeCloseTo(plan.cost, 9);
      expect(plan.legCosts.reduce((a, b) => a + b, 0)).toBeCloseTo(plan.cost, 9);
    }
  });
});

// ------------------------------------------------------------------ §5.1 BFS / DFS

describe("PDF §5.1 — BFS and DFS", () => {
  it("BFS returns the minimum edge count on 300 random mixed directed/undirected graphs (vs Bellman-Ford with unit weights)", () => {
    for (const seed of SEEDS) {
      const g = randomGraph(seed, { directedProb: 0.3, blockedProb: 0.15, selfLoops: true });
      const unit = () => 1;
      for (let s = 0; s < g.vertexCount; s++) {
        const ref = bellmanFord(g, s, unit);
        const all = bfs(g, s);
        for (let t = 0; t < g.vertexCount; t++) {
          const r = bfs(g, s, t);
          expect(r.found).toBe(Number.isFinite(ref.get(t)!));
          expect(all.reachable.has(t)).toBe(Number.isFinite(ref.get(t)!));
          if (r.found) {
            expect(r.edgeCount).toBe(ref.get(t));
            expect(r.path.length - 1).toBe(r.edgeCount);
          } else {
            expect(r.edgeCount).toBe(-1);
            expect(r.path).toEqual([]);
          }
        }
      }
    }
  });

  it("the PDF example: BFS picks the 1-edge road (len 10) over the 3-edge route (total 6)", () => {
    const g = new Graph([V(0), V(1), V(2), V(3)], [
      E(1, 0, 1, { distance: 10 }), E(2, 0, 2, { distance: 2 }), E(3, 2, 3, { distance: 2 }), E(4, 3, 1, { distance: 2 }),
    ]);
    expect(bfs(g, 0, 1).edgeCount).toBe(1);
    expect(dijkstra(g, 0, 1, (e) => e.distance).cost).toBe(6);
  });

  it("DFS cycle detection and component count match a union-find reference on undirected graphs", () => {
    for (const seed of SEEDS) {
      const g = randomGraph(seed, { blockedProb: 0.15, selfLoops: true });
      const parent = Array.from({ length: g.vertexCount }, (_, i) => i);
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
      let cycle = false;
      for (const e of g.allEdges()) {
        if (e.status === "Blocked") continue;
        const a = find(e.from);
        const b = find(e.to);
        if (a === b) cycle = true;
        else parent[a] = b;
      }
      const comps = new Set(parent.map((_, i) => find(i))).size;
      const r = dfs(g, 0);
      expect(r.hasCycle).toBe(cycle);
      expect(r.components.length).toBe(comps);
      expect(weaklyConnectedComponents(g).length).toBe(comps);
      expect(r.order.length).toBe(g.vertexCount); // whole forest is traversed
    }
  });

  it("DFS never overflows the stack on a very long road (30,000-vertex chain)", () => {
    const n = 30000;
    const vs = Array.from({ length: n }, (_, i) => V(i));
    const es = Array.from({ length: n - 1 }, (_, i) => E(i + 1, i, i + 1));
    const g = new Graph(vs, es);
    expect(() => dfs(g, 0)).not.toThrow();
    expect(dfs(g, 0).order.length).toBe(n);
  });

  it("single-vertex, disconnected and unreachable inputs terminate with a defined result", () => {
    const one = new Graph([V(0)], []);
    expect(bfs(one, 0, 0).found).toBe(true);
    expect(dfs(one, 0).hasCycle).toBe(false);
    const two = new Graph([V(0), V(1)], []);
    expect(bfs(two, 0, 1).found).toBe(false);
    expect(dijkstra(two, 0, 1, () => 1).found).toBe(false);
    expect(aStar(two, 0, 1, () => 1, () => 0).found).toBe(false);
  });

  it("simple-path enumeration is bounded (K12 would have ~10^8 simple paths) and returns only simple paths", () => {
    const n = 12;
    const vs = Array.from({ length: n }, (_, i) => V(i));
    const es: Edge[] = [];
    let id = 1;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) es.push(E(id++, a, b));
    const g = new Graph(vs, es);
    const t0 = Date.now();
    const paths = enumerateSimplePaths(g, 0, n - 1, { maxPaths: 100, maxLen: n });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(paths.length).toBe(100);
    for (const p of paths) expect(new Set(p).size).toBe(p.length);
    // a maxLen cap alone must also bound the work
    const capped = enumerateSimplePaths(g, 0, n - 1, { maxPaths: 1_000_000, maxLen: 3 });
    for (const p of capped) expect(p.length - 1).toBeLessThanOrEqual(3);
  });
});

// ------------------------------------------------------------------ §5.2 Dijkstra / A*

describe("PDF §5.2 — Dijkstra and A*", () => {
  const presets = Object.values(PRESETS);

  it("Dijkstra is optimal vs Bellman-Ford on 300 random graphs (blocked, restricted, directed, zero-weight edges)", () => {
    for (const seed of SEEDS) {
      const g = randomGraph(seed, { directedProb: 0.3, blockedProb: 0.15, restrictedProb: 0.15, selfLoops: true });
      const cost = costFn(presets[seed % presets.length]!, REFS);
      for (let s = 0; s < g.vertexCount; s++) {
        const ref = bellmanFord(g, s, cost);
        for (let t = 0; t < g.vertexCount; t++) {
          const r = dijkstra(g, s, t, cost);
          const want = ref.get(t)!;
          if (!Number.isFinite(want)) {
            expect(r.found).toBe(false);
          } else {
            expect(r.found).toBe(true);
            expect(r.cost).toBeCloseTo(want, 9);
            expectValidPath(g, r, s, t, cost);
          }
        }
      }
    }
  });

  it("A* with the weighted heuristic returns Dijkstra's optimal cost on 300 random graphs", () => {
    for (const seed of SEEDS) {
      const g = randomGraph(seed, { directedProb: 0.3, blockedProb: 0.1, restrictedProb: 0.15 });
      const cost = costFn(presets[(seed >> 1) % presets.length]!, REFS);
      const h = weightedHeuristic(g, cost);
      for (let s = 0; s < g.vertexCount; s++) {
        for (let t = 0; t < g.vertexCount; t++) {
          const d = dijkstra(g, s, t, cost);
          const a = aStar(g, s, t, cost, h);
          expect(a.found).toBe(d.found);
          if (d.found) {
            expect(a.cost).toBeCloseTo(d.cost, 9);
            expectValidPath(g, a, s, t, cost);
          }
        }
      }
    }
  });

  it("A* with the Euclidean heuristic is optimal for distance-only routing", () => {
    const dist = (e: Edge) => e.distance;
    for (const seed of SEEDS) {
      const g = randomGraph(seed, { blockedProb: 0.1 });
      const h = euclideanHeuristic(g);
      for (let s = 0; s < g.vertexCount; s++) {
        for (let t = 0; t < g.vertexCount; t++) {
          const d = dijkstra(g, s, t, dist);
          const a = aStar(g, s, t, dist, h);
          expect(a.found).toBe(d.found);
          if (d.found) expect(a.cost).toBeCloseTo(d.cost, 9);
        }
      }
    }
  });

  it("A* stays optimal even when some road is SHORTER than the straight line (heuristic precondition violated by data)", () => {
    // S(0,0) T(20,0) A(10,0). S-T direct = 20, S-A = 10, but A-T is only 4 long although A and T are
    // 10 apart, so Euclid(A,T)=10 over-estimates the true remaining cost 4. A naive Euclidean h makes
    // f(A)=10+10=20 tie with the direct road f(T)=20, and the tie goes to the worse route.
    const v = (id: number, x: number): Vertex => ({ id, x, y: 0, type: "Intersection", checkpointOrder: null, active: true });
    const road = (id: number, from: number, to: number, distance: number): Edge => ({ id, from, to, distance, baseTime: 1, fuelCost: 1, difficulty: 1, status: "Open", isShortcut: false, directed: false });
    const g = new Graph([v(0, 0), v(1, 20), v(2, 10)], [road(1, 0, 1, 20), road(2, 0, 2, 10), road(3, 2, 1, 4)]);
    const dist = (e: Edge) => e.distance;
    expect(dijkstra(g, 0, 1, dist).cost).toBe(14);
    expect(aStar(g, 0, 1, dist, euclideanHeuristic(g)).cost).toBe(14);
    expect(aStar(g, 0, 1, dist, weightedHeuristic(g, dist)).cost).toBe(14);
  });

  it("source == target costs 0; equal-cost paths are deterministic; zero-weight edges terminate", () => {
    const g = new Graph([V(0), V(1), V(2), V(3)], [E(1, 0, 1), E(2, 1, 3), E(3, 0, 2), E(4, 2, 3)]); // two equal-cost routes
    const unit = () => 1;
    expect(dijkstra(g, 2, 2, unit)).toMatchObject({ found: true, cost: 0, path: [2], edges: [] });
    expect(aStar(g, 2, 2, unit, () => 0)).toMatchObject({ found: true, cost: 0 });
    const r1 = dijkstra(g, 0, 3, unit);
    const r2 = dijkstra(g, 0, 3, unit);
    expect(r1.path).toEqual(r2.path);
    expect(r1.cost).toBe(2);
    const zero = dijkstra(g, 0, 3, () => 0);
    expect(zero.found).toBe(true);
    expect(zero.cost).toBe(0);
  });

  it("handles a 5,000-vertex route and an immediate recalculation after a closure", () => {
    const n = 5000;
    const vs = Array.from({ length: n }, (_, i) => V(i));
    const es = Array.from({ length: n - 1 }, (_, i) => E(i + 1, i, i + 1));
    es.push(E(n, 0, n - 1, { distance: 1e6 })); // long detour road
    const g = new Graph(vs, es);
    const c = (e: Edge) => e.distance;
    const before = dijkstra(g, 0, n - 1, c);
    expect(before.cost).toBe(n - 1);
    g.setEdgeStatus(2500, "Blocked"); // cut the chain mid-way
    const after = dijkstra(g, 0, n - 1, c);
    expect(after.found).toBe(true);
    expect(after.cost).toBe(1e6);
    g.setEdgeStatus(n, "Blocked");
    expect(dijkstra(g, 0, n - 1, c).found).toBe(false);
  });

  it("records the Experiment-2 counters (expanded vertices, relaxed edges, heap ops)", () => {
    const g = randomGraph(42);
    const t = countingTrace();
    dijkstra(g, 0, g.vertexCount - 1, costFn(PRESETS.Balanced, REFS), t);
    expect(t.counters.visitedVertices).toBeGreaterThan(0);
    expect(t.counters.heapPushes).toBeGreaterThan(0);
    expect(t.counters.heapPops).toBeGreaterThan(0);
    expect(t.counters.heapPops).toBeLessThanOrEqual(t.counters.heapPushes);
  });

  it("checkpoint routing never skips a mandatory checkpoint and keeps their order", () => {
    // direct S-F road is far cheaper than going through the checkpoints
    const g = new Graph(
      [V(0, { type: "Start" }), V(1, { type: "Checkpoint", checkpointOrder: 1 }), V(2, { type: "Checkpoint", checkpointOrder: 2 }), V(3, { type: "Finish" })],
      [E(1, 0, 3, { distance: 1 }), E(2, 0, 2, { distance: 50 }), E(3, 2, 1, { distance: 50 }), E(4, 1, 3, { distance: 50 })],
    );
    const plan = planCheckpointRoute(g, 0, [1, 2], 3, (e) => e.distance);
    expect(plan.found).toBe(true);
    const i1 = plan.path.indexOf(1);
    const i2 = plan.path.indexOf(2, i1);
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(plan.path[plan.path.length - 1]).toBe(3);
    // a blocked checkpoint leg => no route (never "skips")
    g.setEdgeStatus(4, "Blocked");
    g.setEdgeStatus(3, "Blocked");
    expect(planCheckpointRoute(g, 0, [1, 2], 3, (e) => e.distance).found).toBe(false);
  });
});

// ------------------------------------------------------------------ §5.3 DP / greedy

describe("PDF §5.3 — 0/1 knapsack, greedy and the refuelling DP", () => {
  function items(seed: number): { items: Item[]; budget: number } {
    const rng = makeRng(seed);
    const m = randInt(rng, 0, 9);
    return {
      items: Array.from({ length: m }, (_, i) => ({ id: i + 1, cost: randInt(rng, 0, 6), benefit: randInt(rng, 0, 9) })),
      budget: randInt(rng, 0, 15),
    };
  }
  function brute(its: Item[], B: number): number {
    let best = 0;
    for (let mask = 0; mask < 1 << its.length; mask++) {
      let c = 0;
      let v = 0;
      for (let i = 0; i < its.length; i++) if (mask & (1 << i)) { c += its[i]!.cost; v += its[i]!.benefit; }
      if (c <= B && v > best) best = v;
    }
    return best;
  }

  it("DP equals exhaustive search on 500 random small instances (incl. zero-cost and zero-benefit items)", () => {
    for (let seed = 0; seed < 500; seed++) {
      const { items: its, budget } = items(seed);
      const want = brute(its, budget);
      const dp = knapsack01(its, budget);
      expect(dp.value).toBe(want);
      expect(knapsack01Value(its, budget)).toBe(want);
      // reconstruction is feasible, unique and consistent
      const chosen = dp.selected.map((id) => its.find((x) => x.id === id)!);
      expect(new Set(dp.selected).size).toBe(dp.selected.length);
      expect(chosen.reduce((s, x) => s + x.cost, 0)).toBeLessThanOrEqual(budget);
      expect(chosen.reduce((s, x) => s + x.benefit, 0)).toBe(dp.value);
    }
  });

  it("greedy is always feasible and never beats the DP", () => {
    for (let seed = 0; seed < 500; seed++) {
      const { items: its, budget } = items(seed);
      const g = greedyKnapsack(its, budget);
      const chosen = g.selected.map((id) => its.find((x) => x.id === id)!);
      expect(chosen.reduce((s, x) => s + x.cost, 0)).toBeLessThanOrEqual(budget);
      expect(chosen.reduce((s, x) => s + x.benefit, 0)).toBe(g.value);
      expect(g.value).toBeLessThanOrEqual(knapsack01(its, budget).value);
    }
  });

  it("the PDF example: budget 10, greedy = 30 (item A) but DP = 48 (items B+C)", () => {
    const its: Item[] = [{ id: 1, cost: 6, benefit: 30 }, { id: 2, cost: 5, benefit: 24 }, { id: 3, cost: 5, benefit: 24 }];
    const g = greedyKnapsack(its, 10);
    const dp = knapsack01(its, 10);
    expect(g.value).toBe(30);
    expect(g.selected).toEqual([1]);
    expect(dp.value).toBe(48);
    expect(dp.selected).toEqual([2, 3]);
  });

  it("finds at least two further instances where greedy is strictly worse than DP", () => {
    let worse = 0;
    for (let seed = 0; seed < 500; seed++) {
      const { items: its, budget } = items(seed);
      if (greedyKnapsack(its, budget).value < knapsack01(its, budget).value) worse++;
    }
    expect(worse).toBeGreaterThanOrEqual(2);
  });

  it("greedy: zero-cost positive-benefit items are taken first; zero/zero items are ignored; ties go to the lower id", () => {
    const g = greedyKnapsack([{ id: 5, cost: 0, benefit: 4 }, { id: 2, cost: 0, benefit: 0 }, { id: 9, cost: 3, benefit: 6 }, { id: 7, cost: 3, benefit: 6 }], 3);
    expect(g.selected).toEqual([5, 7]);
    expect(g.value).toBe(10);
  });

  function refuelInstance(seed: number) {
    const rng = makeRng(seed);
    const m = randInt(rng, 1, 4);
    const C = randInt(rng, 6, 12);
    return {
      legFuel: Array.from({ length: m }, () => randInt(rng, 1, 10)),
      capacity: C,
      startFuel: randInt(rng, 0, C),
      stations: Array.from({ length: m }, () => rng() < 0.6),
      maxPurchase: randInt(rng, 1, 6),
      stopTime: randInt(rng, 1, 3),
    };
  }
  function bruteRefuel(p: ReturnType<typeof refuelInstance>): number {
    const go = (j: number, f: number): number => {
      if (j === p.legFuel.length) return 0;
      let best = Infinity;
      const maxA = p.stations[j] ? Math.min(p.capacity - f, p.maxPurchase) : 0;
      for (let a = 0; a <= maxA; a++) {
        if (f + a < p.legFuel[j]!) continue;
        best = Math.min(best, (a > 0 ? p.stopTime : 0) + go(j + 1, f + a - p.legFuel[j]!));
      }
      return best;
    };
    return go(0, p.startFuel);
  }

  it("refuelling DP equals exhaustive search on 400 random instances, and its plan is physically feasible", () => {
    for (let seed = 0; seed < 400; seed++) {
      const p = refuelInstance(seed);
      const want = bruteRefuel(p);
      const r = refuelDP(p);
      expect(r.feasible).toBe(Number.isFinite(want));
      if (!r.feasible) continue;
      expect(r.minStopTime).toBe(want);
      // replay the plan: capacity, per-stop cap, availability and non-negative fuel all hold
      let f = p.startFuel;
      let time = 0;
      p.legFuel.forEach((d, j) => {
        const a = r.purchases[j]!;
        if (a > 0) {
          expect(p.stations[j]).toBe(true);
          expect(a).toBeLessThanOrEqual(p.maxPurchase);
          expect(f + a).toBeLessThanOrEqual(p.capacity);
          time += p.stopTime;
        }
        f += a - d;
        expect(f).toBeGreaterThanOrEqual(0);
      });
      expect(time).toBe(want);
    }
  });

  it("refuelling: full tank needs no stop; a leg larger than the tank is infeasible; no station => infeasible", () => {
    expect(refuelDP({ legFuel: [5, 5], capacity: 20, startFuel: 20, stations: [true, true], stopTime: 3 })).toMatchObject({ feasible: true, minStopTime: 0 });
    expect(refuelDP({ legFuel: [30], capacity: 20, startFuel: 20, stations: [true] }).feasible).toBe(false);
    expect(refuelDP({ legFuel: [15, 15], capacity: 20, startFuel: 20, stations: [false, false] }).feasible).toBe(false);
    expect(refuelDP({ legFuel: [], capacity: 20, startFuel: 0, stations: [] }).feasible).toBe(true);
  });

  it("the 40-unit PDF cap is the default max purchase (400 tenths)", () => {
    // 90 units to the station leaves 10; the next leg needs 60 => must buy 50, but one stop sells at most 40
    const capped = refuelDP({ legFuel: [900, 600], capacity: 1000, startFuel: 1000, stations: [false, true], stopTime: 3 });
    expect(capped.feasible).toBe(false);
    // the same trip with the cap lifted proves it is the cap (not capacity) that makes it infeasible
    const lifted = refuelDP({ legFuel: [900, 600], capacity: 1000, startFuel: 1000, stations: [false, true], stopTime: 3, maxPurchase: 1000 });
    expect(lifted.feasible).toBe(true);
    expect(lifted.purchases[1]).toBe(500);
    // buying exactly the cap is allowed
    const exact = refuelDP({ legFuel: [900, 500], capacity: 1000, startFuel: 1000, stations: [false, true], stopTime: 3 });
    expect(exact.feasible).toBe(true);
    expect(exact.purchases[1]).toBe(400);
  });
});

describe("fuel-stop DP with station detours (engine's planner, PDF §5.3 Problem B generalised)", () => {
  function inst(seed: number) {
    const rng = makeRng(seed);
    const P = randInt(rng, 1, 5);
    const positions: RoutePosition[] = Array.from({ length: P }, (_, i) => ({
      legFuel: i === P - 1 ? 0 : randInt(rng, 1, 6),
      legTime: i === P - 1 ? 0 : randInt(rng, 1, 4),
      detour: rng() < 0.6 ? { goFuel: randInt(rng, 0, 3), backFuel: randInt(rng, 0, 3), time: randInt(rng, 0, 3) } : null,
    }));
    return { positions, capacity: randInt(rng, 5, 10), startFuel: randInt(rng, 0, 10), maxPurchase: randInt(rng, 1, 6), stopTime: randInt(rng, 1, 3) };
  }
  function brute(p: ReturnType<typeof inst>): number {
    const go = (i: number, f: number): number => {
      if (f < 0 || f > p.capacity) return Infinity;
      const pos = p.positions[i]!;
      const drive = (fuel: number): number => (i === p.positions.length - 1 ? 0 : fuel >= pos.legFuel ? pos.legTime + go(i + 1, fuel - pos.legFuel) : Infinity);
      let best = drive(f);
      const d = pos.detour;
      if (d && f >= d.goFuel) {
        const base = f - d.goFuel;
        for (let a = 1; a <= Math.min(p.maxPurchase, p.capacity - base); a++) {
          if (base + a < d.backFuel) continue;
          best = Math.min(best, d.time + p.stopTime + drive(base + a - d.backFuel));
        }
      }
      return best;
    };
    return go(0, Math.min(p.startFuel, p.capacity));
  }
  it("matches exhaustive search on 400 random instances and the plan is physically replayable", () => {
    for (let seed = 0; seed < 400; seed++) {
      const p = inst(seed);
      const want = brute(p);
      const r = planFuelStops(p);
      expect(r.feasible).toBe(Number.isFinite(want));
      if (!r.feasible) continue;
      expect(r.totalTime).toBe(want);
      let f = Math.min(p.startFuel, p.capacity);
      let t = 0;
      p.positions.forEach((pos, i) => {
        const stop = r.stops.find((x) => x.position === i);
        if (stop) {
          const d = pos.detour!;
          expect(f).toBeGreaterThanOrEqual(d.goFuel);
          expect(stop.buy).toBeGreaterThan(0);
          expect(stop.buy).toBeLessThanOrEqual(p.maxPurchase);
          const atStation = f - d.goFuel;
          expect(atStation + stop.buy).toBeLessThanOrEqual(p.capacity);
          f = atStation + stop.buy - d.backFuel;
          expect(f).toBeGreaterThanOrEqual(0);
          t += d.time + p.stopTime;
        }
        if (i < p.positions.length - 1) {
          expect(f).toBeGreaterThanOrEqual(pos.legFuel);
          f -= pos.legFuel;
          t += pos.legTime;
        }
      });
      expect(t).toBe(want);
    }
  });
});

// ------------------------------------------------------------------ §4.6 / §5.5 sorting

describe("PDF §4.6 + §5.5 — championship comparator, sorting and top-k", () => {
  function entries(seed: number): ChampionshipEntry[] {
    const rng = makeRng(seed);
    const n = randInt(rng, 0, 40);
    const ids = shuffle(rng, Array.from({ length: n }, (_, i) => i + 1));
    return ids.map((racerId) => ({
      racerId,
      totalPoints: randInt(rng, 0, 3) * 5,
      wins: randInt(rng, 0, 2),
      sumOfFinishPositions: randInt(rng, 1, 4),
      bestFastestLap: [10, 20, 30, Infinity][randInt(rng, 0, 3)]!,
    }));
  }
  const ref = (xs: ChampionshipEntry[]) => [...xs].sort(compareChampionship);

  it("the points table is the full PDF table for 10 racers and 0 beyond", () => {
    expect([...POINTS]).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0].map(awardPoints)).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0]);
  });

  it("tie-break precedence is points > wins > sum of positions > best lap > racer id", () => {
    const base: ChampionshipEntry = { racerId: 5, totalPoints: 10, wins: 1, sumOfFinishPositions: 4, bestFastestLap: 20 };
    const better = (patch: Partial<ChampionshipEntry>) => compareChampionship({ ...base, racerId: 9, ...patch }, base) < 0;
    expect(better({ totalPoints: 11 })).toBe(true);
    expect(better({ wins: 2 })).toBe(true);
    expect(better({ sumOfFinishPositions: 3 })).toBe(true);
    expect(better({ bestFastestLap: 19 })).toBe(true);
    expect(compareChampionship({ ...base, racerId: 4 }, base)).toBeLessThan(0); // only the id differs
    // a higher rule overrides every lower rule
    expect(better({ totalPoints: 11, wins: 0, sumOfFinishPositions: 99, bestFastestLap: 999 })).toBe(true);
    expect(compareChampionship({ ...base, racerId: 1, totalPoints: 9 }, base)).toBeGreaterThan(0);
  });

  it("the comparator is a strict total order (antisymmetric, transitive, zero only for the same racer)", () => {
    const xs = entries(7).concat(entries(8).map((e) => ({ ...e, racerId: e.racerId + 100 })));
    for (const a of xs) {
      for (const b of xs) {
        const ab = Math.sign(compareChampionship(a, b));
        expect(ab).toBe(-Math.sign(compareChampionship(b, a)) || 0);
        if (a.racerId !== b.racerId) expect(ab).not.toBe(0);
      }
    }
    const s = xs.slice(0, 18);
    for (const a of s) for (const b of s) for (const c of s) {
      if (compareChampionship(a, b) <= 0 && compareChampionship(b, c) <= 0) expect(compareChampionship(a, c)).toBeLessThanOrEqual(0);
    }
  });

  it("Merge, Quick and Heap sort agree exactly with each other and with Array.sort on 400 random inputs (duplicate-heavy)", () => {
    for (let seed = 0; seed < 400; seed++) {
      const xs = entries(seed);
      const snapshot = JSON.stringify(xs);
      const want = ref(xs);
      expect(mergeSort(xs, compareChampionship)).toEqual(want);
      expect(quickSort(xs, compareChampionship)).toEqual(want);
      expect(heapSort(xs, compareChampionship)).toEqual(want);
      expect(JSON.stringify(xs)).toBe(snapshot); // input untouched
    }
  });

  it("top-k equals the first k of the full sort for every k (0, 1, mid, n-1, n, >n)", () => {
    for (let seed = 0; seed < 300; seed++) {
      const xs = entries(seed);
      const want = ref(xs);
      for (const k of [0, 1, 2, Math.floor(xs.length / 2), xs.length - 1, xs.length, xs.length + 5]) {
        if (k < 0) continue;
        expect(topK(xs, k, compareChampionship)).toEqual(want.slice(0, Math.max(0, k)));
      }
    }
  });

  it("sorted, reverse-sorted, all-equal and single-element inputs", () => {
    const base = entries(3).filter((_, i) => i < 25);
    const asc = ref(base);
    const desc = [...asc].reverse();
    for (const input of [asc, desc, [], base.slice(0, 1)]) {
      const want = ref(input);
      expect(mergeSort(input, compareChampionship)).toEqual(want);
      expect(quickSort(input, compareChampionship)).toEqual(want);
      expect(heapSort(input, compareChampionship)).toEqual(want);
    }
    const dup = Array.from({ length: 50 }, (_, i) => i);
    expect(quickSort(dup, () => 0)).toHaveLength(50); // all-equal terminates (3-way partition)
    expect(heapSort(dup, () => 0)).toHaveLength(50);
  });

  it("Merge Sort is stable (PDF: 'stable'); Quick Sort stays correct on a 50,000-element sorted input", () => {
    const tagged = Array.from({ length: 200 }, (_, i) => ({ k: i % 5, tag: i }));
    const out = mergeSort(tagged, (a, b) => a.k - b.k);
    for (let i = 1; i < out.length; i++) {
      if (out[i]!.k === out[i - 1]!.k) expect(out[i]!.tag).toBeGreaterThan(out[i - 1]!.tag);
    }
    const big = Array.from({ length: 50000 }, (_, i) => i);
    expect(() => quickSort(big, (a, b) => a - b)).not.toThrow();
    expect(quickSort(big, (a, b) => b - a)[0]).toBe(49999);
  });

  it("a final racer-ID tie-break case: two racers identical in every other field", () => {
    const rows = (id: number, pos: number) => ({ raceId: 0, racerId: id, finishPosition: pos, finishTime: 10, fastestLap: 5, bonusPoints: 0, pointsAwarded: 0 });
    // race 1: id 7 wins, id 3 second; race 2: id 3 wins, id 7 second -> equal points, wins, sum, lap
    const standings = buildStandings([[rows(7, 1), rows(3, 2)], [rows(3, 1), rows(7, 2)]]);
    expect(standings.map((s) => s.racerId)).toEqual([3, 7]);
    expect(standings[0]!.totalPoints).toBe(standings[1]!.totalPoints);
  });
});

// ------------------------------------------------------------------ §5.4 MST

describe("PDF §5.4 — Kruskal MST", () => {
  it("MST weight equals an independent Prim implementation on random connected graphs; forest when disconnected", () => {
    for (const seed of SEEDS) {
      const g = randomGraph(seed);
      const mst = kruskalMST(g);
      const n = g.vertexCount;
      // reference Prim per component (O(V^2))
      const inTree = new Set<number>();
      let ref = 0;
      let treeEdges = 0;
      for (const root of g.allVertices().map((v) => v.id)) {
        if (inTree.has(root)) continue;
        inTree.add(root);
        for (;;) {
          let best: { w: number; to: number } | null = null;
          for (const e of g.allEdges()) {
            if (e.status === "Blocked") continue;
            const a = inTree.has(e.from);
            const b = inTree.has(e.to);
            if (a === b) continue;
            if (!best || e.distance < best.w) best = { w: e.distance, to: a ? e.to : e.from };
          }
          if (!best) break;
          inTree.add(best.to);
          ref += best.w;
          treeEdges++;
        }
      }
      expect(mstWeight(mst)).toBe(ref);
      expect(mst.length).toBe(treeEdges);
      expect(mst.length).toBeLessThanOrEqual(Math.max(0, n - 1));
    }
  });

  it("an MST is acyclic and spans every component", () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const g = randomGraph(seed);
      const mst = kruskalMST(g);
      const sub = new Graph(g.allVertices().map((v) => ({ ...v })), mst.map((e) => ({ ...e })));
      expect(dfs(sub, 0).hasCycle).toBe(false);
      expect(weaklyConnectedComponents(sub).length).toBe(weaklyConnectedComponents(g).length);
    }
  });
});

// ------------------------------------------------------------------ §4.5 event heap

describe("PDF §4.5 — event priority queue", () => {
  it("fires in exact (triggerTime, priority, insertionSequence) order on 300 random, tie-heavy schedules", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = makeRng(seed);
      const n = randInt(rng, 0, 40);
      const s = new EventScheduler();
      const made = Array.from({ length: n }, (_, i) =>
        s.schedule({ eventId: i + 1, type: "RoadBlockage", triggerTime: randInt(rng, 0, 3), priority: randInt(rng, 1, 6), targetEdgeOrVertex: 1, duration: 0 }),
      );
      const cancelled = new Set<number>();
      for (const e of made) if (rng() < 0.25) { s.cancel(e.eventId); cancelled.add(e.eventId); }
      const want = made
        .filter((e) => !cancelled.has(e.eventId))
        .sort((a, b) => a.triggerTime - b.triggerTime || a.priority - b.priority || a.insertionSequence - b.insertionSequence)
        .map((e) => e.eventId);
      expect(s.popDue(Infinity).map((e) => e.eventId)).toEqual(want);
      expect(s.isEmpty()).toBe(true);
    }
  });

  it("popDue only releases events whose time has arrived and cancelling twice / unknown ids is safe", () => {
    const s = new EventScheduler();
    s.schedule({ eventId: 1, type: "OilSpill", triggerTime: 5, priority: 3, targetEdgeOrVertex: 1, duration: 20 });
    s.schedule({ eventId: 2, type: "OilSpill", triggerTime: 1, priority: 3, targetEdgeOrVertex: 1, duration: 20 });
    expect(s.popDue(0.5)).toEqual([]);
    expect(s.popDue(2).map((e) => e.eventId)).toEqual([2]);
    expect(s.cancel(1)).toBe(true);
    expect(s.cancel(1)).toBe(false);
    expect(s.cancel(999)).toBe(false);
    expect(s.popDue(100)).toEqual([]);
  });
});
