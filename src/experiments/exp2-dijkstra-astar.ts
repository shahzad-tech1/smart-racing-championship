/** Experiment 2 — Dijkstra & A* (spec §7). Expanded/relaxed/heap-ops + equal cost. */
import { dijkstra } from "../algorithms/dijkstra";
import { aStar, euclideanHeuristic } from "../algorithms/astar";
import type { Edge } from "../core/types";
import { countingTrace } from "../core/instrumentation";
import { gridGraph } from "./graphGen";
import { benchmark, ms, type ExperimentResult } from "./harness";

const dcost = (e: Edge) => e.distance;

export function runExp2(dims: Array<[number, number]> = [[4, 4], [6, 6], [8, 8], [12, 12], [16, 16]]): ExperimentResult {
  const rows: Array<Array<string | number>> = [];
  const notes: string[] = [];
  for (const [cols, rowsN] of dims) {
    const g = gridGraph(cols, rowsN);
    const start = 0;
    const goal = cols * rowsN - 1;
    const h = euclideanHeuristic(g);

    const td = countingTrace();
    const dj = dijkstra(g, start, goal, dcost, td);
    const ta = countingTrace();
    const as = aStar(g, start, goal, dcost, h, ta);

    if (Math.abs(dj.cost - as.cost) > 1e-6) {
      throw new Error(`Exp2 correctness: A* cost ${as.cost} != Dijkstra ${dj.cost} on ${cols}x${rowsN}`);
    }

    const djT = benchmark(() => void dijkstra(g, start, goal, dcost));
    const asT = benchmark(() => void aStar(g, start, goal, dcost, h));

    const cmp = ta.counters.visitedVertices < td.counters.visitedVertices ? "fewer"
      : ta.counters.visitedVertices > td.counters.visitedVertices ? "more" : "equal";
    notes.push(`${cols}x${rowsN}: A* expanded ${cmp} vertices than Dijkstra.`);

    rows.push([
      g.vertexCount, g.edgeCount,
      ms(djT.mean), td.counters.visitedVertices, td.counters.relaxedEdges, td.counters.heapPushes + td.counters.heapPops,
      ms(asT.mean), ta.counters.visitedVertices, ta.counters.relaxedEdges, ta.counters.heapPushes + ta.counters.heapPops,
      dj.cost,
    ]);
  }
  return {
    name: "exp2-dijkstra-astar",
    headers: ["V", "E", "dij_mean_ms", "dij_expanded", "dij_relaxed", "dij_heapOps", "astar_mean_ms", "astar_expanded", "astar_relaxed", "astar_heapOps", "optimal_cost"],
    rows,
    notes: ["A* returns the SAME optimal cost as Dijkstra.", ...notes],
  };
}
