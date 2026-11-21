# 04 — The Five Experimental Studies

> Owner: **Person A** builds the harness + runs; **Person B** renders the charts (Phase 6).
> Spec §7 requires 5 studies, each with: objective, hardware/software environment, input-generation method, dataset sizes, procedure, metrics, result table/chart, interpretation, limitations, conclusion. Keep theory separate from measured runtime; **never infer complexity from a single timing**.

---

## Harness rules (spec §7) — `src/experiments/harness.ts`

- Run on one machine, one build mode, consistent settings. Record the environment (CPU, RAM, Node version, OS) once in the report.
- **Warm-up**, then **≥5 timed runs**; report **mean** + **median** + **stddev**.
- **Exclude rendering, file I/O, and artificial delays** from algorithm timing. Time only the algorithm call.
- State whether timing **includes data-structure initialization** (we exclude it; build the graph/heap before the timed region).
- Keep **correctness checks separate** from timed runs.
- **Publish raw measurements** as CSV in `experiments-output/` so results reproduce (spec §9.3). Also emit JSON for B's charts.
- Seeded input generation so datasets are reproducible.

```ts
export function benchmark(fn: () => void, runs = 7, warmup = 2): { mean:number; median:number; stddev:number; raw:number[] };
```
Each experiment script: generate datasets → correctness pass (assert) → timed pass (`benchmark`) → write CSV+JSON. `npm run experiments` runs all five.

---

## Experiment 1 — BFS & DFS (spec §7)
- **Inputs:** vary V and E; include **sparse and denser** graphs; seeded generation across sizes (e.g. V ∈ {50,100,200,400,800}).
- **Metrics:** runtime, **visited vertices**, **examined edges** (from `Counters`). Verify BFS minimum-edge-count and DFS cycle/component results in the correctness pass.
- **Chart:** runtime vs (V+E); overlay O(V+E) reference trend.
- **Interpretation:** discuss observed growth against O(V+E); note sparse vs dense effect on edge examinations.

## Experiment 2 — Dijkstra & A\* (spec §7)
- **Inputs:** multiple circuits/sizes with **documented coordinates and costs** (needed for the A\* heuristic).
- **Metrics:** runtime, **expanded vertices**, **relaxed edges**, **heap operations**, **final path cost**.
- **Correctness:** A\* final cost **equals** Dijkstra's when heuristic conditions hold.
- **Chart:** expanded vertices Dijkstra vs A\* across instances; runtime vs size.
- **Interpretation:** show cases where A\* expands **fewer, equal, or more** vertices (spec §5.2) — depends on heuristic/tie-breaking. Do **not** claim A\* always wins.

## Experiment 3 — DP & Greedy (spec §7)
- **Inputs:** vary item count m and budget B; **include the supplied A/B/C example**; include the ≥2 team-made greedy-worse cases.
- **Metrics:** benefit, selected items, runtime, **DP state count** (`dpStatesComputed`).
- **Correctness:** DP vs **exhaustive search** on small instances (match exactly); greedy strictly worse in the crafted cases.
- **Chart:** DP vs greedy benefit across cases; DP runtime vs m·B (pseudo-polynomial).
- **Interpretation:** explain pseudo-polynomial behavior in B; why greedy fails 0/1.

## Experiment 4 — Event Priority Queue (spec §7)
- **Inputs:** vary event count n (e.g. 10^2..10^5); include equal timestamps, priority ties, sequence ties, cancellations, expirations.
- **Metrics:** insertion/extraction time, **heap operations**.
- **Correctness:** extraction order equals sort by `(triggerTime, priority, insertionSequence)`; cancelled never fire.
- **Chart:** insert/extract time vs n; overlay O(log n) per-op trend.
- **Interpretation:** cost of lazy deletion (memory vs simplicity, spec §4.5).

## Experiment 5 — Sorting & Top-k (spec §7)
- **Inputs:** random, sorted, reverse-sorted, duplicate-heavy; vary n.
- **Metrics:** runtime and **comparison counts**; use the common comparator.
- **Correctness:** all three sorts agree; top-k equals first-k of full sort; includes the racer-ID-tiebreak fixture.
- **Chart:** runtime of Merge/Quick/Heap across input shapes; **full-sort vs size-k heap** for small k and k≈n.
- **Interpretation:** Quick's O(n²) worst vs average; stability of Merge; when top-k (O(n log k)) beats full sort (Challenge 3 ties in here).

---

## Report format per experiment (copy this template)

```
### Experiment N — <title>
Objective:
Environment: <CPU / RAM / OS / Node version / build mode>
Input generation: <seeded method, sizes>
Procedure: <warm-up, runs, what is timed, init excluded>
Metrics: <list>
Results: <table>  +  <chart>
Interpretation: <what the data shows vs theoretical complexity>
Limitations: <timer resolution, JIT, GC, single machine>
Conclusion:
```

Raw CSVs go in `experiments-output/` and are included in the ZIP (spec §9.3: "Experimental results and raw measurements/result files").
