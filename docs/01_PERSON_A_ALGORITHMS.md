# 01 — Person A: Algorithms Core & Engine

> **You own:** `src/core/`, `src/algorithms/`, the logic inside `src/engine/`, and `src/experiments/`.
> **Your mandate:** every one of the 12 algorithms is correct, deterministic, instrumented, and has a real role in the game. You also own 5 of the experiments and the algorithm sections of the report.
> **Golden rule:** your code never imports from `ui/` or `render/`. It must run headless under Vitest and under Node (`npm run experiments`).

Work against **[00_SHARED_CONTRACTS.md](00_SHARED_CONTRACTS.md)** exactly. Each phase below lists: *Build · Tests · Acceptance · Hand-off to B*.

---

## Phase 0 — Foundations (Day 1–2)

**Build**
- `src/core/types.ts` — paste the types from the contract.
- `src/core/rng.ts` — a seeded PRNG (mulberry32 or xorshift128). Export `makeRng(seed): () => number`. **This is the only randomness source in the whole project.**
- `src/core/Graph.ts` — adjacency-list Graph with the full contract API. `neighbors()` must honor `directed` and skip `Blocked` when `ignoreBlocked` is set.
- `src/core/instrumentation.ts` — `Counters`, `AlgoTrace`, a `countingTrace()` factory and a `recordingTrace()` factory.
- `src/core/cost.ts` — `edgeCost`, `PRESETS`, `NormalizationRefs`. Document your reference maxima in a comment and in the report.
- One hand-authored circuit fixture `src/data/circuits/circuit1.ts` (≥10 ordered checkpoints, ≥2 shortcuts, ≥1 cycle, ≥1 dead end) so B has real data to render on day 1.

**Tests** (`tests/core/`)
- Graph: build from fixture, `neighbors` honors direction, `setEdgeStatus` doesn't rebuild (object identity of other edges preserved).
- RNG: same seed ⇒ identical sequence; different seeds differ.
- cost: known edge → known cost by hand calculation.

**Acceptance:** `npm test` green; B can import `Graph` and `circuit1` and draw it.

**Hand-off to B:** the `Graph` API, `circuit1`, and `edgeCost` signature.

---

## Phase 1 — Act 1: BFS & DFS (Day 3–4)

**Build** (`src/algorithms/bfs.ts`, `dfs.ts`)
- `bfs(g, start, goal?, trace?)` → `{ reachable:Set<number>, parent:Map, path, edgeCount }`. Minimum-edge path via parent backtrace. Uses a queue + visited + parent (spec §5.1).
- `dfs(g, start, trace?)` → discovery/finish times, `hasCycle`, `components`, `deadEnds`. A dead end = non-mandatory vertex from which finish is unreachable without reversing (spec §5.1). Use the stack/recursion with visited + discovery arrays.
- **Bounded** alternative-path enumeration (spec §5.1 "important correction"): `enumerateSimplePaths(g, s, t, maxPaths, maxLen)` — DFS with a hard route-count and length cap so it can never blow up exponentially. Document the limits.

**Tests**
- Connected, disconnected, cyclic, branching, single-vertex graphs (spec §9.1).
- BFS returns provably minimum edge count (compare to brute force on tiny graph; verify the §5.1 example: direct S–T (1 edge) chosen over S–A–B–T (3 edges) even though distance differs).
- DFS detects a known cycle and a known dead end.
- Unreachable target: returns `found:false`, no throw, no infinite loop.

**Acceptance:** all Act-1 tests pass; `trace.counters` report `visitedVertices`/`examinedEdges`.

**Hand-off to B:** `bfs`/`dfs` results for the Track Explorer (reachable checkpoints list, unreachable report, cycle/dead-end highlight).

---

## Phase 2 — Act 2: Dijkstra & A\* (Day 5–7)

