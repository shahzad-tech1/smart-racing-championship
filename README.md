# Smart Racing Championship — Implementation Plan

> **Course:** Design & Analysis of Algorithms (Semester 5)
> **Deliverable:** A 2D top-down racing game that demonstrates 12 mandatory algorithm families with a functional role in gameplay.
> **Deadline:** 05 December 2026, 11:59 PM
> **Team size:** 2 developers (Person A = *Algorithms Core*, Person B = *Game & UI*)
> **Stack:** TypeScript + HTML5 Canvas, built with Vite, tested with Vitest, charts with Chart.js.

This repository's `docs/` folder is the **single source of truth** for how we build the project. Read this file first, then your personal README.

---

## 0. The one rule that governs everything

> **Every mandatory algorithm must have ONE implementation, living in `src/algorithms/`, that is called by (a) gameplay, (b) the Algorithm Lab screen, and (c) the experiment harness.**

The spec says a *detached duplicate demonstration does not satisfy integration* (PDF §1). If the Lab and the game run different copies of Dijkstra, we lose marks and risk divergent bugs. **No algorithm is ever copy-pasted.** The Lab visualizes the *same* function the car drives on.

To make this possible, each algorithm accepts an optional `trace`/`counters` object. Gameplay ignores it; the Lab and experiments read it. See `docs/00_SHARED_CONTRACTS.md`.

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
  core/            # pure data types, Graph class, RNG, math/normalization  [A]
  algorithms/      # BFS DFS Dijkstra A* DP Greedy Backtracking MST Heap Sorts [A]
  engine/          # race loop, rules, fuel/nitro, opponents, event scheduler [A+B]
  experiments/     # benchmark harness, 5 studies, CSV export               [A]
  ui/
    screens/       # the 5 screens                                          [B]
    components/    # buttons, panels, HUD, graph overlay                    [B]
    lab/           # algorithm step-through visualizer                      [B]
  render/          # Canvas renderer, camera, sprites, animations           [B]
  state/           # app state machine, navigation, save/load config        [B]
  styles/          # CSS design system / theme                              [B]
tests/             # Vitest unit + integration tests                        [A+B]
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
| [docs/01_PERSON_A_ALGORITHMS.md](docs/01_PERSON_A_ALGORITHMS.md) | Person A | Phase-by-phase build of the algorithm core + engine logic + experiments. |
| [docs/02_PERSON_B_GAME_UI.md](docs/02_PERSON_B_GAME_UI.md) | Person B | Phase-by-phase build of the 5 screens, renderer, visuals, game loop. |
| [docs/03_TESTING_AND_DEBUGGING.md](docs/03_TESTING_AND_DEBUGGING.md) | Both | Test matrix mapped to spec §9.1, debugging playbook, determinism guards. |
| [docs/04_EXPERIMENTS.md](docs/04_EXPERIMENTS.md) | Person A (B assists charts) | The 5 required experiments, metrics, and report format. |
| [docs/05_TIMELINE_AND_INTEGRATION.md](docs/05_TIMELINE_AND_INTEGRATION.md) | Both | Day-by-day schedule, integration checkpoints, demo/viva/report prep. |
| [docs/06_COST_MODEL_DEFENSE.md](docs/06_COST_MODEL_DEFENSE.md) | Person A | Justifies the normalization references & preset weights (report §4). Reproduced by `src/experiments/measure-refs.ts`. |

---

## 4. Phase overview (shared)

Both developers move through the same 7 phases in lockstep so that integration happens continuously, not at the end. Each phase ends with an **integration checkpoint** where both branches merge and the acceptance tests pass.

| Phase | Theme | Person A | Person B | Gate |
|---|---|---|---|---|
| **0** | Setup & contracts | Repo, tooling, data types, Graph class, RNG | Repo, app shell, navigation, design system, 1 hardcoded circuit rendered | App boots; graph renders; CI green |
| **1** | Act 1 — Reachability | BFS + DFS (+cycle/dead-end/components) | Track Explorer screen uses BFS/DFS results | Reachable checkpoints shown; unreachable handled |
| **2** | Act 2 — Routing | Dijkstra + A\* + cost model | Route Planner: compare routes, presets, counters | Routes match; recompute on block |
| **3** | Act 3 — Resources | DP (knapsack + refuel) + Greedy | Resource panel; Racing screen + game loop v1 | Plans feasible in-game; car drives a route |
| **4** | Act 4 — Dynamics | Event heap + MST + Backtracking track-gen + opponents | Live events, HUD, 3 AI racers rendered | Deterministic events; closure reroutes mid-race |
| **5** | Act 5 — Standings | Merge/Quick/Heap sort + Top-k | Dashboard, championship flow, scoring | 3 sorts agree; top-k == full-sort prefix |
| **6** | Experiments + polish + **bonus** | 5 experiments + CSV | Algorithm Lab visualizer + visual polish + charts | Experiments reproduce; Lab = gameplay code |
| **7** | Hardening | Report (algorithms/complexity), test coverage | Report (architecture/UI), packaging, demo script | ZIP builds; full race completes; viva-ready |

Detailed per-phase tasks, acceptance criteria, and tests are in each person's README and in `docs/05_TIMELINE_AND_INTEGRATION.md`.

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
