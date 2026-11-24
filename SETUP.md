# Setup & Run

## Prerequisites
- **Node.js 20 LTS** (see `.nvmrc`) and npm. Install from https://nodejs.org if `node --version` fails.

## Install
```bash
npm install
```

## Everyday commands
| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server at http://localhost:5173 |
| `npm test` | Run the Vitest suite once (unit + guards) |
| `npm run test:watch` | Re-run tests on change |
| `npm run typecheck` | TypeScript strict type check (no emit) |
| `npm run lint` | ESLint (incl. determinism rule) |
| `npm run build` | Typecheck + production bundle into `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run measure-refs` | Print normalization references + preset-divergence check (docs/06) |

## Quality gate (must pass before merging to `main`)
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
CI (`.github/workflows/ci.yml`) runs exactly this on every push and PR.

## Where things are
- `src/core/` — data types, Graph, seeded RNG, cost model, instrumentation (Person A)
- `src/algorithms/` — the 12 algorithms (Person A, Phases 1–5)
- `src/engine/` — race loop, events, opponents (Person A; Person B drives it)
- `src/data/circuits/` — circuit fixtures (`circuit1` authored; 2 & 3 generated in Phase 4)
- `src/ui/`, `src/render/` — screens & rendering (Person B)
- `src/experiments/` — benchmark harness + the 5 studies (Person A)
- `tests/` — Vitest unit tests and the architecture/determinism guards
- `docs/` — the full implementation plan (start at the root `README.md`)

> `src/main.ts` is a Phase-0 **placeholder** that renders `circuit1`. Person B replaces it with the real app shell in their Phase 0.