**Build** (`src/algorithms/dijkstra.ts`, `astar.ts`, `route.ts`)
- Binary min-heap (`src/core/BinaryHeap.ts`) — reused by A\*, events, top-k. O(log n) push/pop. Write it once, well-tested.
- `dijkstra(g, start, goal, cost, trace?)` — O((V+E) log V). Skip blocked edges. Record expanded vertices, relaxed edges, heap ops, final cost.
- `aStar(...)` with admissible/consistent heuristic from the contract. Ship **consistent** (no reopening); leave a documented flag for the reopening path.
- `planCheckpointRoute(...)` — the checkpoint-aware wrapper: shortest path current→next required checkpoint, repeat through all in order, then finish. **Never skip a mandatory checkpoint** (spec §5.2). Recompute from current state after a block/cost change.

**Tests** (spec §5.2 list)
- source=target, unreachable target, blocked edges, equal-cost paths, zero-weight edges, long routes, immediate recalculation.
- Dijkstra optimal on every non-negative fixture (brute-force check on small graphs).
- A\* returns the **same optimal cost** as Dijkstra when heuristic conditions hold.
- A\* may expand fewer/equal/more vertices — assert *cost equality*, not fewer expansions (spec §5.2).
- Preset test: a fixture where Balanced/Speed/Economy/Safety choose different routes (feeds spec §3.3 demo and Challenge 2).
- Counter export matches what Experiment 2 needs.

**Acceptance:** routing correct + instrumented; `displayedCost === result.cost` invariant holds.

**Hand-off to B:** `planCheckpointRoute` + `PathResult` for Route Planner; counters for the panel.

---

## Phase 3 — Act 3: DP & Greedy (Day 8–9)

**Build** (`src/algorithms/knapsack.ts`, `refuel.ts`, `greedy.ts`)
- `knapsack01(items, budget, trace?)` — full DP table, `dp[i][b]` recurrence (spec §5.3), reconstruction by tracing the table. Integer budget. Also provide O(B)-space value-only variant and note which the game uses.
- `refuelDP(legFuel, capacity, startFuel, stops, trace?)` — minimum additional stop time; buy `a` units with `0 ≤ a ≤ min(C−f, 40)`; feasible iff a reachable state reaches destination with non-negative fuel (spec §5.3 Problem B). **Fuel in integer tenths** (contract §5).
- `greedyKnapsack` — process zero-cost positive-benefit items first, then sort by v/c, deterministic tie-break by lower item id (spec §5.3).
- An `exhaustiveKnapsack` (2^m brute force) **in the test folder only** to validate DP on small instances.

**Tests**
- The supplied example (items A/B/C, budget 10): greedy=30, DP=48 (spec §5.3).
- **Two more team-created cases where greedy is strictly worse** (required, spec §5.3/§7).
- DP matches exhaustive search on all small instances.
- Refuel: insufficient fuel → infeasible flagged (no crash); full tank, unavailable station, capacity limit, zero-cost pickup (spec §9.1).
- Planner never returns a plan violating route/tank/availability/rules.

**Acceptance:** DP optimal & reconstructable; greedy deterministic; feasibility guaranteed.

**Hand-off to B:** resource-plan result for the Racing screen panel (recommended pickups, refuel stops).

---

## Phase 4 — Act 4: Events, MST, Backtracking, Opponents (Day 10–12)

**Build**
- `src/algorithms/mst.ts` — **Kruskal** with union-find (O(E log E)) *(pick one; we ship Kruskal)*. Used to build the undirected backbone during generation.
- `src/algorithms/generate.ts` — `generateCircuit(seed, params)`: place vertices → candidate undirected roads → **ensure connected** → MST backbone → add extra edges for cycles/alternatives/shortcuts → **backtracking** placement of checkpoints/services/obstacles → validate, retry up to a documented limit (spec §5.4). Add one-way roads *after* the backbone, then validate directed reachability.
- `src/engine/validator.ts` — rejects a track unless: ordered-checkpoint reachability, lap/return feasibility, ≥2 alternative start-finish routes where required, ≥1 feasible fuel plan (spec §5.4). Must be able to **reject** an invalid candidate and explain why (Challenge 1).
- `src/engine/EventHeap` + scheduler — min-heap keyed by `(triggerTime, priority, insertionSequence)` (spec §4.5). Lazy deletion for cancellation. Apply all same-trigger-time events in heap order *before* recalculating routes. Schedule expiry events deterministically.
- `src/engine/effects.ts` — the EffectLayer from contract §6.
- `src/engine/opponents.ts` — the 3 deterministic strategies (spec §4.4): (1) fixed main route + fixed detour; (2) shortcut-seeker, fall back to main; (3) min-distance, recompute on block. All obey checkpoint order, fuel, boundaries; refuel below 25%; shared recovery policy (wait/reroute/DNF, documented).
- `src/engine/RaceEngine.ts` — fixed-step `tick(dt)`; consumes routes/resources; processes the event heap; recomputes routes after graph changes **without restarting** (spec §5.4). Deterministic.

