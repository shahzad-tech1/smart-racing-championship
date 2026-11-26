/**
 * Algorithm Lab catalogue. Every entry runs the REAL implementation from src/algorithms with a
 * recording trace (or a counting trace where the algorithm records no steps) and exposes the steps
 * for playback. The Lab never declares an algorithm of its own.
 */
import { bfs } from '../../algorithms/bfs.ts';
import { dfs } from '../../algorithms/dfs.ts';
import { dijkstra } from '../../algorithms/dijkstra.ts';
import { aStar, weightedHeuristic } from '../../algorithms/astar.ts';
import { kruskalMST, mstWeight } from '../../algorithms/mst.ts';
import { mergeSort, quickSort, heapSort, topK } from '../../algorithms/sort.ts';
import { knapsack01, type Item } from '../../algorithms/knapsack.ts';
import { greedyKnapsack } from '../../algorithms/greedy.ts';
import { refuelDP } from '../../algorithms/refuel.ts';
import { placeObstacles } from '../../algorithms/generate.ts';
import { planCheckpointRoute } from '../../algorithms/route.ts';
import { recordingTrace, type AlgoStep, type Counters } from '../../core/instrumentation.ts';
import { costFn, PRESETS, REFS } from '../../core/cost.ts';
import { makeRng } from '../../core/rng.ts';
import type { Graph } from '../../core/Graph.ts';
import type { CircuitMeta } from '../../data/circuits/meta.ts';
import { EventScheduler } from '../../engine/EventScheduler.ts';
import { RULES, fuelForEdge } from '../../engine/rules.ts';
import { buildRaceEvents } from '../../data/raceEvents.ts';

export type Kind = 'graph' | 'array' | 'dp' | 'backtrack' | 'refuel';
export type Group = 'Graph search' | 'Shortest path' | 'Spanning tree' | 'Sorting' | 'Dynamic programming & greedy' | 'Backtracking' | 'Priority queues';

export interface AlgoDef {
  id: string;
  name: string;
  group: Group;
  kind: Kind;
  time: string;
  space: string;
  blurb: string;
  /** True when the data shown is an illustrative sample rather than race data. */
  sample: boolean;
}

export const ALGOS: AlgoDef[] = [
  { id: 'bfs', name: 'Breadth-first search', group: 'Graph search', kind: 'graph', time: 'O(V+E)', space: 'O(V)', blurb: 'Explores the track layer by layer; finds the route with the fewest roads, not the cheapest.', sample: false },
  { id: 'dfs', name: 'Depth-first search', group: 'Graph search', kind: 'graph', time: 'O(V+E)', space: 'O(V)', blurb: 'Dives down one branch before backing up; used for cycles, components and dead ends.', sample: false },
  { id: 'dijkstra', name: 'Dijkstra', group: 'Shortest path', kind: 'graph', time: 'O((V+E) log V)', space: 'O(V)', blurb: 'Always expands the cheapest unsettled vertex from a min-heap. Optimal for non-negative costs.', sample: false },
  { id: 'astar', name: 'A*', group: 'Shortest path', kind: 'graph', time: 'O(E) typical, O(b^d) worst', space: 'O(V)', blurb: 'Dijkstra steered toward the goal by an admissible heuristic: same optimal cost, fewer expansions.', sample: false },
  { id: 'kruskal', name: 'Kruskal MST', group: 'Spanning tree', kind: 'graph', time: 'O(E log E)', space: 'O(V)', blurb: 'Sorts roads by length and keeps each one that joins two separate components (union-find).', sample: false },
  { id: 'merge', name: 'Merge sort', group: 'Sorting', kind: 'array', time: 'O(n log n)', space: 'O(n)', blurb: 'Sorts this circuit’s road lengths. Stable, so equal values keep their order.', sample: false },
  { id: 'quick', name: 'Quick sort', group: 'Sorting', kind: 'array', time: 'O(n log n) avg · O(n²) worst', space: 'O(log n)', blurb: 'Sorts this circuit’s road lengths by partitioning around a pivot.', sample: false },
  { id: 'heap', name: 'Heap sort', group: 'Sorting', kind: 'array', time: 'O(n log n)', space: 'O(1)', blurb: 'Sorts this circuit’s road lengths with an in-place max-heap.', sample: false },
  { id: 'knapsack', name: '0/1 Knapsack (DP)', group: 'Dynamic programming & greedy', kind: 'dp', time: 'O(m·B)', space: 'O(m·B)', blurb: 'Chooses which of the circuit’s shortcuts and pickups to take within a fuel budget — the best-value set.', sample: false },
  { id: 'greedy', name: 'Greedy knapsack', group: 'Dynamic programming & greedy', kind: 'dp', time: 'O(m log m)', space: 'O(m)', blurb: 'Picks the same circuit options by benefit/cost ratio — fast, but can miss the DP optimum.', sample: false },
  { id: 'refuel', name: 'Refuel planner (DP)', group: 'Dynamic programming & greedy', kind: 'refuel', time: 'O(m·C·P)', space: 'O(m·C)', blurb: 'Plans fuel buys along this circuit’s checkpoint route to finish with the fewest stop-seconds.', sample: false },
  { id: 'backtrack', name: 'Backtracking: obstacles', group: 'Backtracking', kind: 'backtrack', time: 'O(n!) worst, pruned', space: 'O(k)', blurb: 'Places obstacles on this circuit’s ring roads so none are adjacent; backtracks on a dead-end.', sample: false },
  { id: 'events', name: 'Event priority queue (min-heap)', group: 'Priority queues', kind: 'array', time: 'O(log n) per op', space: 'O(n)', blurb: 'Schedules this race’s events in a min-heap and fires them in (time, priority, sequence) order.', sample: false },
  { id: 'topk', name: 'Top-K (size-k heap)', group: 'Priority queues', kind: 'array', time: 'O(n log k)', space: 'O(k)', blurb: 'Keeps the K shortest roads with a size-k heap — the same retrieval that builds the podium top-3.', sample: false },
];

