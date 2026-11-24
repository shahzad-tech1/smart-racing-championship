# Smart Racing Championship — Implementation Plan

> **Course:** Design & Analysis of Algorithms (Semester 5)
> **Deliverable:** A 2D top-down racing game that demonstrates 12 mandatory algorithm families with a functional role in gameplay.
> **Deadline:** 05 December 2026, 11:59 PM
> **Team size:** 2 developers. **Each owns six of the twelve algorithm families AND a share of the frontend** (see §0.5).
> Person A = *Routing & Track* · Person B = *Resources, Events & Standings*
> **Stack:** TypeScript + HTML5 Canvas, built with Vite, tested with Vitest, charts with Chart.js.

This repository's `docs/` folder is the **single source of truth** for how we build the project. Read this file first, then your personal README.

---

## 0. The one rule that governs everything

> **Every mandatory algorithm must have ONE implementation, living in `src/algorithms/`, that is called by (a) gameplay, (b) the Algorithm Lab screen, and (c) the experiment harness.**

The spec says a *detached duplicate demonstration does not satisfy integration* (PDF §1). If the Lab and the game run different copies of Dijkstra, we lose marks and risk divergent bugs. **No algorithm is ever copy-pasted.** The Lab visualizes the *same* function the car drives on.

To make this possible, each algorithm accepts an optional `trace`/`counters` object. Gameplay ignores it; the Lab and experiments read it. See `docs/00_SHARED_CONTRACTS.md`.

---

## 0.5 Division of work (two members)

| | **Person A — Routing & Track** | **Person B — Resources, Events & Standings** |
|---|---|---|
| **Algorithms (6 each)** | BFS · DFS · Dijkstra · A\* · Kruskal MST · Backtracking | DP (knapsack, refuel, fuel-stop planner) · Greedy · Heap/priority queue · Merge Sort · Quick Sort · Heap Sort |
| **Core code** | `core/Graph`, `core/cost`, `core/UnionFind`, `data/circuits`, `engine/validator` | `core/BinaryHeap`, `engine/RaceEngine`, `EventScheduler`, `effects`, `rules`, `comparator`, `championship`, `data/raceEvents` |
| **Experiments** | 1 BFS/DFS · 2 Dijkstra/A\* | 3 DP/Greedy · 4 Event priority queue · 5 Sorting and top-k |
| **Frontend (screens)** | 1 Main Menu (3D garage) · 2 Track Explorer / Route Planner · 3 Racing Screen (3D race, HUD, cameras) | 4 Algorithm Lab · 5 Championship Dashboard (standings, podium, sort race) |
| **Frontend (shared system)** | `render3d/` world: Stage, GarageView, RaceView, TrackWorld, CarModel · `styles/hud.css` | `styles/tokens.css`, `ui/components`, `ui/App`, `state/`, `render/` (2D fallback), Settings |
| **Report sections** | §4 data model and cost normalisation · §5-§6 for A's algorithms · §8 experiments 1-2 | §3 architecture and game flow · §5-§6 for B's algorithms · §8 experiments 3-5 · §9 limitations |

Details: [docs/01_PERSON_A_WORKPLAN.md](docs/01_PERSON_A_WORKPLAN.md) and [docs/02_PERSON_B_WORKPLAN.md](docs/02_PERSON_B_WORKPLAN.md). Every file is reviewed by the other member, because the viva covers the whole system.

---

## 1. What we are building (from the spec)

| Requirement | Minimum | Where it lives |
|---|---|---|
| Playable circuits | 3 distinct topologies | `src/data/circuits/` + generator |
| Mandatory checkpoints | 10 per circuit (ordered) | Circuit data + validator |
| Shortcuts | 2 per circuit | Circuit data (`isShortcut`) |
| Racers | 1 human + ≥3 deterministic AI | `src/engine/` |
| GUI screens | 5 (Menu, Track Explorer, Racing, Algorithm Lab, Dashboard) | `src/ui/screens/` |
| Mandatory algorithms | 12 families | `src/algorithms/` |
| Experiments | 5 studies with tables/charts | `src/experiments/` |
| Advanced challenges | 3 (bonus) | Phase 6 |

**The 12 algorithms:** BFS, DFS, Dijkstra, A\*, DP (0/1 Knapsack + refuelling), Greedy, Backtracking, Prim **or** Kruskal (MST), Heap/Priority Queue, Merge Sort, Quick Sort, Heap Sort.

**The 5 screens:** Main Menu · Track Explorer / Route Planner · Racing Screen · Algorithm Lab / Visualization · Championship Dashboard.

---

