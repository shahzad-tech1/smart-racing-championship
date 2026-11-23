/** Experiment 1 — BFS & DFS (spec §7). Runtime + visited/examined vs (V+E). */
import { bfs } from "../algorithms/bfs";
import { dfs } from "../algorithms/dfs";
import { countingTrace } from "../core/instrumentation";
import { randomGraph } from "./graphGen";
import { benchmark, ms, type ExperimentResult } from "./harness";

export function runExp1(sizes: number[] = [50, 100, 200, 400, 800]): ExperimentResult {
  const rows: Array<Array<string | number>> = [];
  for (const n of sizes) {
    for (const [density, avgDeg] of [["sparse", 2], ["dense", 6]] as const) {
      const g = randomGraph(n, avgDeg, 1000 + n + avgDeg);

      const tb = countingTrace();
      bfs(g, 0, undefined, tb);
      const td = countingTrace();
      dfs(g, 0, td);

      const bfsT = benchmark(() => void bfs(g, 0));
      const dfsT = benchmark(() => void dfs(g, 0));

      rows.push([
        n, g.edgeCount, density,
        ms(bfsT.mean), ms(bfsT.stddev), tb.counters.visitedVertices, tb.counters.examinedEdges,
        ms(dfsT.mean), td.counters.visitedVertices,
      ]);
    }
  }
  return {
    name: "exp1-bfs-dfs",
    headers: ["V", "E", "density", "bfs_mean_ms", "bfs_std_ms", "bfs_visited", "bfs_examinedEdges", "dfs_mean_ms", "dfs_visited"],
    rows,
    notes: ["Discuss observed growth against O(V+E); sparse vs dense edge examinations."],
  };
}
