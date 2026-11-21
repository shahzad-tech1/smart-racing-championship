# 00 — Shared Contracts (FROZEN)

> **This is the contract between Person A (algorithms) and Person B (UI).**
> Both of you implement against these exact types and signatures. If a type changes, it changes **here first**, in its own commit, agreed by both. Everything else in the project depends on this file being stable.

These are TypeScript interfaces. Put them in `src/core/types.ts` (data), `src/core/cost.ts` (cost model), `src/engine/comparator.ts` (comparator), and `src/core/instrumentation.ts` (counters). This document is the spec; the code files must match it exactly.

---

## 1. Graph data model (spec §3.1)

```ts
export type VertexType =
  | "Start" | "Finish" | "Checkpoint" | "Intersection"
  | "FuelStation" | "NitroPickup" | "DeadEnd";

export interface Vertex {
  id: number;             // unique
  x: number;              // map coords; used by A* heuristic
  y: number;
  type: VertexType;
  checkpointOrder: number | null;  // required order for mandatory checkpoints, else null
  active: boolean;        // is a service vertex currently available?
}

export type EdgeStatus = "Open" | "Blocked" | "Restricted";

export interface Edge {
  id: number;             // events refer to an edge by this id
  from: number;           // vertex id
  to: number;             // vertex id
  distance: number;       // >= 0
  baseTime: number;       // >= 0, travel time at normal speed
  fuelCost: number;       // >= 0, base fuel to traverse
  difficulty: number;     // integer 1 (easy) .. 5 (hard)
  status: EdgeStatus;
  isShortcut: boolean;
  directed: boolean;      // false = both directions; true = one-way from->to
  obstacle?: number;      // 0..5 static hazard penalty (0 = clear); dynamic hazards add on top via EffectLayer. Default 0.
}
```

### Graph class (owned by Person A, `src/core/Graph.ts`)

Adjacency-list representation for O(V+E) memory (spec §3.1). Dynamic updates must **not** rebuild the whole graph (spec §3.1).

```ts
export class Graph {
  constructor(vertices: Vertex[], edges: Edge[]);

  // read
  getVertex(id: number): Vertex;
  getEdge(id: number): Edge;
  // neighbours honoring direction + a traversability filter
  neighbors(vertexId: number, opts?: { ignoreBlocked?: boolean }): Array<{ edge: Edge; to: number }>;
  get vertexCount(): number;
  get edgeCount(): number;

  // dynamic updates (no full rebuild)
  setEdgeStatus(edgeId: number, status: EdgeStatus): void;
  setVertexActive(vertexId: number, active: boolean): void;

  // helpers for algorithms/experiments
  clone(): Graph;                 // deep copy for "what-if" routing
  allVertices(): Vertex[];
  allEdges(): Edge[];
}
```

**Rule:** Blocked edges are excluded from route searches. `Restricted` edges stay traversable but their **effective** time/cost reflects the restriction — effective cost is computed by the *effect layer* (see §6), not by mutating the base edge.

---

## 2. Other records (spec §3.2)

```ts
export type StrategyType = "FixedMainRoute" | "ShortcutSeeker" | "MinDistance" | "Human";

export interface Racer {
  id: number;
  name: string;
  isHuman: boolean;
  strategyType: StrategyType;
  currentVertex: number;
  fuel: number;                 // in integer tenths-of-a-unit (see §5) OR units — FROZEN as tenths
  nitroCharges: number;
  lap: number;
  nextCheckpoint: number;       // checkpointOrder we still need to visit
  totalTime: number;
}

export interface RaceResult {
  raceId: number;
  racerId: number;
  finishPosition: number;
  finishTime: number;
  fastestLap: number;
  bonusPoints: number;
  pointsAwarded: number;
}

export interface ChampionshipEntry {
  racerId: number;
  totalPoints: number;
  wins: number;
  sumOfFinishPositions: number;
  bestFastestLap: number;       // lower is better
}

export type EventType =
  | "RoadBlockage" | "ShortcutToggle" | "OilSpill"
  | "SpeedRestriction" | "FuelStationAvailability" | "NitroBooster";

export interface GameEvent {
  eventId: number;
  type: EventType;
  triggerTime: number;
  priority: number;             // lower fires first on tie (spec §4.5)
  insertionSequence: number;    // breaks all remaining ties -> fully deterministic
  targetEdgeOrVertex: number;   // id of the edge or vertex affected
  duration: number;             // seconds; expiry scheduled deterministically
  cancelled: boolean;           // lazy deletion flag
}
```