## 2. Architecture at a glance

```
src/
  core/            # Graph, cost model, UnionFind [A] · BinaryHeap, RNG, types [B]
  algorithms/      # BFS DFS Dijkstra A* MST Backtracking [A] · DP Greedy Sorts [B]
  engine/          # validator [A] · race loop, fuel/nitro, events, comparator, championship [B]
  experiments/     # exp1-2 [A] · exp3-5, harness [B]
  ui/
    screens/       # MainMenu, TrackExplorer, Racing [A] · Dashboard [B]
    components/    # shared HUD/panel components                            [B]
    lab/           # Algorithm Lab                                          [B]
  render3d/        # Stage, Garage, Race, Track, Car [A] · Podium [B]
  render/          # 2D Canvas fallback renderers                           [B]
  state/           # app state machine, settings, session                   [B]
  styles/          # hud.css [A] · tokens.css [B]
tests/             # each member owns the tests of their own algorithms (see work plans)
docs/              # THIS PLAN
assets/            # sprites, fonts, sounds (acknowledged in report)
```

**Boundary discipline:** `ui/` and `render/` may *import from* `algorithms/`, `engine/`, `core/`. The reverse is forbidden — **no algorithm or engine file may import anything from `ui/` or `render/`.** This keeps the DAA core testable headless and prevents UI bugs from corrupting algorithm results. An ESLint rule enforces this (Phase 0).

The complete, frozen interface contracts (types, cost function, comparator, counter objects) are in **[docs/00_SHARED_CONTRACTS.md](docs/00_SHARED_CONTRACTS.md)** — **read it before writing any code.** Changing a contract requires both people to agree in writing (a commit to that file).

---

## 3. The documents in this plan

| File | Owner | Purpose |
|---|---|---|
| [docs/00_SHARED_CONTRACTS.md](docs/00_SHARED_CONTRACTS.md) | Both | Frozen types, cost model, the master comparator, counter interfaces. The contract between A and B. |
| [docs/01_PERSON_A_WORKPLAN.md](docs/01_PERSON_A_WORKPLAN.md) | Person A | Routing & Track: 6 algorithms, experiments 1-2, Menu / Track Explorer / Racing screen. |
| [docs/02_PERSON_B_WORKPLAN.md](docs/02_PERSON_B_WORKPLAN.md) | Person B | Resources, Events & Standings: 6 algorithms, experiments 3-5, Algorithm Lab / Championship / design system. |
| [docs/03_TESTING_AND_DEBUGGING.md](docs/03_TESTING_AND_DEBUGGING.md) | Both | Test matrix mapped to spec §9.1, debugging playbook, determinism guards. |
| [docs/04_EXPERIMENTS.md](docs/04_EXPERIMENTS.md) | A: exp 1-2 · B: exp 3-5 | The 5 required experiments, metrics, and report format. |
| [docs/05_TIMELINE_AND_INTEGRATION.md](docs/05_TIMELINE_AND_INTEGRATION.md) | Both | Day-by-day schedule, integration checkpoints, demo/viva/report prep. |
| [docs/06_COST_MODEL_DEFENSE.md](docs/06_COST_MODEL_DEFENSE.md) | Person A | Justifies the normalization references & preset weights (report §4). Reproduced by `src/experiments/measure-refs.ts`. |

---

## 4. Phase overview (shared)

Both developers move through the same 7 phases in lockstep so that integration happens continuously, not at the end. Each phase ends with an **integration checkpoint** where both branches merge and the acceptance tests pass.

| Phase | Theme | Person A (Routing & Track) | Person B (Resources, Events & Standings) | Gate |
|---|---|---|---|---|
| **0** | Setup & contracts | Graph, cost model, circuit 1, Stage + Garage scene | Types, RNG, BinaryHeap, tokens, app shell, state machine | App boots; menu renders in 3D; CI green |
| **1** | Act 1 - Reachability | BFS + DFS (+cycles, dead ends, components) + Track Explorer screen | Instrumentation / trace format + Lab skeleton that replays traces | Reachable checkpoints shown; unreachable handled |
| **2** | Act 2 - Routing | Dijkstra + A\* + checkpoint routing + route comparison and presets | Event scheduler (heap) + `RaceEngine` loop consuming A's routing | Routes match; displayed cost == optimised cost |
| **3** | Act 3 - Resources | Racing screen: 3D cars, HUD, cameras | DP (knapsack, refuel, fuel-stop planner) + Greedy + fuel and station rules in the engine | Plans feasible in a real race; car drives a route |
| **4** | Act 4 - Dynamics | Kruskal MST + Backtracking track generation + validator, circuits 2-3 + live-event visuals | Overlapping effects, nitro, DNF/recovery policy, opponents | Deterministic events; closure reroutes mid-race |
| **5** | Act 5 - Standings | "Race this plan" hand-off into the race | Merge/Quick/Heap sort + top-k + Championship Dashboard and scoring | 3 sorts agree; top-k == full-sort prefix |
| **6** | Experiments + polish + **bonus** | Experiments 1-2 + visual polish of menu / explorer / race | Experiments 3-5 + Algorithm Lab + charts | Experiments reproduce; Lab = gameplay code |
| **7** | Hardening | Report sections 4, 5-6 (A's algorithms), 8 (exp 1-2) + demo script | Report sections 3, 5-6 (B's algorithms), 8 (exp 3-5), 9 + packaging | ZIP builds; full race completes; viva-ready |

