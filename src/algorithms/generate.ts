/**
 * src/algorithms/generate.ts — Act 4: automatic track generation (spec §5.4).
 *
 * Pipeline (spec §5.4): place vertices -> candidate undirected roads -> ensure
 * connected -> MST backbone -> add extra edges for cycles/alternatives/shortcuts
 * -> backtracking placement of obstacles -> validate -> retry up to a limit.
 *
 * The backbone is built around an ordered checkpoint ring, which guarantees
 * ordered-checkpoint reachability, a cycle, the lap/return transition and two
 * alternative start->finish routes (the two ring directions) by construction, so
 * the validator accepts it. Shortcuts and a dead-end spur are added on top.
 *
 * Determinism: everything is driven by the seeded RNG (core/rng.ts), so the same
 * seed always yields the same circuit (spec §4.4).
 */

import { Graph } from "../core/Graph";
import type { Edge, Vertex } from "../core/types";
import { makeRng, randInt, shuffle, type Rng } from "../core/rng";
import { kruskalMST } from "./mst";
import { validateCircuit } from "../engine/validator";
import type { CircuitMeta } from "../data/circuits/meta";

export interface GenParams {
  checkpoints: number;
  shortcuts: number;
  maxRetries: number;
  name: string;
}

export interface GeneratedCircuit {
  graph: Graph;
  meta: CircuitMeta;
  /** Edge ids forming the MST backbone (demonstration/visualization). */
  backboneEdgeIds: number[];
  /** How many candidate circuits the validator rejected before this one. */
  rejectedAttempts: number;
}

const DEFAULTS: GenParams = { checkpoints: 10, shortcuts: 2, maxRetries: 25, name: "Generated Circuit" };

/** Backtracking: choose k ring-edge positions, pairwise non-adjacent (cyclically). */
function placeObstacles(n: number, k: number, rng: Rng): number[] {
  const order = shuffle(rng, Array.from({ length: n }, (_, i) => i));
  const chosen: number[] = [];
  const ok = (p: number) => chosen.every((c) => c !== p && (c + 1) % n !== p && (p + 1) % n !== c);
  const bt = (idx: number): boolean => {
    if (chosen.length === k) return true;
    if (idx >= order.length) return false;
    const p = order[idx]!;
    if (ok(p)) {
      chosen.push(p);
      if (bt(idx + 1)) return true;
      chosen.pop();
    }
    return bt(idx + 1);
  };
  bt(0);
  return chosen.sort((a, b) => a - b);
}

function dist(a: Vertex, b: Vertex): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
}

function makeEdge(id: number, from: Vertex, to: Vertex, extra: Partial<Edge> = {}): Edge {
  const d = dist(from, to);
  return {
    id, from: from.id, to: to.id,
    distance: d, baseTime: +(d / 30).toFixed(2), fuelCost: Math.max(1, Math.round(d / 18)),
    difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0,
    ...extra,
  };
}

