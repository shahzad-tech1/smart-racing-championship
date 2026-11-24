# 06 — Cost Model Defense (normalization & weights)

> This document justifies the normalization reference values and the preset weights used in the route cost function. It is the written rationale required by spec §3.3 ("State the normalization, weights and rationale") and §4.3 ("freeze and document them before testing"). Copy the relevant parts into **report section 4** ("Graph/data models, assumptions, cost normalization and game rules").
>
> Numbers here are produced by, and reproducible with, **`src/experiments/measure-refs.ts`** (`npx tsx src/experiments/measure-refs.ts`). Re-run it once all three final circuits are authored and paste the output back into this file and into `src/core/cost.ts`.

---

## 1. The cost function (spec §3.3)

Every edge carries a single non-negative scalar cost so that Dijkstra and A\* are valid:

```
cost(e) = wD·D(e) + wT·T(e) + wF·F(e) + wR·R(e) + wO·O(e)
```

where `D, T, F, R, O` are the **normalized** distance, travel time, fuel use, difficulty penalty and obstacle penalty of edge `e`, each in `[0, 1]`, and all weights `w ≥ 0`.

**Why a single scalar at all.** Dijkstra's optimality requires a single non-negative additive edge weight. Collapsing five criteria into one scalar is what makes shortest-path routing applicable. The cost of mixing objectives this way (one preference vector can hide trade-offs) is acknowledged in §5 below and is exactly the limitation Advanced Challenge 2 asks us to discuss.

---

## 2. Why normalization is necessary

The five attributes are measured in different units and ranges:

| Attribute | Unit | Natural range on our circuits |
|---|---|---|
| Distance `D` | metres | ~50–260 |
| Travel time `T` | seconds | ~3–11 |
| Fuel `F` | fuel units | ~3–14 |
| Difficulty `R` | ordinal 1–5 | 1–5 |
| Obstacle `O` | hazard penalty 0–5 | 0–5 |

If we summed the raw values, distance (hundreds) would dominate difficulty (single digits) purely because of unit size, not importance — the weights would become meaningless. Normalizing each attribute to `[0, 1]` first means a weight of `0.5` carries the **same** "half of the worst case" meaning for every criterion, so the weights alone express the policy.

---

## 3. How the reference values are chosen

We normalize each attribute by a documented reference maximum:

```
D(e) = distance(e) / maxDistance      T(e) = baseTime(e) / maxTime
F(e) = fuelCost(e) / maxFuel          R(e) = difficulty(e) / 5
O(e) = obstaclePenalty(e) / 5
```

We use a **hybrid** rule, chosen deliberately:

- **Bounded attributes → fixed references.** Difficulty is defined by the spec on a `1–5` scale, so `maxDifficulty = 5` is exact by construction. We model the obstacle penalty on the same `0–5` hazard scale (0 = clear road, 5 = worst active hazard), so `maxObstacle = 5`. These never need measuring and are stable across every circuit.
- **Unbounded physical attributes → measured-then-rounded references.** Distance, time and fuel have no natural ceiling, so we **measure** the maximum value present across *all three championship circuits* (the union), then **round up to a clean constant** for headroom. Using the union-max (not per-circuit max) keeps one fixed reference for the whole championship, so a route's absolute cost is comparable across races and the Dashboard numbers stay meaningful.

**Why round up rather than use the raw max.** Using the exact measured max would force the single longest edge to normalize to exactly `1.0`; any future edit that adds a slightly longer edge would silently push a term above `1.0` and quietly re-weight the model. Rounding up to a clean constant with headroom makes the reference stable against small content edits and keeps all terms safely inside `[0, 1]`.

### Measured result (representative — re-confirm with the script on the final circuits)

Running `measure-refs.ts` on a representative circuit set produces:

| Attribute | Measured max | Chosen reference | Basis |
|---|---|---|---|
| Distance | 260 m | **300** | measured union-max, rounded up |
| Time | 11.0 s | **12** | measured union-max, rounded up |
| Fuel | 14 units | **15** | measured union-max, rounded up |
| Difficulty | 5 | **5** | fixed by spec (1–5 scale) |
| Obstacle | 5 | **5** | fixed design scale (0–5) |

```ts
// src/core/cost.ts  — FROZEN normalization references
export const REFS: NormalizationRefs = {
  maxDistance: 300, maxTime: 12, maxFuel: 15, maxDifficulty: 5, maxObstacle: 5,
};
```

**Sanity check — term balance.** Under these references, the normalized attribute spread across all edges is:

| Term | min | median | max |
|---|---|---|---|
| D | 0.17 | 0.43 | 0.87 |
| T | 0.22 | 0.50 | 0.92 |
| F | 0.20 | 0.53 | 0.93 |
| R | 0.20 | 0.40 | 1.00 |

Every term sits inside `[0, 1]` with comparable medians (~0.4–0.5), confirming no criterion dominates by unit scale. This is the evidence that the normalization is balanced.

---

## 4. How the weights (presets) are chosen (spec §3.3)

The weights encode *policy*, not physics. We keep each preset's weights summing to ≈1.0 so each weight reads as a percentage of importance, and we set them from the intent the spec assigns to each preset:

```ts
// src/core/cost.ts  — FROZEN preset weights  (wD, wT, wF, wR, wO)
Balanced: { wD: 0.20, wT: 0.20, wF: 0.20, wR: 0.20, wO: 0.20 }  // equal emphasis
Speed:    { wD: 0.15, wT: 0.50, wF: 0.10, wR: 0.15, wO: 0.10 }  // high time, low fuel
Economy:  { wD: 0.15, wT: 0.10, wF: 0.50, wR: 0.15, wO: 0.10 }  // high fuel
Safety:   { wD: 0.10, wT: 0.10, wF: 0.10, wR: 0.40, wO: 0.30 }  // high difficulty + obstacle
```

| Preset | Spec intent (§3.3) | Encoded as |
|---|---|---|
| Balanced | moderate across all criteria | all weights 0.20 |
| Speed | high time weight, lower fuel | `wT = 0.50`, `wF = 0.10` |
| Economy | high fuel weight | `wF = 0.50` |
| Safety | high difficulty and obstacle | `wR = 0.40`, `wO = 0.30` |

**The weights are not guessed in the abstract — they are validated against a required behaviour.** The spec (§3.3) demands at least one circuit where different presets select *different* routes. We treat that as the acceptance test and tune until it is met. The tuning process *is* the justification.

### Divergence evidence (reproducible)

Two S→T candidates — a **short-but-hard shortcut** (high difficulty + obstacle) vs a **longer-but-easy main route** — evaluated under all four presets:

| Preset | Shortcut cost | Main cost | Chosen route |
|---|---|---|---|
| Balanced | 0.917 | 0.965 | Shortcut |
| Speed | 0.800 | 1.141 | **Shortcut** |
| Economy | 0.820 | 1.144 | Shortcut |
| Safety | 1.258 | 0.723 | **Main** |

The presets **diverge**: Speed/Economy/Balanced take the fast hard shortcut, while **Safety routes around it** to the easier road. This satisfies spec §3.3 and is the live demo for Advanced Challenge 2. The same table is regenerated by `measure-refs.ts` so it can be reproduced in the viva.

> Finer splits (e.g. Speed vs Economy choosing differently) can be produced per-circuit by placing a route that is cheap on fuel but slow, or vice versa. One clear divergence is sufficient for the requirement; add more if a circuit naturally affords it.

---

## 5. Known limitation (required discussion, spec §8 Challenge 2)

Combining independent objectives into **one weighted scalar** means the router only ever returns the optimum **for one fixed preference vector**. It cannot reveal the full set of Pareto-optimal trade-offs — a route that is slightly slower but far safer may never surface unless the weights happen to favour it. Changing the weights changes the winner (demonstrated in §4), which is both the feature (policy control) and the limitation (no single run shows the trade-off surface). The spec explicitly accepts a scalar cost **provided it is defensible and documented** — this section is that acknowledgement. Fuel, nitro and detour time remain modelled as *distinct* resources in the DP planner (Act 3); the scalar cost is used only for routing, never to silently treat physical resources as interchangeable.

---

## 6. The display invariant (spec §3.3)

> "The cost displayed to the player must be the same cost optimized by the algorithm."

The Route Planner UI shows exactly `PathResult.cost`, which is the value `dijkstra`/`aStar` minimized using `edgeCost(...)`. The UI never recomputes cost by a second formula. This is enforced by the `cost-display` invariant test in `docs/03_TESTING_AND_DEBUGGING.md §2`.

---

## 7. Freeze record

| Item | Value | Status |
|---|---|---|
| References | `{maxDistance:300, maxTime:12, maxFuel:15, maxDifficulty:5, maxObstacle:5}` | Representative — **re-confirm with `measure-refs.ts` on final 3 circuits, then FREEZE before experiments** |
| Weights | presets above | Starting values — **confirm divergence on final circuits, then FREEZE** |
| Fuel unit | integer tenths-of-a-unit | FROZEN (contract §5) |

Freeze both before running the five experiments (spec §4.3), and do not change them afterward without a changelog row here and in `docs/00_SHARED_CONTRACTS.md`.