Scope, files and definition of done per member are in `docs/01_PERSON_A_WORKPLAN.md` and `docs/02_PERSON_B_WORKPLAN.md`; the day-by-day schedule is in `docs/05_TIMELINE_AND_INTEGRATION.md`.

---

## 5. Getting started (both, Phase 0, day 1)

```bash
# prerequisites: Node.js 20 LTS, Git
npm create vite@latest smart-racing -- --template vanilla-ts
cd smart-racing
npm install
npm install -D vitest @vitest/ui eslint typescript-eslint eslint-plugin-boundaries
npm install chart.js
npm run dev        # http://localhost:5173
```

Key scripts (define in `package.json`):

```jsonc
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "lint": "eslint src",
  "experiments": "tsx src/experiments/run-all.ts"   // Node-run, headless
}
```

**TypeScript must be `"strict": true`.** Strict mode catches the null/undefined and type-mismatch bugs that would otherwise surface as silent wrong answers in an algorithm. This is non-negotiable (see spec: *implementation should not contain any fault that may break the product*).

---

## 6. Non-negotiable quality gates (prevents a broken product at the end)

1. **Determinism:** no `Math.random()` anywhere in `engine/` or `algorithms/`. Use the seeded RNG from `core/rng.ts`. Opponents and track-gen must be reproducible (spec §4.4). A test replays a race twice and asserts identical results.
2. **Single comparator:** all three sorts and top-k import the *same* `compareChampionship` (spec §4.6). A test asserts their outputs are identical on every fixture.
3. **Cost shown == cost optimized:** the number the Route Planner displays is the exact value Dijkstra minimized (spec §3.3). A test asserts `displayedCost === algorithmCost`.
4. **Lab == gameplay:** the Lab imports algorithms from `src/algorithms/` — never a reimplementation. A grep/lint check fails the build if `lab/` defines its own `dijkstra`.
5. **No crashes on edge inputs:** unreachable targets, empty graphs, insufficient fuel, simultaneous events — all return a defined result, never throw or infinite-loop. Covered by the test matrix in `docs/03`.
6. **CI gate:** every merge to `main` must pass `npm run lint && npm test && npm run build`. Set up GitHub Actions in Phase 0. Nothing merges red.

---

## 7. Git workflow

- `main` is always green and demo-able. Protect it.
- Branch per phase per person: `A/phase2-dijkstra`, `B/phase2-route-planner`.
- Small commits; PRs reviewed by the other person (the viva requires *both* members understand the *whole* system — review is how that happens).
- At each phase gate, merge both branches into `main`, run the gate, tag it `phaseN-done`.
- Never force-push `main`. Keep `docs/00_SHARED_CONTRACTS.md` changes in their own commits so the diff is obvious to both of you.

---

## 8. Risk register (read once, revisit at each gate)

| Risk | Impact | Mitigation |
|---|---|---|
| Contract drift between A and B | Integration breaks late | Freeze contracts in Phase 0; changes need both signatures |
| Non-determinism creeps in | Opponents desync, experiments unreproducible | Seeded RNG + replay test from Phase 0 |
| Algorithm duplicated in Lab | Marks lost, divergent bugs | Lint check + architecture boundary rule |
| Floating-point fuel in DP | State space explodes / infinite | Scale to integer "tenths" units (spec §4.3), documented |
| Checkpoint order skipped by router | Illegal laps | Leg-by-leg routing; dedicated test |
| Scope creep on visuals | Miss algorithm deadlines | Visual polish is Phase 6; function first |
| Doing bonus before mandatory is solid | Risk core | Bonus is Phase 6, gated on Phase 5 passing |

Start with **[docs/00_SHARED_CONTRACTS.md](docs/00_SHARED_CONTRACTS.md)**.
