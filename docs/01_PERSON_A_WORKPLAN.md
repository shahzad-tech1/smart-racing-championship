# 01 — Person A: Routing & Track (6 algorithms) + Menu, Track Explorer, Racing screen

> Team of two. **Both members own algorithms AND frontend.** Person A owns the graph/routing/track half of the algorithms and the *world-facing* half of the frontend. Person B's plan is [02_PERSON_B_WORKPLAN.md](02_PERSON_B_WORKPLAN.md). The shared contract is [00_SHARED_CONTRACTS.md](00_SHARED_CONTRACTS.md).
> The viva needs both of you to understand everything: review each other's pull requests.

## A.1 Algorithms (spec §6 checklist rows 1, 2, 3, 4, 7, 8)

| # | Family | Role in the game | Files |
|---|---|---|---|
| 1 | BFS | reachability, minimum-edge path, validator reachability | `src/algorithms/bfs.ts` |
| 2 | DFS | traversal, cycles, components, dead ends; bounded alternative routes | `src/algorithms/dfs.ts`, `paths.ts` |
| 3 | Dijkstra | every racer's route; checkpoint legs; refuel-station routing | `src/algorithms/dijkstra.ts`, `route.ts`, `pathTypes.ts` |
| 4 | A\* | Track Explorer comparison; the player's route when "A\*" is chosen | `src/algorithms/astar.ts` |
| 7 | Backtracking | obstacle/checkpoint placement in track generation | `src/algorithms/generate.ts` |
| 8 | Kruskal MST | backbone of generated circuits | `src/algorithms/mst.ts`, `src/core/UnionFind.ts` |

Supporting code owned by A: `src/core/Graph.ts`, `src/core/cost.ts` (normalisation, presets, Restricted-edge rule), `src/data/circuits/*`, `src/engine/validator.ts`.

**Experiments:** 1 (BFS/DFS) and 2 (Dijkstra/A\*) — `src/experiments/exp1-bfs-dfs.ts`, `exp2-dijkstra-astar.ts`, `measure-refs.ts`, `docs/06_COST_MODEL_DEFENSE.md`.

**Tests A owns:** `tests/algorithms/{bfs,dfs,paths,routing,mst,generate,traces}.test.ts`, `tests/core/{graph,cost,unionfind}.test.ts`, `tests/engine/validator.test.ts`, and in `tests/spec/pdf-algorithms.test.ts` the sections *§3.3 cost*, *§5.1 BFS/DFS*, *§5.2 Dijkstra/A\**, *§5.4 MST*, plus the circuit checks in `tests/spec/pdf-engine.test.ts` (Part 1).

## A.2 Frontend (spec §2.1 screens 1, 2, 3)

| Screen | What A builds | Files |
|---|---|---|
| 1 Main Menu | cinematic 3D garage, navigation, settings/help modals, livery picker | `src/ui/screens/MainMenu.ts`, `src/render3d/GarageView.ts`, `Stage.ts`, `CarModel.ts`, `procedural.ts`, `ParticlePool.ts` |
| 2 Track Explorer / Route Planner | 3D circuit, pick start/goal, replay BFS/DFS/Dijkstra/A\*, presets, counters, **"Race this plan"** hand-off | `src/ui/screens/TrackExplorer.ts` (+ `TrackExplorerClassic.ts`), `src/render3d/GraphOverlay.ts` |
| 3 Racing Screen | 3D race view, chase/hood/TV/top cameras, HUD (lap, checkpoint, fuel, nitro, timing tower, minimap, event feed), results overlay | `src/ui/screens/Racing.ts` (+ `RacingClassic.ts`), `src/render3d/RaceView.ts`, `TrackWorld.ts`, `ribbon.ts`, `heightField.ts`, `props.ts`, `src/styles/hud.css` |

Rule: the UI never computes a route or cost itself — it calls the algorithm functions and draws the result.

## A.3 Interfaces A provides to B
- `dijkstra`, `aStar`, `planCheckpointRoute`, `costFn(PRESETS[...])` with optional `AlgoTrace` (B's Lab replays these traces).
- `Graph` + circuit registry (`CIRCUITS`), `validateCircuit`.
- `session.plan` (set by Track Explorer, read by Racing) → `RaceConfig.humanPlan` (B's engine applies it).

## A.4 Definition of done
- [ ] Six algorithms implemented once, instrumented, used by gameplay, Lab and experiments.
- [ ] Every circuit passes the validator; presets pick different routes on at least one circuit.
- [ ] Experiments 1 and 2 reproduce with raw data (`npm run experiments`).
- [ ] Menu, Track Explorer and Racing screen work in 3D and in the 2D fallback.
- [ ] Report sections: §4 (graph/data model, cost normalisation), §5 and §6 for A's six algorithms, §8 for experiments 1–2.
