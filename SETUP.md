# Setup guide

## Requirements

- Node.js 20 or later
- npm 10 or later

## Install

```bash
npm install
```

## Develop

```bash
npm run dev
```

Opens at http://localhost:5173. The app shows a Main Menu with the circuit map as hero. Navigate to any screen from the menu.

## Build

```bash
npm run build
```

Output is in `dist/`. Requires TypeScript to pass with no errors first.

## Preview the production build

```bash
npm run preview
```

## Tests

```bash
npm test
```

Runs the full Vitest suite (algorithm, engine, and UI tests). Expected: all tests pass.

## Experiments

```bash
npm run experiments
```

Runs all five experiment scripts and writes CSV + JSON output to `experiments-output/`.

## Libraries and fonts

| Library | Version | Purpose |
|---|---|---|
| three | ^0.170 | 3D rendering (garage, circuits, cars, podium). Loaded lazily; the only added runtime dependency |
| Chart.js | ^4.4.6 | Experiment charts in Algorithm Lab |
| Vite | ^5.4 | Build tool |
| Vitest | ^2.1 | Test runner |
| TypeScript | ^5.6 | Language |

All 3D art is generated in code (geometry, canvas textures, shaders): there are no external model, texture or audio files to license or download. three.js is MIT-licensed.

Fonts are loaded at runtime from Google Fonts (Big Shoulders Display, IBM Plex Sans, IBM Plex Mono). An internet connection is required for the first load; subsequent loads use the browser cache.

## Project structure

```
src/
  algorithms/   — A: BFS, DFS, Dijkstra, A*, Kruskal MST, Backtracking | B: DP (knapsack, refuel, fuel plan), Greedy, sorts
  core/         — A: Graph, cost model, UnionFind | B: BinaryHeap, instrumentation, RNG, types
  data/         — A: circuit fixtures and registry | B: race events, starting grid
  engine/       — A: validator | B: RaceEngine, comparator, effects, scheduler, rules, championship
  experiments/  — A: exp 1-2 | B: exp 3-5, harness
  render/       — B: Canvas, Camera, GraphRenderer, RaceRenderer (2D renderers, used as the fallback)
  render3d/     — A: Stage, TrackWorld, CarModel, Garage/Race views, GraphOverlay | B: Podium view, ranking
  state/        — B: AppStateMachine, Championship, Settings, session
  styles/       — B: tokens.css (all CSS custom properties) | A: hud.css
  ui/           — A: MainMenu, TrackExplorer, Racing | B: App, Dashboard, components, Algorithm Lab
  main.ts       — Entry point (B)

Work split: each member owns six algorithm families and a share of the frontend (README section 0.5).
```

## Screens

| Screen | How to reach |
|---|---|
| Main Menu | Start page: 3D garage, livery picker, Settings, Instructions |
| Track Explorer | "Track explorer": pick a circuit, start and goal on the 3D track, replay BFS / DFS / Dijkstra / A* step by step |
| Race | "Quick race": 3D race with HUD. `N` nitro, `C` or `1`-`4` cameras, `P` pause |
| Championship | 3D podium. Race circuits yourself or "Simulate race" (same engine, no randomness) |
| Algorithm Lab | 12 algorithms replayed from recorded traces; graph algorithms play out on the 3D circuit |

## Settings and fallback

Menu > Settings: quality (low / medium / high), weather (clear / rain), renderer (3D / 2D) and reduce motion. If WebGL is unavailable, or the renderer is set to 2D, Race and Track Explorer fall back to the original Canvas 2D screens. Rendering never feeds back into the simulation: results are identical in 2D and 3D.

See `docs/07_3D_VISUAL_PLAN.md` for the design and architecture of the 3D layer.
