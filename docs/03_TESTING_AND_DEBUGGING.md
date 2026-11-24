# 03 — Testing & Debugging (prevents a broken product)

> Goal: no fault reaches the demo. We achieve this with (1) a test matrix that covers every case the spec names in §9.1, (2) determinism guards, (3) invariant tests that catch integration drift, and (4) a debugging playbook so a bug is fixed at its root, not patched.

Runner: **Vitest**. `npm test` must be green before any merge to `main` (CI enforces it). Tests live in `tests/` mirroring `src/`.

---

## 1. Test matrix (maps 1:1 to spec §9.1)

| Area | Cases required by spec | Owner | File |
|---|---|---|---|
| **Graph** | single vertex, disconnected, cyclic, branching, dead-end, directed, undirected | A | `tests/core/graph.test.ts` |
| **Routing** | source=target, unreachable target, blocked edge, equal-cost paths, zero-weight edges, graph change during race | A | `tests/algorithms/routing.test.ts` |
| **Resources** | insufficient fuel, full tank, unavailable station, capacity limit, zero-cost pickup, infeasible plan | B | `tests/algorithms/resources.test.ts` |
| **Events** | simultaneous events, deterministic ties, cancellation, expiration, missing targets, overlapping effects | B | `tests/engine/events.test.ts` |
| **Sorting** | empty, singleton, random, sorted, reverse-sorted, duplicate-heavy; same comparator | B | `tests/algorithms/sort.test.ts` |
| **Integration** | complete race, multiple laps, ordered checkpoints, DNF, road closure, championship standings | A+B | `tests/integration/*.test.ts` |

Every row above must have passing tests before Phase 7 ends. Treat the table as a checklist in the report's testing section.

---

## 2. Invariant tests (catch integration drift early)

These guard the "one rule that governs everything." Add them in the phase that introduces the capability; never remove them.

1. **Determinism replay** (`tests/engine/determinism.test.ts`): run a full seeded race twice; assert deep-equal `results()` and equal per-tick state hashes. *Fails the instant non-determinism is introduced.*
2. **Single comparator** (`tests/algorithms/comparator-agreement.test.ts`): for 50 random standings fixtures, `mergeSort`, `quickSort`, `heapSort` under `compareChampionship` produce identical arrays; `topK(k)` equals `fullSort.slice(0,k)` for k ∈ {1, 3, n/2, n}.
3. **Cost shown == cost optimized** (`tests/algorithms/cost-display.test.ts`): sum of `edgeCost` along `PathResult.path` equals `PathResult.cost`.
4. **Lab == gameplay** (`tests/lab/no-duplicate-algorithms.test.ts`): a static check that `src/ui/lab/` imports algorithms from `src/algorithms/` and defines none itself (scan for `function dijkstra|bfs|...`). Plus a behavioral test: Lab run and direct call return the same path/cost.
5. **DP optimality** (`tests/algorithms/knapsack-vs-bruteforce.test.ts`): DP matches exhaustive search on all instances with m ≤ 15.
6. **Checkpoint order never skipped** (`tests/algorithms/checkpoint-order.test.ts`): `planCheckpointRoute` visits every mandatory checkpoint in order; assert on 3 circuits.
7. **No negative fuel / off-graph** (`tests/engine/invariants.test.ts`): across a full race, every racer's fuel ≥ 0 and `currentVertex` is always a graph vertex, each move follows a real edge.
8. **Event ordering** (`tests/engine/events.test.ts`): extracted order equals sort by `(triggerTime, priority, insertionSequence)`; cancelled events never fire; expiries fire deterministically.

---

## 3. Determinism guards (build habits, not just tests)

- **Only `core/rng.ts` produces randomness.** Add an ESLint rule / grep check in CI that fails if `Math.random(` appears in `src/algorithms/` or `src/engine/`.
- The engine is **fixed-step** (`dt` constant). Rendering interpolates; it must never feed values back into the sim.
- No wall-clock time (`Date.now()`, `performance.now()`) inside the sim — only inside the experiment harness and the renderer's interpolation.
- Iterate maps/sets in insertion or id order, never in nondeterministic order. Prefer arrays keyed by id, or sort keys before iterating where order matters for results.