export interface Run {
  steps: AlgoStep[];
  counters: Counters;
  summary: string;
  /** One-line text for the step log. */
  log(s: AlgoStep, i: number): string;
  /** Final answer shown once playback completes. */
  result: string;
  // graph kinds
  path?: number[];
  pathEdges?: number[];
  // array / dp / backtrack data for the canvas panels
  data?: Record<string, unknown>;
}

export function edgesOfPath(g: Graph, path: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const hops = g.neighbors(path[i]!, { ignoreBlocked: true }).filter((n) => n.to === path[i + 1]);
    if (hops.length) out.push(hops.reduce((a, b) => (b.edge.distance < a.edge.distance ? b : a)).edge.id);
  }
  return out;
}

export function sampleNumbers(n: number, seed: number): number[] {
  const r = makeRng(seed);
  return Array.from({ length: n }, () => 8 + Math.floor(r() * 92));
}

export function sampleItems(seed: number): { items: Item[]; budget: number } {
  const r = makeRng(seed);
  const items: Item[] = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, cost: 2 + Math.floor(r() * 7), benefit: 5 + Math.floor(r() * 30) }));
  return { items, budget: 16 };
}

/** The current circuit's road lengths, scaled to [8,98] for the array panels. */
export function trackValues(graph: Graph): number[] {
  const d = graph.allEdges().map((e) => e.distance);
  const lo = Math.min(...d);
  const hi = Math.max(...d);
  const span = hi - lo || 1;
  return d.map((x) => 8 + Math.round(((x - lo) / span) * 90));
}

/** Optional on-track choices (shortcuts + nitro pickups) modelled as 0/1 knapsack items. */
function trackItems(graph: Graph): { items: Item[]; budget: number } {
  const items: Item[] = [];
  let id = 1;
  for (const e of graph.allEdges()) {
    if (!e.isShortcut) continue;
    items.push({ id: id++, cost: Math.min(40, Math.max(1, Math.round(fuelForEdge(e) / 10))), benefit: Math.max(1, Math.round(e.distance / 8)) });
  }
  for (const v of graph.allVertices()) {
    if (v.type !== 'NitroPickup') continue;
    const spur = graph.neighbors(v.id, { ignoreBlocked: true })[0];
    const cost = spur ? Math.min(40, Math.max(1, Math.round(fuelForEdge(spur.edge) / 10))) : 4;
    items.push({ id: id++, cost, benefit: 12 }); // a nitro charge
  }
  if (items.length === 0) items.push({ id: 1, cost: 3, benefit: 10 }); // never empty
  const total = items.reduce((s, it) => s + it.cost, 0);
  const maxItem = items.reduce((m, it) => Math.max(m, it.cost), 1);
  return { items, budget: Math.max(maxItem, Math.round(total * 0.55)) };
}

