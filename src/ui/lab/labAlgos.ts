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
import { mergeSort, quickSort, heapSort } from '../../algorithms/sort.ts';
import { knapsack01, type Item } from '../../algorithms/knapsack.ts';
import { greedyKnapsack } from '../../algorithms/greedy.ts';
import { refuelDP } from '../../algorithms/refuel.ts';
import { placeObstacles } from '../../algorithms/generate.ts';
import { recordingTrace, type AlgoStep, type Counters } from '../../core/instrumentation.ts';
import { costFn, PRESETS, REFS } from '../../core/cost.ts';
import { makeRng } from '../../core/rng.ts';
import type { Graph } from '../../core/Graph.ts';
import type { CircuitMeta } from '../../data/circuits/meta.ts';

export type Kind = 'graph' | 'array' | 'dp' | 'backtrack' | 'refuel';
export type Group = 'Graph search' | 'Shortest path' | 'Spanning tree' | 'Sorting' | 'Dynamic programming & greedy' | 'Backtracking';

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
  { id: 'merge', name: 'Merge sort', group: 'Sorting', kind: 'array', time: 'O(n log n)', space: 'O(n)', blurb: 'Splits, sorts halves, merges. Stable, so tied drivers keep their order.', sample: true },
  { id: 'quick', name: 'Quick sort', group: 'Sorting', kind: 'array', time: 'O(n log n) avg · O(n²) worst', space: 'O(log n)', blurb: 'Partitions around a pivot, then recurses on each side.', sample: true },
  { id: 'heap', name: 'Heap sort', group: 'Sorting', kind: 'array', time: 'O(n log n)', space: 'O(1)', blurb: 'Builds a max-heap, then repeatedly moves the largest to the end.', sample: true },
  { id: 'knapsack', name: '0/1 Knapsack (DP)', group: 'Dynamic programming & greedy', kind: 'dp', time: 'O(m·B)', space: 'O(m·B)', blurb: 'Fills a table dp[item][budget] bottom-up; always finds the best-value selection.', sample: true },
  { id: 'greedy', name: 'Greedy knapsack', group: 'Dynamic programming & greedy', kind: 'dp', time: 'O(m log m)', space: 'O(m)', blurb: 'Picks by benefit/cost ratio. Fast, but can miss the optimum the DP finds.', sample: true },
  { id: 'refuel', name: 'Refuel planner (DP)', group: 'Dynamic programming & greedy', kind: 'refuel', time: 'O(m·C·P)', space: 'O(m·C)', blurb: 'Chooses how much fuel to buy at each station to finish with the fewest stop-seconds.', sample: true },
  { id: 'backtrack', name: 'Backtracking: obstacles', group: 'Backtracking', kind: 'backtrack', time: 'O(n!) worst, pruned', space: 'O(k)', blurb: 'Places k obstacles on ring roads so none are adjacent; undoes a placement when it dead-ends.', sample: true },
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
      const arr = sampleNumbers(28, seed);
      const cmp = (a: number, b: number): number => a - b;
      const out = id === 'merge' ? mergeSort([...arr], cmp, trace) : id === 'quick' ? quickSort([...arr], cmp, trace) : heapSort([...arr], cmp, trace);
      return base({ data: { arr, sorted: out }, summary: `${trace.counters.comparisons} comparisons`, result: `Sorted ${arr.length} values in ${trace.counters.comparisons} comparisons` });
    }
    case 'knapsack': {
      const { items, budget } = sampleItems(seed);
      const r = knapsack01(items, budget, trace);
      return base({ data: { items, budget, selected: r.selected, value: r.value }, summary: `${trace.counters.dpStatesComputed} states`, result: `Best value ${r.value} using items ${r.selected.join(', ') || 'none'}` });
    }
    case 'greedy': {
      const { items, budget } = sampleItems(seed);
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
      const r = makeRng(seed);
      const legFuel = Array.from({ length: 6 }, () => 80 + Math.floor(r() * 120));
      const stations = [false, true, false, true, true, false];
      const params = { legFuel, capacity: 400, startFuel: 150, stations, maxPurchase: 300, stopTime: 4 };
      const res = refuelDP(params, trace);
      return base({
        steps: legFuel.map((_, i) => ({ kind: 'visit', vertex: i }) as AlgoStep),
        data: { ...params, result: res },
        summary: `${trace.counters.dpStatesComputed} states`,
        result: res.feasible ? `Min stop time ${res.minStopTime}s · buys ${res.purchases.map((p) => (p / 10).toFixed(0)).join(' / ')}` : 'Not feasible with these stations',
        log: (_st, i) => `leg ${i + 1}: needs ${(legFuel[i]! / 10).toFixed(1)} fuel${stations[i] ? ' · station' : ''}`,
      });
    }
    case 'backtrack': {
      const n = 14;
      const k = 5;
      const chosen = placeObstacles(n, k, makeRng(seed), trace);
      return base({ data: { n, k, chosen }, summary: `${trace.counters.examinedEdges} pruned`, result: `Obstacles on roads ${chosen.join(', ')}` });
    }
    default:
      return base({});
  }
}
