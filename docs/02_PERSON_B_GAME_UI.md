# 02 — Person B: Game Loop, UI & Visuals

> **You own:** `src/ui/`, `src/render/`, `src/state/`, `src/styles/`, and the wiring inside `src/engine/RaceEngine` that B drives (rendering loop, input).
> **Your mandate:** the 5 required screens, a smooth and *visually appealing* 2D top-down race, and the Algorithm Lab that visualizes **Person A's actual algorithm code** (not a copy).
> **Golden rule:** you never compute a route, cost, or sort yourself. You call Person A's functions (contract §7–§8) and render the result. If you feel tempted to write a `dijkstra` in `ui/`, stop — import it.

Each phase lists: *Build · Visual target · Tests · Acceptance*.

---

## Design language (decide in Phase 0, apply throughout)

Make it look intentional and modern — "cool" comes from consistency and motion, not clutter.

- **Theme:** dark neon "night circuit." Define CSS custom properties on `:root` and a light override; `body` gets an explicit background. (Tokens: `--bg`, `--surface`, `--accent` (electric cyan), `--accent-2` (magenta), `--track`, `--danger`, `--text`.)
- **Type:** one display font for headings (e.g. a geometric/techno face via Google Fonts), one readable UI font. Load only from Google Fonts.
- **Canvas look:** glow via `shadowBlur`, soft grid background, rounded road polygons, car sprites with a subtle trail, checkpoint rings that pulse, nitro = screen-edge speed lines, events = animated icons.
- **Motion:** every state change animates (ease-out ~200ms). Route reveal draws progressively. Counters tick up. Keep 60fps — interpolate between engine snapshots; never block the loop.
- **Accessibility:** ≥4.5:1 text contrast, ≥44px touch targets, don't encode info by color alone (use icon+label). Runs down to phone width with a 16px gutter, no horizontal scroll.

> You may prototype the look in Figma first (the Figma MCP tools are available) or jump straight to CSS. Keep a tiny component kit (`ui/components/`) so all screens share buttons, panels, chips, and the stat tile.

---

## Phase 0 — Shell & foundations (Day 1–2)

**Build**
- App bootstrap: a root `App` with a **state machine** (`state/AppState.ts`): `MainMenu → TrackExplorer → Racing → Dashboard`, plus `AlgorithmLab` reachable from the menu. One active screen at a time; clean mount/unmount.
- `render/Canvas.ts` — resize-aware canvas, device-pixel-ratio scaling, a `Camera` (pan/zoom/world↔screen), and a fixed render loop (`requestAnimationFrame`) decoupled from the engine's fixed-step tick.
- `render/GraphRenderer.ts` — draw vertices (typed icons) and edges (color by status/difficulty) from a `Graph`. This is reused by Track Explorer, Racing, and Lab.
- The design-system CSS + component kit.
- Render Person A's `circuit1` fixture as the first visible milestone.

**Visual target:** the menu looks finished; `circuit1` renders with glow and a readable legend.

**Tests:** component smoke tests (render without throwing); world↔screen transform round-trips; state machine transitions.

**Acceptance:** `npm run dev` shows a styled Main Menu and a rendered graph.

---

## Phase 1 — Screen 2: Track Explorer / Route Planner (Day 3–4)