/** Fuel needed on each road of the circuit's checkpoint route, and which arrivals are at stations. */
function trackRefuel(graph: Graph, meta: CircuitMeta): {
  legFuel: number[]; stations: boolean[]; capacity: number; startFuel: number; maxPurchase: number; stopTime: number;
} {
  const plan = planCheckpointRoute(graph, meta.startVertex, [...meta.checkpointOrder], meta.finishVertex, costFn(PRESETS.Balanced, REFS));
  const edges = plan.found && plan.edges.length ? plan.edges : graph.allEdges().slice(0, 6).map((e) => e.id);
  const path = plan.found ? plan.path : [];
  const legFuel = edges.map((eid) => fuelForEdge(graph.getEdge(eid)));
  const stations = edges.map((_eid, i) => {
    const vid = path[i];
    return vid !== undefined && graph.getVertex(vid).type === 'FuelStation';
  });
  return {
    legFuel, stations,
    capacity: RULES.MAX_FUEL_TENTHS, startFuel: RULES.MAX_FUEL_TENTHS,
    maxPurchase: RULES.FUEL_STATION_MAX_PURCHASE_TENTHS, stopTime: RULES.FUEL_STATION_STOP_TIME,
  };
}

function describe(s: AlgoStep): string {
  switch (s.kind) {
    case 'visit': return `visit vertex ${s.vertex}`;
    case 'enqueue': return `queue vertex ${s.vertex}`;
    case 'relax': return `${s.improved ? 'relax' : 'skip'} road ${s.edge}${s.g !== undefined ? ` → g=${s.g.toFixed(2)}` : ''}`;
    case 'frontier': return `frontier: ${s.vertices.join(', ')}`;
    case 'pathFound': return `path found, cost ${s.cost.toFixed(3)}`;
    case 'compare': return `compare [${s.i}] and [${s.j}]`;
    case 'swap': return `swap [${s.i}] and [${s.j}]`;
    case 'dpCell': return `dp[${s.i}][${s.b}] = ${s.value}`;
    case 'write': return `write ${String(s.item)} → [${s.index}]`;
    case 'place': return `place obstacle at road ${s.index}`;
    case 'unplace': return `undo obstacle at road ${s.index}`;
    case 'prune': return `prune road ${s.index} (adjacent)`;
    default: return 'step';
  }
}