---

## 3. The cost model (spec §3.3) — `src/core/cost.ts`

Single scalar, non-negative cost so Dijkstra is valid:

```
cost(e) = w_d·D(e) + w_t·T(e) + w_f·F(e) + w_r·R(e) + w_o·O(e)
```

D, T, F, R, O = distance, travel time, fuel use, difficulty penalty, obstacle penalty — **normalized** to [0,1] by documented reference values before combining.

```ts
export interface CostWeights { wD: number; wT: number; wF: number; wR: number; wO: number; } // all >= 0

export interface NormalizationRefs {   // documented reference maxima for normalization
  maxDistance: number; maxTime: number; maxFuel: number; maxDifficulty: number; maxObstacle: number;
}

export type PresetName = "Balanced" | "Speed" | "Economy" | "Safety";

export const PRESETS: Record<PresetName, CostWeights> = {
  Balanced: { wD: 0.2, wT: 0.2, wF: 0.2, wR: 0.2, wO: 0.2 },
  Speed:    { wD: 0.15, wT: 0.5, wF: 0.1, wR: 0.15, wO: 0.1 },
  Economy:  { wD: 0.15, wT: 0.1, wF: 0.5, wR: 0.15, wO: 0.1 },
  Safety:   { wD: 0.1, wT: 0.1, wF: 0.1, wR: 0.35, wO: 0.25 },
};
// NOTE: these are starting values. FREEZE and document final values before experiments (spec §4.3).

// Returns the SAME number the UI displays and the SAME number Dijkstra minimizes.
export function edgeCost(
  edge: Edge,
  weights: CostWeights,
  refs: NormalizationRefs,
  activeEffects?: EffectLayer   // see §6; applies Restricted / OilSpill / SpeedRestriction
): number;
```

**Invariant (tested):** the Route Planner UI must display exactly `edgeCost(...)` summed along the path. Never recompute cost a second way for display. This satisfies *"the cost displayed to the player must be the same cost optimized by the algorithm."*

**Preset demonstration (spec §3.3):** at least one circuit must have a vertex pair where Balanced/Speed/Economy/Safety pick *different* routes. Person A builds a fixture test proving this; Person B surfaces it in the Route Planner.

---

## 4. The master comparator (spec §4.6) — `src/engine/comparator.ts`

Every sort and the top-k heap use **this and only this** total order.

```ts
// Championship standings order (used after all races):
//  1) higher totalPoints
//  2) higher wins
//  3) lower sumOfFinishPositions
//  4) lower bestFastestLap   (lower lap time is better)
//  5) lower racerId
// returns negative if a ranks ahead of b, positive if b ahead, 0 only if identical ids (never for distinct racers)
export function compareChampionship(a: ChampionshipEntry, b: ChampionshipEntry): number;

// Single-race finish order (spec §4.2.7, §4.2.8):
//  finished racers: lower finishTime, then lower racerId
//  if time-limited: by laps completed, checkpoints completed, elapsed time, then racerId
export function compareRaceFinish(a: RaceState, b: RaceState): number;
```

**Points table (spec §4.6), implement fully for 10 racers:**
`[25, 18, 15, 12, 10, 8, 6, 4, 2, 1]` for positions 1..10; 0 beyond.

**Invariant (tested):** Merge/Quick/Heap sort of the same input produce *identical* arrays, and top-k equals the first k of the full sort. Include a fixture that ties on points/wins/positions/lap so the racer-ID tiebreaker is exercised.