**Tests**
- Generated tracks pass the validator; a crafted invalid track is rejected with a reason (spec §5.4, Challenge 1).
- Event order verified against `(triggerTime, priority, insertionSequence)` incl. equal timestamps, priority ties, sequence ties, cancellation, expiration, missing target, overlapping effects (spec §9.1, Experiment 4).
- Overlapping effects: two oil spills on one edge; expiring one keeps the other (contract §6).
- Road closure mid-race triggers reroute, race continues.
- **Determinism replay:** run a full race twice with the same seed ⇒ byte-identical `results()`. This is the single most important test in the project.
- Opponents never skip a checkpoint, never go negative fuel, never leave the graph.

**Acceptance:** deterministic dynamic race runs end-to-end headless.

**Hand-off to B:** live `RaceState` snapshots each tick; event feed for HUD; generated circuits 2 & 3.

---

## Phase 5 — Act 5: Sorting & Top-k (Day 13)

**Build** (`src/algorithms/sort.ts`)
- `mergeSort` (stable, O(n log n)), `quickSort` (3-way partition, documented pivot), `heapSort` (in-place), `topK` (size-k heap, O(n log k)). All take the comparator; all record `comparisons` in trace.
- Championship aggregation in `src/engine/championship.ts`: award points (full 10-position table), update `ChampionshipEntry`, rank with `compareChampionship`.

**Tests** (spec §5.5, §9.1)
- Random, sorted, reverse-sorted, duplicate-heavy, empty, singleton inputs.
- **All three sorts produce identical arrays** (same comparator).
- Top-k equals first k of full sort for small k and k≈n.
- A fixture that forces the racer-ID tiebreaker (equal points/wins/positions/lap).

**Acceptance:** standings identical across sorts; top-k correct.

**Hand-off to B:** ranked standings + top-k for the Dashboard.

---

## Phase 6 — Experiments + bonus support (Day 14–15)

**Build** (`src/experiments/`) — see **[04_EXPERIMENTS.md](04_EXPERIMENTS.md)** for full detail.
- A `benchmark()` harness: warm-up, ≥5 timed runs, mean + median + stddev, excludes rendering/I/O (spec §7). Separate correctness checks from timed runs.
- The 5 experiments as Node scripts emitting CSV + JSON into `experiments-output/`.
- Expose data to B's Lab/Dashboard charts (shared JSON).
- **Bonus support:** Challenge 1 (track-gen already built — add the "show one rejected candidate" demo hook), Challenge 2 (preset comparison data), Challenge 3 (live top-k vs full-sort timing).

**Acceptance:** `npm run experiments` reproduces all 5 tables; raw CSV published (spec §9.3).

---

## Phase 7 — Hardening & report (Day 16–17)

- Push test coverage across the full spec §9.1 matrix (coordinate with B on integration tests).
- Write report sections 5 (algorithm design: pseudocode, structures, correctness reasoning, complexity) and 6 (integration: where each algorithm is invoked). Use a table mapping *algorithm → file → gameplay call site* — graders look for this.
- Distinguish **algorithms** from **supporting data structures** (the heap) in the report (spec §6).
- Verify every Phase gate still green on `main`.

### Your definition of done
- [ ] All 12 algorithms implemented once, instrumented, consumed by game + Lab + experiments.
- [ ] Determinism replay test passes.
- [ ] DP validated against exhaustive; 2 greedy-worse cases documented.
- [ ] 3 sorts + top-k agree via the single comparator.
- [ ] 5 experiments reproduce with raw data.
- [ ] Report algorithm/complexity/integration sections done.