**Build** (`ui/screens/TrackExplorer.ts`)
- Select any start/destination vertex (click on canvas).
- Call A's `bfs`/`dfs`; show **reachable checkpoints**, **report unreachable** destinations clearly, highlight **cycles** and **dead ends** from DFS.
- Side panel: list of mandatory checkpoints in order with reach status.
- "Explain" toggle that animates the BFS frontier expanding (reads A's `recordingTrace`).

**Visual target:** clicking two nodes animates the BFS wave; unreachable node shows a clear "No path" state, never a crash.

**Tests:** unreachable selection renders the empty state; disconnected fixture shows components distinctly.

**Acceptance:** spec §5.1 behaviors visible on screen; matches A's results exactly.

---

## Phase 2 — Route comparison & presets (Day 5–7)

**Build**
- Extend Track Explorer into the full **Route Planner**: compare **≥2 candidate routes**; show **distance, estimated time, and the exact scalar cost** A returned (contract: display === `result.cost`).
- Preset selector (Balanced/Speed/Economy/Safety) → re-runs A's routing with the preset weights; visibly show a circuit where presets pick **different routes** (spec §3.3, Challenge 2).
- A counters strip (expanded vertices, relaxed edges, heap ops) reading A's trace — same data Experiment 2 uses.
- Recompute + re-animate when an edge is blocked (hook a "block this road" dev button for now; real events arrive Phase 4).

**Visual target:** two routes drawn in contrasting colors with a compact comparison card; switching presets smoothly re-routes.

**Tests:** displayed cost equals `PathResult.cost` to the last decimal; preset switch changes the highlighted path on the designated circuit.

**Acceptance:** route comparison + presets + counters all correct and live.

---

## Phase 3 — Screen 3: Racing screen + game loop v1 (Day 8–9)

**Build** (`ui/screens/Racing.ts`, `render/RaceRenderer.ts`)
- Instantiate `RaceEngine` (A's façade). Render loop: each frame, read `engine.state`, interpolate car positions between the last two fixed-step snapshots, draw cars/roads/checkpoints.
- HUD: fuel bar, nitro charges, lap/checkpoint progress, race clock, mini route overlay.
- Human input: pick a planned route (from the Planner), activate nitro, refuel at a station. Route the human via A's `planCheckpointRoute`.
- **Resource panel:** show A's DP/greedy recommendation (pickups, refuel stops) and let the human accept it.

**Visual target:** a car drives a planned route smoothly at 60fps while the engine ticks at fixed step; fuel drains; reaching a checkpoint pulses it.

**Tests:** engine tick count vs rendered frames are independent (pause engine, loop still draws); HUD values equal `engine.state`.

**Acceptance:** a single human car completes a lap on `circuit1`; recommendations are the ones A's planner produced.

---

## Phase 4 — Opponents, live events, dynamics (Day 10–12)

**Build**
- Render A's 3 deterministic opponents with distinct colors/labels and trails.
- **Event feed/HUD:** when A's scheduler fires an event (road block, shortcut toggle, oil spill, speed cap, fuel toggle, nitro spawn), animate it on the track (icon + affected edge styling) and in a scrolling event log.
- Show live **route recalculation** when a closure hits the human's active route (A reroutes; you re-draw without restarting).
- Circuits 2 & 3: render A's generated tracks; a "Regenerate" control for the generator (seeded).
- Camera follows the human car; "overview" toggle to see the whole circuit.

**Visual target:** a closure drops onto the track, the affected road flashes red, the car's route re-draws to a detour — all mid-race, no stutter.

**Tests:** same seed ⇒ same visible race (pair with A's determinism replay — compare recorded state hashes); overlapping effects render both icons.

**Acceptance:** full 1 human + 3 AI race with live events on all 3 circuits.

---

## Phase 5 — Screen 5: Championship Dashboard (Day 13)

**Build** (`ui/screens/Dashboard.ts`)
- Standings table ranked by A's `compareChampionship`; per-race results; statistics.
- **Top-k view** (podium / "top 3") using A's `topK`.
- A control to **switch the sort method** (Merge/Quick/Heap) and show they produce the **identical** ranking (proof for the grader, ties to Experiment 5 and Challenge 3).
- Championship flow glue (`state/Championship.ts`): run races in order, accumulate points, declare champion after the final race (spec §2.2).

**Visual target:** animated standings (rows slide into rank), a celebratory champion reveal, a clean top-k podium.

**Tests:** switching sort method never changes the displayed order; top-k matches full-sort prefix.

**Acceptance:** complete championship over 3 circuits produces consistent standings and a champion.

---

## Phase 6 — Screen 4: Algorithm Lab + visual polish + charts (Day 14–15)

**Build** (`ui/lab/`)
- **Algorithm Lab:** step-through visualizer that calls **A's actual functions** with a `recordingTrace`, then animates the recorded `AlgoStep[]` — BFS frontier, Dijkstra/A\* expansion with the priority-queue contents, DP table filling cell by cell, a sort animating compares/swaps. Play / pause / step / speed. Live counter readouts.
  - **Enforce "same code as gameplay":** the Lab imports from `src/algorithms/`. A lint/test guard fails the build if `lab/` declares its own algorithm (spec §1, §2.1).
- **Experiment charts:** render A's experiment CSV/JSON with Chart.js inside the Lab/Dashboard (runtime vs n, A\* vs Dijkstra expansions, DP vs greedy benefit, heap ops vs event count, sort timings, top-k vs full sort).
- Full visual polish pass: transitions, empty states, loading, sound cues (optional, acknowledged), responsive check at phone width.

**Visual target:** the Lab feels like a teaching tool — you can *watch* Dijkstra relax edges and the heap reorder; charts look publication-quality.

**Tests:** Lab on a fixture produces the same final path/cost as a direct call to A's function (proves no divergence).

**Acceptance:** all 5 screens complete; Lab demonstrably runs gameplay code; charts render A's data.

---

## Phase 7 — Hardening, packaging, demo (Day 16–17)

**Build**
- Integration tests with A (full race, multiple laps, ordered checkpoints, DNF, road closure, standings — spec §9.1 Integration row).
- `npm run build` → static bundle; verify `npm run preview` works from a clean checkout.
- **README for graders** (`/README.md` already exists for us; add `SETUP.md`): Node version, `npm install`, `npm run dev`, `npm run build`, `npm run experiments`. Acknowledge fonts/assets/libraries used (spec §1, §9.3).
- Report sections 3 (system architecture & game flow) and 4 UI parts; capture screenshots/GIFs of each screen and the Lab for the report.
- Build the **demo script** with A (see `docs/05`): menu → explore/compare → race with an event → dashboard → Lab → one experiment.

### Your definition of done
- [ ] 5 screens complete, navigable, responsive, visually consistent.
- [ ] Race runs at 60fps with fixed-step deterministic engine underneath.
- [ ] Algorithm Lab visualizes A's real code (guard test passes).
- [ ] All 6 charts render from A's experiment data.
- [ ] Clean build + preview from fresh checkout; SETUP.md accurate.
- [ ] Report architecture/UI sections + screenshots done.