---

## 5. Resource units & rules (spec §4.3) — freeze before testing

| Parameter | Value | Rule |
|---|---|---|
| Max fuel | 100 units | Full tank at start |
| Fuel per edge | `fuelCost × (1.0 + 0.1×(difficulty−1))` | difficulty multiplier |
| Fuel station | up to 40 units/stop | fixed stop time for any positive purchase |
| Max nitro | 3 charges | cannot exceed capacity |
| Nitro effect | 1.5× speed, 4 s | one charge per activation |
| Nitro fuel penalty | 2× fuel while active | applied to affected route portion |

**DP discretization (spec §4.3, §5.3):** fuel is stored and reasoned about in **integer tenths of a unit** (i.e. 100 units → state values 0..1000). This is FROZEN. All DP state spaces use integer units. Document the effect on state-space size in the report. The `Racer.fuel` field is in tenths; the UI divides by 10 for display.

---

## 6. Effect layer (spec §4.5) — `src/engine/effects.ts`

Temporary/overlapping effects are stored **independently**, each with its own expiry/event id. The effective edge state is **recomputed from all currently active effects** in a documented order; expiring one effect must not erase another still-active one (spec §4.5).

```ts
export interface ActiveEffect {
  sourceEventId: number;
  type: EventType;
  target: number;          // edge or vertex id
  expiresAt: number;       // race-clock seconds; Infinity = until reversed/cleared
}

export class EffectLayer {
  add(effect: ActiveEffect): void;
  removeByEvent(eventId: number): void;
  expire(now: number): void;              // drop effects whose expiresAt <= now
  // documented combination order: take MAX difficulty penalty, STRICTEST speed cap, OR of blockage
  effectiveEdge(baseEdge: Edge): Edge;    // returns a derived edge; base edge is never mutated
  isBlocked(edgeId: number): boolean;
}
```

Combination order (documented, tested): **blockage = OR of all blockage effects; difficulty penalty = max; speed cap = strictest (min) cap.** Base edge is immutable; effects are a layer on top.

---

## 7. Instrumentation / counters (spec §5, §7) — `src/core/instrumentation.ts`

This is how **one** algorithm implementation serves gameplay, the Lab, and experiments. Every algorithm takes an optional `trace`. Gameplay passes `undefined` (zero overhead); Lab passes a recording trace; experiments pass a counting trace.

```ts
export interface Counters {
  visitedVertices: number;
  examinedEdges: number;
  relaxedEdges: number;     // Dijkstra/A*
  heapPushes: number;
  heapPops: number;
  comparisons: number;      // sorts
  dpStatesComputed: number; // DP
}

// A trace records ordered steps for the Lab to animate, AND accumulates counters.
export interface AlgoTrace {
  counters: Counters;
  // optional step log; Lab reads it, experiments can leave it off for speed
  steps?: AlgoStep[];
  record(step: AlgoStep): void;
}

export type AlgoStep =
  | { kind: "visit"; vertex: number }
  | { kind: "enqueue"; vertex: number }
  | { kind: "relax"; edge: number; improved: boolean }
  | { kind: "frontier"; vertices: number[] }
  | { kind: "pathFound"; vertices: number[]; cost: number }
  | { kind: "compare"; i: number; j: number }
  | { kind: "swap"; i: number; j: number }
  | { kind: "dpCell"; i: number; b: number; value: number };
```

### Canonical algorithm signatures (Person A implements, both consume)

