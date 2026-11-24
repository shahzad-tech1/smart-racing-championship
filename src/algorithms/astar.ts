/**
 * src/algorithms/astar.ts — Act 2: A* heuristic-guided search (spec §5.2).
 *
 * Returns the SAME optimal cost as Dijkstra when the heuristic is admissible.
 * We ship a CONSISTENT heuristic, so standard graph-search A* needs no reopening
 * of closed vertices (we keep a closed set). If an inconsistent-but-admissible
 * heuristic is ever used, pass allowReopen:true to preserve optimality.
 *
 * Admissibility (spec §5.2):
 *  - Distance-only cost: Euclidean(v, goal) is admissible because each edge length
 *    is >= the straight-line distance between its endpoints.
 *  - Weighted scalar cost: multiply Euclidean by a valid minimum edge-cost-per-
 *    distance ratio. If no valid ratio exists, fall back to h = 0 (still admissible).
 */

import type { Graph } from "../core/Graph";
import { BinaryHeap } from "../core/BinaryHeap";
import type { AlgoTrace } from "../core/instrumentation";
import type { EdgeCostFn, HeuristicFn, PathResult } from "./pathTypes";
import { reconstruct } from "./dijkstra";

interface QEntry {
  vertex: number;
  f: number; // g + h
  seq: number;
}

export function aStar(
  g: Graph,
  start: number,
  goal: number,
  cost: EdgeCostFn,
  heuristic: HeuristicFn,
  trace?: AlgoTrace,
  opts?: { allowReopen?: boolean },
): PathResult {
  const gScore = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, { v: number; edgeId: number }>();
  const closed = new Set<number>();

  let seq = 0;
  const heap = new BinaryHeap<QEntry>((a, b) =>
    a.f !== b.f ? a.f < b.f : a.seq < b.seq,
  );
  heap.push({ vertex: start, f: heuristic(start, goal), seq: seq++ });
  if (trace) trace.counters.heapPushes++;

  while (!heap.isEmpty()) {
    const top = heap.pop()!;
    if (trace) trace.counters.heapPops++;
    const u = top.vertex;
    if (closed.has(u)) continue;
    closed.add(u);
    if (trace) {
      trace.counters.visitedVertices++;
      trace.record({ kind: "visit", vertex: u });
    }
    if (u === goal) break;

    const gu = gScore.get(u) ?? Infinity;
    for (const { edge, to } of g.neighbors(u, { ignoreBlocked: true })) {
      if (trace) trace.counters.examinedEdges++;
      if (closed.has(to) && !opts?.allowReopen) continue;
      const tentative = gu + cost(edge);
      if (tentative < (gScore.get(to) ?? Infinity)) {
        gScore.set(to, tentative);
        prev.set(to, { v: u, edgeId: edge.id });
        if (opts?.allowReopen) closed.delete(to);
        heap.push({ vertex: to, f: tentative + heuristic(to, goal), seq: seq++ });
        if (trace) {
          trace.counters.relaxedEdges++;
          trace.counters.heapPushes++;
          trace.record({ kind: "relax", edge: edge.id, improved: true, to, g: tentative });
        }
      }
    }
  }

  // gScore holds the exact optimal cost; reuse the shared reconstructor.
  return reconstruct(start, goal, gScore, prev, trace);
}

// ---- Heuristic builders ----

function euclid(g: Graph, a: number, b: number): number {
  const va = g.getVertex(a);
  const vb = g.getVertex(b);
  return Math.hypot(va.x - vb.x, va.y - vb.y);
}

/**
 * Largest k in (0, 1] with  road.distance >= k * straightLine(road endpoints)  for EVERY road
 * (blocked ones included, they may reopen). It is 1 whenever the data honours the spec's
 * precondition (§5.2: each edge length is at least the straight-line distance). If a road is
 * shorter than the straight line, scaling the heuristic by k restores admissibility AND
 * consistency, so A* stays optimal on imperfect data instead of silently returning a worse route.
 */
export function straightLineScale(g: Graph): number {
  let k = 1;
  for (const e of g.allEdges()) {
    const d = euclid(g, e.from, e.to);
    if (d > 0 && e.distance < d) k = Math.min(k, e.distance / d);
  }
  return k;
}

/** Straight-line distance heuristic — admissible for distance-only routing. */
export function euclideanHeuristic(g: Graph): HeuristicFn {
  const k = straightLineScale(g);
  return (v, goal) => euclid(g, v, goal) * k;
}

/** h = 0 — turns A* into Dijkstra. Useful to prove cost equality. */
export const zeroHeuristic: HeuristicFn = () => 0;

/**
 * Weighted-cost heuristic: Euclidean × (minimum cost-per-distance ratio over all
 * edges). Admissible lower bound. Falls back to h = 0 if no valid ratio exists.
 */
export function weightedHeuristic(g: Graph, cost: EdgeCostFn): HeuristicFn {
  let minRatio = Infinity;
  for (const e of g.allEdges()) {
    // Blocked roads are included on purpose: they may reopen, and a smaller ratio is still a valid lower bound.
    if (e.distance <= 0) continue;
    const r = cost(e) / e.distance;
    if (r >= 0 && r < minRatio) minRatio = r;
  }
  if (!Number.isFinite(minRatio) || minRatio <= 0) return zeroHeuristic;
  const k = straightLineScale(g);
  return (v, goal) => euclid(g, v, goal) * minRatio * k;
}
