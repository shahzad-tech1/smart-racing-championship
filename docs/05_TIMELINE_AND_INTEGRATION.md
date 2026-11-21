# 05 — Timeline, Integration & Delivery

> Window: **2026-11-21 → 2026-12-05** (deadline 11:59 PM). ~17 working days. This plan front-loads the algorithm core and integrates continuously so there is slack at the end for the report, polish, and the demo/viva.

Dates are targets; the **phase gates** are the hard checkpoints. Keep `main` green at every gate.

---

## Day-by-day schedule

| Days | Dates | Phase | Person A | Person B | Gate (merge to `main`) |
|---|---|---|---|---|---|
| 1–2 | Nov 21–22 | **0 Setup** | types, Graph, RNG, cost, instrumentation, circuit1 | app shell, state machine, canvas, GraphRenderer, design system | App boots + circuit1 renders + CI green |
| 3–4 | Nov 23–24 | **1 Act 1** | BFS, DFS, bounded paths | Track Explorer screen | Reachable/unreachable shown; §5.1 tests pass |
| 5–7 | Nov 25–27 | **2 Act 2** | Dijkstra, A\*, heap, checkpoint routing | Route Planner + presets + counters | Routes match; cost displayed==optimized |
| 8–9 | Nov 28–29 | **3 Act 3** | Knapsack DP, refuel DP, greedy | Racing screen + game loop v1 + resource panel | Car drives a plan; recommendations feasible |
| 10–12 | Nov 30–Dec 2 | **4 Act 4** | events/heap, MST, backtracking gen, validator, opponents, RaceEngine | opponents render, live events, reroute, circuits 2&3 | Deterministic full race with events |
| 13 | Dec 3 (AM) | **5 Act 5** | sorts, top-k, championship aggregation | Dashboard + championship flow | 3 sorts agree; champion declared |
| 14–15 | Dec 3 (PM)–Dec 4 | **6 Exp+Polish+Bonus** | 5 experiments + CSV + bonus data | Algorithm Lab + charts + visual polish | Experiments reproduce; Lab==gameplay |
| 16–17 | Dec 4–5 | **7 Hardening** | report §5–6, coverage | report §3–4, build/package, screenshots, demo | ZIP builds; smoke checklist passes |

> If a phase slips, protect the **mandatory core** (Phases 1–5). Cut from Phase 6 bonus and visual polish first, never from correctness or the 5 experiments.

---

## Integration checkpoints (how A and B stay in sync)

At the end of every phase, do a **15-minute integration ritual**:
1. Both push branches; open PRs; review each other's PR (required for the viva — both must understand the whole system).
2. Merge both into `main`.
3. Run the gate: `npm run lint && npm test && npm run build`.
4. Manually click through the new capability on `npm run dev`.
5. Tag `phaseN-done`. Update the checklist below.
6. If a contract changed, confirm `docs/00_SHARED_CONTRACTS.md` has the change + changelog row.

**Daily (5 min) standup:** what each finished, what's blocked, any contract change needed. Contract changes are the only thing that can silently break the other person — surface them immediately.

### Phase gate checklist
- [ ] Phase 0 — boots, renders, CI green
- [ ] Phase 1 — BFS/DFS on screen, §5.1 tests
- [ ] Phase 2 — routing + presets + cost invariant
- [ ] Phase 3 — race loop + feasible resource plans
- [ ] Phase 4 — deterministic race + events + 3 circuits
- [ ] Phase 5 — standings + top-k + champion
- [ ] Phase 6 — experiments + Lab (==gameplay) + charts
- [ ] Phase 7 — report + package + smoke checklist

---

## Bonus phase (Section 8) — do only after Phase 5 is solid

Two of three are nearly free because the mandatory work already builds them:
- **Challenge 1 — Automatic track generation:** already built in Phase 4 (`generateCircuit`). Add a demo that shows **one invalid candidate rejected by the validator** with the reason (spec §8). ~0.5 day.
- **Challenge 2 — Multi-objective routing:** already built via presets in Phase 2. Add the written explanation of the limitation of a single weighted scalar, and a before/after showing weight change → route change. ~0.5 day.
- **Challenge 3 — Live championship analytics:** live top-k via heap vs full sort, display top racers (Phase 5 + Experiment 5). Add the k-vs-n discussion. ~0.5 day.

Put bonus write-ups in report §9 ("advanced challenges completed").

---

## Report assembly (spec §9.2) — split

| Section | Owner |
|---|---|
| 1 Title page (group, section, reg numbers) | Both |
| 2 Introduction & problem statement | B drafts |
| 3 System architecture & game flow | B |
| 4 Graph/data models, assumptions, cost normalization, game rules | A (models/cost) + B (rules UI) |
| 5 Algorithm design: pseudocode, structures, correctness, complexity | A |
| 6 Integration: where each algorithm is invoked (algorithm→file→call-site table) | A |
| 7 Testing strategy, cases, results (use the §9.1 matrix) | Both |
| 8 Five experiments with tables/charts + interpretation | A (B: charts) |
| 9 Limitations, advanced challenges, future work | Both |
| 10 Conclusion, references/acknowledgements (fonts, libraries, assets) | Both |

Export the report to **PDF** (spec §9.3). Keep it factual: distinguish algorithms from the supporting heap data structure (spec §6); separate theoretical complexity from measured runtime (spec §7).

---

## Final deliverables (spec §9.3) & submission

ZIP name: `24I-XXXX_24I-YYYY_24I-ZZZZ_Section.zip` (your actual reg numbers + section).

Contents:
- [ ] Executable game + full source (`src/`, config, no `node_modules` — include `package.json` + lockfile).
- [ ] `SETUP.md` with install/run instructions (Node version, `npm ci`, `npm run dev`, `npm run build`).
- [ ] Required assets + acknowledgements for any third-party fonts/libraries.
- [ ] Technical report (PDF).
- [ ] Algorithm visualization (the Lab) — integrated with the same implementations used in gameplay.
- [ ] Experimental results + raw CSV (`experiments-output/`).
- [ ] A short `HOW_TO_DEMO.md` (the demo script below).

**Before zipping:** fresh clone → `npm ci` → `npm run build` must succeed; run the Phase-7 smoke checklist in `docs/03`; scan the ZIP for missing files/corruption (spec §1).

---

## Demo & viva script (~6–8 min)

1. **Main Menu** → explain modes.
2. **Track Explorer:** pick two nodes, animate BFS; show reachable checkpoints + an unreachable report; point out a cycle and a dead end (DFS).
3. **Route Planner:** compare two routes; switch presets to show the route change (Challenge 2); read the counters.
4. **Racing:** start 1+3 race; show the DP/greedy recommendation; drive a planned route; **trigger a road closure** → live reroute without restart; use nitro.
5. **Dashboard:** standings via the comparator; switch Merge/Quick/Heap → identical order; top-k podium (Challenge 3); declare champion after 3 circuits.
6. **Algorithm Lab:** step Dijkstra/A\* showing the heap + expansions, and a DP table filling — emphasize it's the **same code** the car just used.
7. **Experiments:** show one chart + the raw CSV; state one theory-vs-measurement insight.

**Viva prep:** both members rehearse explaining *any* algorithm's complexity and its in-game call site (the §6 integration table is your crib sheet). Because you reviewed each other's PRs, you can both answer for the whole system — which is exactly what the viva checks.