```ts
// Act 1
export function bfs(g: Graph, start: number, goal?: number, trace?: AlgoTrace): BfsResult;
export function dfs(g: Graph, start: number, trace?: AlgoTrace): DfsResult; // discovery/finish, cycles, components, dead ends

// Act 2  (edgeCost via a passed cost function so routing honors presets + effects)
export type EdgeCostFn = (edge: Edge) => number;
export function dijkstra(g: Graph, start: number, goal: number, cost: EdgeCostFn, trace?: AlgoTrace): PathResult;
export function aStar(g: Graph, start: number, goal: number, cost: EdgeCostFn, heuristic: HeuristicFn, trace?: AlgoTrace): PathResult;
// checkpoint-aware wrapper: plans leg-by-leg through ordered checkpoints then finish (spec §5.2)
export function planCheckpointRoute(g: Graph, from: number, orderedCheckpoints: number[], finish: number, cost: EdgeCostFn, trace?: AlgoTrace): PathResult;

// Act 3
export function knapsack01(items: Item[], budget: number, trace?: AlgoTrace): KnapsackResult;    // DP, integer budget
export function refuelDP(legFuel: number[], capacity: number, startFuel: number, stops: FuelStop[], trace?: AlgoTrace): RefuelResult;
export function greedyKnapsack(items: Item[], budget: number, trace?: AlgoTrace): KnapsackResult; // v/c ratio heuristic

// Act 4
export function kruskalMST(g: Graph, trace?: AlgoTrace): Edge[];     // OR prim(g, start, trace)
export function generateCircuit(seed: number, params: GenParams): Graph;  // backtracking placement + validate
export class EventHeap { push(e: GameEvent): void; pop(): GameEvent | null; peek(): GameEvent | null; cancel(eventId: number): void; }

// Act 5
export function mergeSort<T>(a: T[], cmp: (x: T, y: T) => number, trace?: AlgoTrace): T[];
export function quickSort<T>(a: T[], cmp: (x: T, y: T) => number, trace?: AlgoTrace): T[];  // 3-way partition
export function heapSort<T>(a: T[], cmp: (x: T, y: T) => number, trace?: AlgoTrace): T[];
export function topK<T>(a: T[], k: number, cmp: (x: T, y: T) => number, trace?: AlgoTrace): T[]; // size-k heap
```

`PathResult` shape:
```ts
export interface PathResult {
  found: boolean;
  path: number[];       // vertex ids, start..goal; empty if not found
  cost: number;         // EXACT scalar minimized; what the UI displays
  edges: number[];      // edge ids along the path
}
```

### A\* heuristic (spec §5.2) — must be admissible
```ts
export type HeuristicFn = (vertexId: number, goalId: number) => number;
// distance-only: Euclidean(v, goal).
// weighted cost: Euclidean × (minimum valid edge-cost-per-distance ratio); if ratio invalid, return 0.
```
The implementation supports a **consistent** heuristic (no reopening). If an inconsistent heuristic is ever used, enable closed-set reopening. State which case is active in the report (we ship consistent).

---

## 8. Engine ↔ UI boundary

Person B's UI never computes a route or a cost or a sort itself. It calls Person A's functions and renders the result. The engine exposes a façade so the UI has one import surface:

```ts
// src/engine/RaceEngine.ts  (A owns logic; B calls these)
export class RaceEngine {
  constructor(graph: Graph, racers: Racer[], config: RaceConfig, seed: number);
  tick(dtSeconds: number): void;        // advance sim deterministically by dt
  get state(): RaceState;               // immutable snapshot for rendering
  get finished(): boolean;
  humanSetTargetRoute(path: number[]): void;
  humanActivateNitro(): void;
  humanRefuel(amountTenths: number): void;
  results(): RaceResult[];
}
```

`tick(dt)` is **fixed-step** (e.g. dt = 1/60) and deterministic: same seed + same inputs ⇒ same `results()`. The renderer interpolates between snapshots for smoothness but never changes simulation state. This separation is what lets us prove determinism (spec §4.4) and keep the game visually smooth at the same time.

---

## 9. Change log for this contract

| Date | Change | Agreed by |
|---|---|---|
| Phase 0 | Initial freeze | A + B |
| Phase 0 | Added optional `Edge.obstacle` (0..5 static hazard, default 0) so the `O` cost term and the Safety preset act on base edges, not only on dynamic effects. | A — **confirm with B** |

(Append a row for every change. No silent edits.)
