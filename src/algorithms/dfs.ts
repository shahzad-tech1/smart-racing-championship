/**
 * src/algorithms/dfs.ts — Act 1: Depth-First Search (spec §5.1).
 *
 * Role: traversal, cycle detection, connected components and dead-end analysis.
 * One DFS traversal is O(V+E). (Enumerating ALL simple paths is exponential —
 * that lives in paths.ts with hard caps.)
 *
 * Cycle detection works for mixed directed/undirected graphs: we remember the
 * edge we arrived on and never treat walking back along that same undirected
 * edge as a cycle (the classic "skip the parent edge" rule), while a back edge
 * to any other on-stack vertex is a genuine cycle.
 */

import type { Graph, Neighbor } from "../core/Graph";
import type { AlgoTrace } from "../core/instrumentation";
import type { Vertex } from "../core/types";

export interface DfsResult {
  /** Discovery order of vertices (DFS pre-order across the whole forest). */
  order: number[];
  discovery: Map<number, number>;
  finish: Map<number, number>;
  parent: Map<number, number | null>;
  hasCycle: boolean;
  /** Weakly-connected components (undirected view), each sorted ascending. */
  components: number[][];
}

type Color = 0 | 1 | 2; // white, gray (on stack), black (done)

export function dfs(g: Graph, start: number, trace?: AlgoTrace): DfsResult {
  const discovery = new Map<number, number>();
  const finish = new Map<number, number>();
  const parent = new Map<number, number | null>();
  const order: number[] = [];
  const color = new Map<number, Color>();
  let timer = 0;
  let hasCycle = false;

  // Explicit stack instead of recursion: a long road (tens of thousands of vertices, as in
  // the Experiment 1 sweeps) must not overflow the JS call stack. The visiting order, the
  // discovery/finish stamps and the cycle rule are identical to the recursive formulation.
  interface Frame {
    u: number;
    viaEdgeId: number | null;
    nbrs: Neighbor[];
    next: number;
  }
  const stack: Frame[] = [];

  const enter = (u: number, viaEdgeId: number | null, par: number | null): void => {
    color.set(u, 1);
    discovery.set(u, timer++);
    parent.set(u, par);
    order.push(u);
    if (trace) {
      trace.counters.visitedVertices++;
      trace.record({ kind: "visit", vertex: u });
    }
    stack.push({ u, viaEdgeId, nbrs: g.neighbors(u, { ignoreBlocked: true }), next: 0 });
  };

  const visit = (root: number): void => {
    enter(root, null, null);
    while (stack.length > 0) {
      const f = stack[stack.length - 1]!;
      if (f.next < f.nbrs.length) {
        const { edge, to } = f.nbrs[f.next++]!;
        if (trace) trace.counters.examinedEdges++;
        if (edge.id === f.viaEdgeId) continue; // don't walk back along the same undirected edge
        const c = color.get(to) ?? 0;
        if (c === 0) {
          enter(to, edge.id, f.u);
        } else if (c === 1) {
          hasCycle = true; // back edge to an on-stack vertex
        }
      } else {
        color.set(f.u, 2);
        finish.set(f.u, timer++);
        stack.pop();
      }
    }
  };

  if (g.hasVertex(start)) visit(start);
  // Continue as a forest so the whole graph is traversed (components, global cycle).
  for (const v of g.allVertices()) {
    if ((color.get(v.id) ?? 0) === 0) visit(v.id);
  }

  return {
    order,
    discovery,
    finish,
    parent,
    hasCycle,
    components: weaklyConnectedComponents(g),
  };
}

/** Weakly-connected components (edges treated as undirected; blocked edges excluded). */
export function weaklyConnectedComponents(g: Graph): number[][] {
  const adj = new Map<number, number[]>();
  for (const v of g.allVertices()) adj.set(v.id, []);
  for (const e of g.allEdges()) {
    if (e.status === "Blocked") continue;
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }

  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const v of g.allVertices()) {
    if (seen.has(v.id)) continue;
    const comp: number[] = [];
    const stack = [v.id];
    seen.add(v.id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const w of adj.get(u)!) {
        if (!seen.has(w)) {
          seen.add(w);
          stack.push(w);
        }
      }
    }
    comps.push(comp.sort((a, b) => a - b));
  }
  return comps;
}

/**
 * Dead-end analysis (spec §5.1): "a non-mandatory vertex from which the finish
 * cannot be reached without reversing." We detect these by iterative leaf-pruning
 * on the undirected traversable graph: repeatedly remove non-protected vertices of
 * degree <= 1. What remains is the 2-core (loops + through-roads); everything
 * pruned is a pendant you can only exit by reversing — a dead end.
 *
 * Protected = Start, Finish, and every mandatory checkpoint (plus any ids passed
 * in `protect`). Note: a service placed on a spur (fuel/nitro) is structurally a
 * dead end too, by this definition.
 */
export function findDeadEnds(
  g: Graph,
  opts?: { finish?: number; protect?: number[] },
): number[] {
  const protect = new Set<number>(opts?.protect ?? []);
  if (opts?.finish != null) protect.add(opts.finish);
  for (const v of g.allVertices()) {
    if (v.type === "Start" || v.type === "Finish" || v.checkpointOrder != null) {
      protect.add(v.id);
    }
  }

  const adj = new Map<number, Set<number>>();
  for (const v of g.allVertices()) adj.set(v.id, new Set());
  for (const e of g.allEdges()) {
    if (e.status === "Blocked" || e.from === e.to) continue;
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  const deg = new Map<number, number>();
  for (const [id, s] of adj) deg.set(id, s.size);

  const removed = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const v of g.allVertices()) {
      const id = v.id;
      if (removed.has(id) || protect.has(id)) continue;
      if ((deg.get(id) ?? 0) <= 1) {
        removed.add(id);
        changed = true;
        for (const w of adj.get(id)!) {
          if (!removed.has(w)) deg.set(w, (deg.get(w) ?? 1) - 1);
        }
      }
    }
  }
  return [...removed].sort((a, b) => a - b);
}

/** Vertices explicitly typed "DeadEnd" in the data (handy for rendering/tests). */
export function typedDeadEnds(g: Graph): number[] {
  return g
    .allVertices()
    .filter((v: Vertex) => v.type === "DeadEnd")
    .map((v) => v.id)
    .sort((a, b) => a - b);
}
