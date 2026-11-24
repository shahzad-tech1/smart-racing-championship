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
| Chart.js | ^4.4.6 | Experiment charts in Algorithm Lab |
| Vite | ^5.4 | Build tool |
| Vitest | ^2.1 | Test runner |
| TypeScript | ^5.6 | Language |

Fonts are loaded at runtime from Google Fonts (Big Shoulders Display, IBM Plex Sans, IBM Plex Mono). An internet connection is required for the first load; subsequent loads use the browser cache.

## Project structure

```
src/
  algorithms/   — Person A: BFS, DFS, Dijkstra, A*, DP, Greedy, MST, Backtracking, sorts
  core/         — Person A: Graph, cost model, instrumentation, RNG, types
  data/         — Person A: circuit fixtures and registry
  engine/       — Person A: RaceEngine, comparator, effects, scheduler, rules, validator
  experiments/  — Person A: five experiment harnesses
  render/       — Person B: Canvas, Camera, GraphRenderer, RaceRenderer
  state/        — Person B: AppStateMachine, Championship
  styles/       — Person B: tokens.css (all CSS custom properties)
  ui/           — Person B: App, screens, components, lab
  main.ts       — Entry point (Person B)
```

## Screens

| Screen | How to reach |
|---|---|
| Main Menu | Start page; shows circuit1 map |
| Track Explorer | "Track explorer" from menu; click vertices to run BFS/DFS; switch to "Plan route" for Dijkstra |
| Race | "Race" from menu; select circuit, then race |
| Championship | "Championship" from menu; simulate races or run them live |
| Algorithm Lab | "Algorithm lab" from menu; select an algorithm and step through its execution |