function buildCandidate(rng: Rng, p: GenParams, seedLabel: number): GeneratedCircuit {
  const ringCount = p.checkpoints + 2; // start + checkpoints + finish
  const cx = 400;
  const cy = 300;
  const radius = 160 + randInt(rng, 0, 90);

  const vertices: Vertex[] = [];
  for (let i = 0; i < ringCount; i++) {
    const angleDeg = -90 + i * (360 / ringCount) + randInt(rng, -7, 7);
    const ang = (angleDeg * Math.PI) / 180;
    const type: Vertex["type"] = i === 0 ? "Start" : i === ringCount - 1 ? "Finish" : "Checkpoint";
    vertices.push({
      id: i,
      x: Math.round(cx + radius * Math.cos(ang)),
      y: Math.round(cy + radius * Math.sin(ang)),
      type,
      checkpointOrder: i >= 1 && i <= p.checkpoints ? i : null,
      active: true,
    });
  }

  // service + dead-end vertices, placed just outside their anchor ring node
  const anchorOut = (ringIdx: number, extra: number): { x: number; y: number } => {
    const v = vertices[ringIdx]!;
    const ang = Math.atan2(v.y - cy, v.x - cx);
    return { x: Math.round(v.x + extra * Math.cos(ang)), y: Math.round(v.y + extra * Math.sin(ang)) };
  };
  const fuelAnchor = randInt(rng, 1, p.checkpoints);
  const nitroAnchor = randInt(rng, 1, p.checkpoints);
  const deadAnchor = randInt(rng, 1, p.checkpoints);
  const fuelId = ringCount;
  const nitroId = ringCount + 1;
  const interId = ringCount + 2;
  const deadId = ringCount + 3;
  vertices.push({ id: fuelId, ...anchorOut(fuelAnchor, 60), type: "FuelStation", checkpointOrder: null, active: true });
  vertices.push({ id: nitroId, ...anchorOut(nitroAnchor, 60), type: "NitroPickup", checkpointOrder: null, active: true });
  vertices.push({ id: interId, x: cx, y: cy, type: "Intersection", checkpointOrder: null, active: true });
  vertices.push({ id: deadId, ...anchorOut(deadAnchor, 90), type: "DeadEnd", checkpointOrder: null, active: true });

  const vById = new Map<number, Vertex>(vertices.map((v) => [v.id, v]));
  const edges: Edge[] = [];
  let eid = 1;

  // ring edges (the cycle + main loop) with backtracking-placed obstacles
  const obsPositions = new Set(placeObstacles(ringCount, randInt(rng, 1, 2), rng));
  for (let i = 0; i < ringCount; i++) {
    const a = vById.get(i)!;
    const b = vById.get((i + 1) % ringCount)!;
    const hasObstacle = obsPositions.has(i);
    edges.push(makeEdge(eid++, a, b, {
      difficulty: hasObstacle ? randInt(rng, 3, 5) : randInt(rng, 1, 3),
      obstacle: hasObstacle ? randInt(rng, 1, 3) : 0,
    }));
  }

  // shortcuts: cross-chords between near-opposite ring nodes
  const used = new Set<string>();
  for (let s = 0; s < p.shortcuts; s++) {
    const a = randInt(rng, 1, p.checkpoints);
    const b = (a + Math.floor(ringCount / 2) + s) % ringCount;
    const key = [Math.min(a, b), Math.max(a, b)].join("-");
    if (a === b || used.has(key)) continue;
    used.add(key);
    edges.push(makeEdge(eid++, vById.get(a)!, vById.get(b)!, {
      isShortcut: true,
      difficulty: randInt(rng, 4, 5),
      obstacle: randInt(rng, 0, 3),
    }));
  }

  // alternative route through the central intersection
  const altA = 1;
  const altB = ringCount - 2;
  edges.push(makeEdge(eid++, vById.get(altA)!, vById.get(interId)!, { difficulty: 2 }));
  edges.push(makeEdge(eid++, vById.get(interId)!, vById.get(altB)!, { difficulty: 2 }));

  // service spurs + dead-end spur
  edges.push(makeEdge(eid++, vById.get(fuelAnchor)!, vById.get(fuelId)!, { difficulty: 1 }));
  edges.push(makeEdge(eid++, vById.get(nitroAnchor)!, vById.get(nitroId)!, { difficulty: 1 }));
  edges.push(makeEdge(eid++, vById.get(deadAnchor)!, vById.get(deadId)!, { difficulty: randInt(rng, 2, 4) }));

  const graph = new Graph(vertices, edges);
  const meta: CircuitMeta = {
    id: `circuit-${seedLabel}`,
    name: p.name,
    startVertex: 0,
    finishVertex: ringCount - 1,
    laps: 2,
    checkpointOrder: Array.from({ length: p.checkpoints }, (_, i) => i + 1),
  };
  const backboneEdgeIds = kruskalMST(graph).map((e) => e.id);
  return { graph, meta, backboneEdgeIds, rejectedAttempts: 0 };
}

/** Generate a validated circuit for a given seed. Throws if none validates in `maxRetries`. */
export function generateCircuit(seed: number, params: Partial<GenParams> = {}): GeneratedCircuit {
  const p: GenParams = { ...DEFAULTS, ...params };
  let rejected = 0;
  for (let attempt = 1; attempt <= p.maxRetries; attempt++) {
    const rng = makeRng(seed + attempt * 7919); // deterministic per-attempt stream
    const candidate = buildCandidate(rng, p, seed);
    const result = validateCircuit(candidate.graph, candidate.meta);
    if (result.valid) return { ...candidate, rejectedAttempts: rejected };
    rejected++;
  }
  throw new Error(`generateCircuit: no valid circuit for seed ${seed} within ${p.maxRetries} attempts`);
}