export function runAlgo(id: string, graph: Graph, meta: CircuitMeta, seed: number): Run {
  const trace = recordingTrace();
  const cost = costFn(PRESETS.Balanced, REFS);
  const s = meta.startVertex;
  const f = meta.finishVertex;
  const base = (extra: Partial<Run>): Run => ({
    steps: trace.steps ?? [],
    counters: trace.counters,
    summary: '',
    result: '',
    log: (st) => describe(st),
    ...extra,
  });

  switch (id) {
    case 'bfs': {
      const r = bfs(graph, s, f, trace);
      return base({ path: r.path, pathEdges: edgesOfPath(graph, r.path), summary: `Reached ${r.reachable.size} vertices`, result: r.found ? `${r.edgeCount} roads: ${r.path.join(' → ')}` : 'goal unreachable' });
    }
    case 'dfs': {
      const r = dfs(graph, s, trace);
      return base({ summary: `${r.components.length} component(s)`, result: `${r.hasCycle ? 'Cycle found' : 'No cycle'} · visited ${r.order.length} vertices` });
    }
    case 'dijkstra': {
      const r = dijkstra(graph, s, f, cost, trace);
      return base({ path: r.path, pathEdges: r.edges, summary: `cost ${r.cost.toFixed(3)}`, result: r.found ? `cost ${r.cost.toFixed(3)}: ${r.path.join(' → ')}` : 'no route' });
    }
    case 'astar': {
      const r = aStar(graph, s, f, cost, weightedHeuristic(graph, cost), trace);
      return base({ path: r.path, pathEdges: r.edges, summary: `cost ${r.cost.toFixed(3)}`, result: r.found ? `cost ${r.cost.toFixed(3)}: ${r.path.join(' → ')}` : 'no route' });
    }
    case 'kruskal': {
      const edges = kruskalMST(graph, undefined, trace);
      return base({ pathEdges: edges.map((e) => e.id), summary: `${edges.length} roads`, result: `Tree weight ${mstWeight(edges).toFixed(0)} over ${edges.length} roads`, log: (st) => (st.kind === 'relax' ? `keep road ${st.edge} (joins two components)` : describe(st)) });
    }
    case 'merge':
    case 'quick':
    case 'heap': {
      const arr = trackValues(graph);
      const cmp = (a: number, b: number): number => a - b;
      const out = id === 'merge' ? mergeSort([...arr], cmp, trace) : id === 'quick' ? quickSort([...arr], cmp, trace) : heapSort([...arr], cmp, trace);
      return base({ data: { arr, sorted: out }, summary: `${trace.counters.comparisons} comparisons`, result: `Sorted ${arr.length} road lengths in ${trace.counters.comparisons} comparisons` });
    }
    case 'topk': {
      const values = trackValues(graph);
      const k = Math.min(6, Math.max(2, Math.floor(values.length / 4)));
      const res = topK(values, k, (a, b) => a - b, trace);
      return base({ data: { arr: values, sorted: res }, summary: `top ${k} of ${values.length}`, result: `${k} shortest roads: ${res.join(', ')}` });
    }
    case 'events': {
      const built = buildRaceEvents(graph, meta);
      const list = built.length
        ? built
        : graph.allEdges().filter((e) => e.isShortcut).map((e, i) => ({ eventId: i + 1, type: 'RoadBlockage' as const, triggerTime: (i + 1) * 5, priority: (i % 6) + 1, targetEdgeOrVertex: e.id, duration: 0 }));
      const sched = new EventScheduler();
      const steps: AlgoStep[] = [];
      for (const e of list) { sched.schedule(e); steps.push({ kind: 'enqueue', vertex: e.eventId }); }
      const fired = sched.popDue(Infinity);
      for (const e of fired) steps.push({ kind: 'visit', vertex: e.eventId });
      trace.counters.heapPushes = list.length;
      trace.counters.heapPops = fired.length;
      const ts = list.map((e) => e.triggerTime);
      const lo = Math.min(...ts); const span = (Math.max(...ts) - lo) || 1;
      const scale = (t: number): number => 8 + Math.round(((t - lo) / span) * 90);
      return base({
        steps,
        data: { arr: list.map((e) => scale(e.triggerTime)), sorted: fired.map((e) => scale(e.triggerTime)) },
        summary: `${list.length} events scheduled`,
        result: `Fired in order: ${fired.map((e) => `#${e.eventId}@${e.triggerTime}s`).join(' → ')}`,
        log: (st) => (st.kind === 'enqueue' ? `schedule event #${st.vertex}` : st.kind === 'visit' ? `fire event #${st.vertex}` : describe(st)),
      });
    }
    case 'knapsack': {
      const { items, budget } = trackItems(graph);
      const r = knapsack01(items, budget, trace);
      return base({ data: { items, budget, selected: r.selected, value: r.value }, summary: `${trace.counters.dpStatesComputed} states`, result: `Best value ${r.value} using items ${r.selected.join(', ') || 'none'}` });
    }
    case 'greedy': {
      const { items, budget } = trackItems(graph);
      const g = greedyKnapsack(items, budget, trace);
      const opt = knapsack01(items, budget);
      const order = [...items].filter((i) => i.cost > 0).sort((a, b) => b.benefit / b.cost - a.benefit / a.cost || a.id - b.id);
      return base({
        steps: order.map((_, i) => ({ kind: 'visit', vertex: i }) as AlgoStep),
        data: { items, budget, selected: g.selected, value: g.value, optimum: opt.value, order },
        summary: `value ${g.value} vs optimum ${opt.value}`,
        result: g.value === opt.value ? `Greedy matched the optimum (${opt.value})` : `Greedy ${g.value} vs DP optimum ${opt.value}`,
        log: (_st, i) => `consider item ${order[i]!.id} (ratio ${(order[i]!.benefit / order[i]!.cost).toFixed(2)})`,
      });
    }
    case 'refuel': {
      const params = trackRefuel(graph, meta);
      const res = refuelDP(params, trace);
      return base({
        steps: params.legFuel.map((_, i) => ({ kind: 'visit', vertex: i }) as AlgoStep),
        data: { ...params, result: res },
        summary: `${trace.counters.dpStatesComputed} states`,
        result: res.feasible
          ? `Min stop time ${res.minStopTime}s · buys ${res.purchases.map((p) => (p / 10).toFixed(0)).join(' / ')}`
          : 'Not feasible on this route with the current stations',
        log: (_st, i) => `leg ${i + 1}: needs ${(params.legFuel[i]! / 10).toFixed(1)} fuel${params.stations[i] ? ' · station' : ''}`,
      });
    }
    case 'backtrack': {
      const n = meta.checkpointOrder.length + 2; // ring vertices: start + checkpoints + finish
      const k = Math.max(2, Math.floor(n / 5));
      const chosen = placeObstacles(n, k, makeRng(seed), trace);
      return base({ data: { n, k, chosen }, summary: `${trace.counters.examinedEdges} pruned`, result: `Obstacles on ${chosen.length} of ${n} ring roads: ${chosen.join(', ')}` });
    }
    default:
      return base({});
  }
}