---

## 4. Edge-case contract (no crash, ever)

Every public function returns a **defined** result for degenerate input — it must not throw or loop forever (spec §5.1: *"Unreachable destinations must not crash or loop indefinitely"*).

| Input | Required behavior |
|---|---|
| Empty graph / single vertex | `found:false` or trivial result; no throw |
| Unreachable goal | `PathResult.found = false`, empty path |
| source == target | cost 0, path `[source]` |
| Insufficient fuel, no recovery | planner flags infeasible; engine → DNF per documented policy |
| Event target missing | event validated out, ignored, logged |
| Empty standings | sorts return `[]`; top-k returns `[]` |
| Disconnected during race | reroute or documented recovery (wait/DNF); **never freeze silently** (spec §5.4) |

Add a `tests/edge-cases.test.ts` that throws the whole degenerate zoo at every entry point.

---

## 5. Debugging playbook

When something breaks, work the ladder — don't guess-patch:

1. **Reproduce deterministically.** Capture the seed + inputs. Because the sim is seeded, every bug is reproducible. Write a failing test that reproduces it *first*.
2. **Localize with the boundary.** Is it algorithm (headless test fails) or rendering (headless passes, screen wrong)? The A/B boundary makes this a one-question triage.
3. **Bisect by invariant.** Which invariant test (§2) fails? That names the culprit layer. If none fails, you found a missing invariant — add it.
4. **Inspect the trace.** Run the algorithm with a `recordingTrace` and dump `steps` — you can see exactly where Dijkstra relaxed wrong or the heap popped out of order. This is the same data the Lab shows, so the Lab is also a debugger.
5. **Fix the root, keep the test.** The reproducing test from step 1 becomes a permanent regression test.
6. **Re-run the gate.** `npm run lint && npm test && npm run build` before merging the fix.

### Common failure modes & first thing to check
| Symptom | Likely cause | Check |
|---|---|---|
| Opponents desync on replay | hidden `Math.random`/`Date.now`, map iteration order | grep guards; determinism test |
| Route skips a checkpoint | used `dijkstra` to finish directly instead of `planCheckpointRoute` | checkpoint-order test |
| Displayed cost ≠ optimized | UI recomputed cost its own way | cost-display invariant |
| A\* gives different cost than Dijkstra | inadmissible heuristic | assert heuristic ≤ true remaining cost on fixtures |
| Sort order differs between methods | one sort used a different comparator | comparator-agreement test |
| DP infinite/huge | fractional fuel not scaled to integer tenths | check units at the boundary |
| Event fires after cancel | not checking `cancelled` at heap top | lazy-deletion test |
| Race "freezes" on closure | no recovery path handling | disconnection test; recovery policy |

---

## 6. CI (set up in Phase 0)

GitHub Actions on every push/PR:
```yaml
# .github/workflows/ci.yml
steps:
  - run: npm ci
  - run: npm run lint      # includes boundary + no-Math.random guards
  - run: npm test
  - run: npm run build
```
Branch protection on `main`: require the workflow to pass. **Nothing merges red.** This is the mechanical guarantee that the product on `main` is always demo-able.

---

## 7. Pre-demo smoke checklist (run the morning of the demo)

- [ ] Fresh `git clone` → `npm ci` → `npm run dev` boots.
- [ ] Each of the 5 screens opens and is interactive.
- [ ] A full 1+3 race completes on each of the 3 circuits (no crash, no freeze).
- [ ] A road closure mid-race reroutes visibly.
- [ ] Dashboard champion declared; sort-method switch keeps order.
- [ ] Lab steps through BFS, Dijkstra, DP, and a sort.
- [ ] `npm run experiments` produces CSVs.
- [ ] `npm run build && npm run preview` serves the production bundle.
