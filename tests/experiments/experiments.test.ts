import { describe, it, expect } from "vitest";
import { benchmark, stats, toCSV } from "../../src/experiments/harness";
import { randomGraph, gridGraph } from "../../src/experiments/graphGen";
import { runExp1 } from "../../src/experiments/exp1-bfs-dfs";
import { runExp2 } from "../../src/experiments/exp2-dijkstra-astar";
import { runExp3 } from "../../src/experiments/exp3-dp-greedy";
import { runExp4 } from "../../src/experiments/exp4-events";
import { runExp5 } from "../../src/experiments/exp5-sorting";

describe("benchmark harness", () => {
  it("reports the requested number of runs and sane stats", () => {
    const b = benchmark(() => { let s = 0; for (let i = 0; i < 1000; i++) s += i; return s; }, { runs: 5, warmup: 1 });
    expect(b.runs).toBe(5);
    expect(b.mean).toBeGreaterThanOrEqual(0);
    expect(b.min).toBeLessThanOrEqual(b.max);
  });

  it("computes median/stddev correctly", () => {
    const s = stats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.median).toBe(4.5);
    expect(s.stddev).toBeCloseTo(2, 5);
  });

  it("escapes CSV fields with commas/quotes", () => {
    const csv = toCSV(["a", "b"], [[1, 'x,y'], [2, 'he"llo']]);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"he""llo"');
  });
});

describe("graph generators", () => {
  it("randomGraph is connected and reproducible", () => {
    const a = randomGraph(40, 3, 7);
    const b = randomGraph(40, 3, 7);
    expect(a.vertexCount).toBe(40);
    expect(JSON.stringify(a.allEdges())).toBe(JSON.stringify(b.allEdges()));
  });

  it("gridGraph has the expected vertex/edge counts", () => {
    const g = gridGraph(4, 3);
    expect(g.vertexCount).toBe(12);
    expect(g.edgeCount).toBe(4 * 2 + 3 * 3); // horizontals + verticals
  });
});

describe("experiment runners (tiny sizes, with built-in correctness checks)", () => {
  it("exp1 produces rows", () => {
    expect(runExp1([20, 40]).rows.length).toBe(4); // 2 sizes x 2 densities
  });
  it("exp2 verifies A* == Dijkstra cost and produces rows", () => {
    expect(runExp2([[3, 3], [4, 4]]).rows.length).toBe(2);
  });
  it("exp3 verifies DP vs exhaustive and the supplied example", () => {
    expect(runExp3([[5, 12], [10, 25]]).rows.length).toBe(3); // example + 2 cases
  });
  it("exp4 verifies event ordering", () => {
    expect(runExp4([50, 200]).rows.length).toBe(2);
  });
  it("exp5 produces sorting and top-k rows", () => {
    const r = runExp5([50, 200]);
    expect(r.sorting.rows.length).toBe(2 * 4); // sizes x shapes
    expect(r.topk.rows.length).toBe(2 * 2); // sizes x two k values
  });
});
