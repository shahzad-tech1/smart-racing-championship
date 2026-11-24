# 07 — 3D Visual Upgrade: Implementation Plan

> Goal: a premium, cinematic 3D presentation of the *existing* game, driven by the *existing* engine and algorithms.
> Inspiration: `smart_racing_reference_images` (concept art, not a template).

## 1. What exists (inspected, not assumed)

| Area | Reality in the repo |
|---|---|
| Stack | TypeScript + Vite 5, Canvas 2D, Vitest (156 tests), Chart.js. No game engine. |
| Algorithms | `src/algorithms/` — all 12 families, optional `AlgoTrace` (counters + recorded steps). |
| Engine | `src/engine/RaceEngine.ts` — deterministic fixed-step sim over the graph; snapshots expose `edgeId`, `progress`, fuel, nitro, lap, checkpoint. |
| UI | `src/ui/screens/*` (5 screens), `src/ui/lab/AlgorithmLab.ts`, `src/render/*` (2D renderers), `src/styles/tokens.css`. |
| Guards | `core/algorithms/engine` may not import `ui/` or `render/`; no raw hex in `ui/render/state`; Lab must not declare its own algorithm. |

Gaps found that block the brief's "real data" rule (all fixed, additive only):

1. Nitro charges exist but **nothing activates them** — no 1.5× speed, no 2× fuel (spec §4.3).
2. The Racing screen **schedules no events**, so closures/oil/speed caps never happen in a race.
3. The 2D renderer lerps `edge.from → edge.to` regardless of travel direction (cars teleport on reverse edges).
4. Track Explorer and Lab are hard-wired to circuit 1; Lab covers 6 of the 12 algorithms.
5. Dashboard "Simulate race" uses `Math.random` fake results instead of the engine.
6. Lab A* used an ad-hoc `0.001` heuristic instead of `weightedHeuristic`.

## 2. Technology decision

**Add one dependency: `three`** (+ `@types/three`, dev). Canvas 2D cannot do lit, shadowed, reflective 3D; a game engine (Unity/Unreal/Babylon) would replace the architecture and break the Vite/TS/Vitest setup. Three.js is code-only, tree-shaken, lazy-loaded per screen, and its post-processing is already bundled. Nothing else is added.

## 3. Architecture (additive)

```
src/
  render3d/            NEW — pure view layer; never imports engine internals or algorithms
    Stage.ts           renderer + composer (bloom, cinematic pass, DOF), adaptive resolution, WebGL detection
    CinematicPass.ts   vignette / grain / radial speed blur / chromatic fringe / fade
    procedural.ts      canvas textures, sky dome, environment map
    ParticlePool.ts    smoke, sparks, nitro flame, rain
    CarModel.ts        procedural racing car: wheels, suspension, lights, nitro
    heightField.ts     deterministic terrain height (pure, unit-tested)
    TrackWorld.ts      Graph -> 3D circuit (roads, curbs, barriers, bridges, scenery, gates, services, closures)
    GraphOverlay.ts    3D graph nodes/edges + algorithm states over the circuit
    views/GarageView.ts  CircuitView.ts  RaceView.ts  LabView.ts  PodiumView.ts
  ui/hud/              NEW — DOM HUD (speedometer, tower, minimap, event feed, toasts)
  state/Settings.ts    NEW — quality / weather / motion / 2D fallback (persisted)
  state/session.ts     NEW — shared Championship session across Racing <-> Dashboard
  data/raceEvents.ts   NEW — deterministic event schedule per circuit
```

Existing screens keep their logic. Each screen tries the 3D view and falls back to the untouched 2D renderer if WebGL is unavailable or the user picks "2D mode" in Settings.

### Data flow (rendering never feeds back into the sim)

```
RaceEngine.tick(1/60) -> engine.state (snapshots) -> RaceView interpolates/smooths -> meshes
Graph (status, active)  -------------------------> TrackWorld.sync(): barricades, closures, pickups
algorithm(trace) -> AlgoStep[] -> LabView.apply(step) -> node/edge/bar/table states
```

## 4. Engine/algorithm changes (minimal, tested, behaviour-preserving)

- `RaceEngine.activateNitro(racerId)`; snapshot gains `nitroActive`. Speed ×1.5 for 4 s, fuel ×2 on the nitro portion. Unused => identical results (determinism tests untouched).
- Trace payloads gain optional fields only (`relax.to/g`) and sorts record `swap`/`write`; counters and results are unchanged.
- `placeObstacles` (backtracking) is exported with an optional trace so the Lab can show the real placement/pruning.
- `BinaryHeap.snapshot()` read-only accessor for the heap view.

## 5. Screens

1. **Main Menu — Cinematic Garage.** Dark luxury garage, reflective wet floor, rect-area lights, smoke, DOF. Camera: wide → dolly → orbit; menu reveals staggered; hover nudges orbit; selecting dollies the camera and fades.
2. **Track Explorer — Circuit World.** Elevated orbit camera over a full 3D circuit (bridges for shortcuts, gates, fuel, nitro, closures). BFS/DFS/Dijkstra/A\* animate over the graph; primary/secondary routes flow; a ghost car drives the chosen route. All 3 circuits selectable.
3. **Racing — Full 3D.** Four cars on engine state, chase / elevated / cinematic-replay cameras, DOM HUD, live events (closure barricades drop in, oil, speed caps, nitro), nitro flames + speed blur, tire smoke, scrape sparks, reroute overlay.
4. **Algorithm Lab.** All 12 algorithms on real traces: 3D graph (BFS/DFS/Dijkstra/A\*/MST), 3D DP table + greedy, backtracking ring, event heap tree, 3D sort bars. Play/pause/step/reset/speed, complexity, metrics. Sample data is badged `SAMPLE`.
5. **Championship.** 3D trophy + podium rising, spotlight, confetti, top-k from the real heap; animated Merge/Quick/Heap sort race; standings come from real engine races.

## 6. Performance budget

- Static scenery is instanced; one shadow-casting light; single bloom pass at half resolution.
- Adaptive pixel ratio: drops resolution automatically after sustained >22 ms frames; Settings: Low / Medium / High.
- Lazy chunk per screen; `three` loads only when a 3D screen opens.
- Zero per-frame allocation in car/particle loops; engine tick stays fixed-step and independent of render rate.

## 7. Verification

`npm run typecheck`, `npm test` (existing 156 + new), `npm run build`, headless-Chrome screenshots of every screen with console-error capture.
