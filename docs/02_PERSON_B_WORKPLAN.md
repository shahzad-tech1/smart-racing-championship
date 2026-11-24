# 02 — Person B: Resources, Events & Standings (6 algorithms) + Algorithm Lab, Championship, design system

> Team of two. **Both members own algorithms AND frontend.** Person B owns the resource/event/ranking half of the algorithms and the *analysis-facing* half of the frontend. Person A's plan is [01_PERSON_A_WORKPLAN.md](01_PERSON_A_WORKPLAN.md). The shared contract is [00_SHARED_CONTRACTS.md](00_SHARED_CONTRACTS.md).
> The viva needs both of you to understand everything: review each other's pull requests.

## B.1 Algorithms (spec §6 checklist rows 5, 6, 9, 10, 11, 12)

| # | Family | Role in the game | Files |
|---|---|---|---|
| 5 | Dynamic programming | 0/1 knapsack, refuelling DP, and the fuel-stop planner every racer runs (`planFuelStops`) | `src/algorithms/knapsack.ts`, `refuel.ts`, `fuelPlan.ts` |
| 6 | Greedy | benefit/cost pickup selection, compared against the DP | `src/algorithms/greedy.ts` |
| 9 | Heap / priority queue | race-event scheduler `(triggerTime, priority, insertionSequence)`; top-k | `src/core/BinaryHeap.ts`, `src/engine/EventScheduler.ts` |
| 10 | Merge Sort | primary championship ranking | `src/algorithms/sort.ts` |
| 11 | Quick Sort | alternative ranking | `src/algorithms/sort.ts` |
| 12 | Heap Sort | third ranking | `src/algorithms/sort.ts` |

Supporting code owned by B: `src/engine/RaceEngine.ts` (fixed-step loop, fuel rules, nitro, DNF/recovery policy), `effects.ts` (overlapping effects), `rules.ts`, `comparator.ts`, `championship.ts`, `src/data/raceEvents.ts`, `src/data/grid.ts`.

**Experiments:** 3 (DP/Greedy), 4 (event priority queue), 5 (sorting and top-k) — `src/experiments/exp3-dp-greedy.ts`, `exp4-events.ts`, `exp5-sorting.ts`, `harness.ts`, `run-all.ts`; `docs/04_EXPERIMENTS.md`.

**Tests B owns:** `tests/algorithms/{knapsack,refuel,sort}.test.ts`, `tests/core/heap.test.ts`, `tests/engine/{events,nitro,engine,championship,raceEvents}.test.ts`, and in `tests/spec/` the sections *§5.3 DP/greedy*, *fuel-stop DP*, *§4.6/§5.5 sorting*, *§4.5 event queue*, plus Part 2 of `pdf-engine.test.ts` (engine rules).

## B.2 Frontend (spec §2.1 screens 4, 5 + shared system)

| Screen / system | What B builds | Files |
|---|---|---|
| 4 Algorithm Lab | play / pause / step / reset over recorded traces of the real algorithms; counters; experiment charts | `src/ui/lab/AlgorithmLab.ts`, `labAlgos.ts` |
| 5 Championship Dashboard | standings, race results, podium, top-k, Merge/Quick/Heap sort race | `src/ui/screens/Dashboard.ts`, `src/ui/components/SortRace.ts`, `src/render3d/PodiumView.ts`, `ranking.ts` |
| Design system and app shell | tokens, components, navigation state machine, settings, session | `src/styles/tokens.css`, `src/ui/components/*`, `src/ui/App.ts`, `src/state/*`, `src/main.ts` |
| 2D renderers (fallback) | Canvas camera, graph and race renderers | `src/render/*` |

Rule: the UI never computes a route, cost or sort itself — it imports the algorithm and draws its trace.

## B.3 Interfaces B provides to A
- `RaceEngine` (+ `RaceConfig.humanPlan`) and its snapshot `state` that A's `RaceView` draws.
- `compareChampionship`, `buildStandings`, `topK` and the three sorts.
- `tokens.css` colour/typography tokens and the shared HUD components used by A's screens.

## B.4 Definition of done
- [ ] Six algorithm families implemented once, instrumented, used by gameplay, Lab and experiments.
- [ ] DP equals exhaustive search; at least two greedy-worse cases documented; fuel plans feasible in a real race.
- [ ] Three sorts and top-k agree through the single comparator; event order verified.
- [ ] Experiments 3, 4 and 5 reproduce with raw data.
- [ ] Algorithm Lab and Championship screens work; consistent styling across all five screens.
- [ ] Report sections: §3 (architecture, game flow), §5 and §6 for B's six algorithms, §8 for experiments 3–5, §9 (limitations).
