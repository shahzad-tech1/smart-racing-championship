/**
 * src/experiments/graphGen.ts — seeded graph generators for the experiments.
 * Deterministic (core/rng), so datasets are reproducible (spec §7).
 */

import { Graph } from "../core/Graph";
import type { Edge, Vertex } from "../core/types";
import { makeRng, randInt } from "../core/rng";

/**
 * Random connected graph with ~avgDegree edges per vertex. A random spanning tree
 * guarantees connectivity; extra random edges fill to the target density. Vertices
 * carry coordinates so A* heuristics are usable.
 */
export function randomGraph(n: number, avgDegree: number, seed: number): Graph {
  const rng = makeRng(seed);
  const vertices: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    vertices.push({
      id: i,
      x: randInt(rng, 0, 800),
      y: randInt(rng, 0, 600),
      type: i === 0 ? "Start" : i === n - 1 ? "Finish" : "Intersection",
      checkpointOrder: null,
      active: true,
    });
  }
  const dist = (a: number, b: number) =>
    Math.round(Math.hypot(vertices[a]!.x - vertices[b]!.x, vertices[a]!.y - vertices[b]!.y));

  const edges: Edge[] = [];
  const used = new Set<string>();
  let eid = 1;
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (used.has(key)) return;
    used.add(key);
    const d = Math.max(1, dist(a, b));
    edges.push({
      id: eid++, from: a, to: b, distance: d, baseTime: +(d / 30).toFixed(2),
      fuelCost: Math.max(1, Math.round(d / 18)), difficulty: randInt(rng, 1, 5),
      status: "Open", isShortcut: false, directed: false, obstacle: 0,
    });
  };

  // spanning tree -> connected
  for (let i = 1; i < n; i++) addEdge(i, randInt(rng, 0, i - 1));
  // extra edges to reach target density
  const target = Math.floor((n * avgDegree) / 2);
  let guard = 0;
  while (edges.length < target && guard < target * 10) {
    addEdge(randInt(rng, 0, n - 1), randInt(rng, 0, n - 1));
    guard++;
  }
  return new Graph(vertices, edges);
}

/** Grid graph (cols×rows) with unit-spaced coordinates; ideal for A* experiments. */
export function gridGraph(cols: number, rows: number, spacing = 50): Graph {
  const vertices: Vertex[] = [];
  const id = (c: number, r: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = id(c, r);
      vertices.push({
        id: i, x: c * spacing, y: r * spacing,
        type: i === 0 ? "Start" : i === cols * rows - 1 ? "Finish" : "Intersection",
        checkpointOrder: null, active: true,
      });
    }
  }
  const edges: Edge[] = [];
  let eid = 1;
  const add = (a: number, b: number) => {
    edges.push({
      id: eid++, from: a, to: b, distance: spacing, baseTime: +(spacing / 30).toFixed(2),
      fuelCost: Math.max(1, Math.round(spacing / 18)), difficulty: 1,
      status: "Open", isShortcut: false, directed: false, obstacle: 0,
    });
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) add(id(c, r), id(c + 1, r));
      if (r + 1 < rows) add(id(c, r), id(c, r + 1));
    }
  }
  return new Graph(vertices, edges);
}
