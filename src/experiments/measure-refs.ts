/**
 * measure-refs.ts — Normalization reference + preset sanity helper.
 *
 * PURPOSE (run this in Phase 2, before freezing the cost model):
 *   1. Scan every edge of every championship circuit and report the max
 *      distance / time / fuel actually present, then suggest clean reference
 *      constants (rounded up for headroom).  These go into NormalizationRefs
 *      in src/core/cost.ts  (see docs/00_SHARED_CONTRACTS.md §3).
 *   2. Print the normalized spread of each attribute so you can confirm every
 *      term lands inside [0,1] and no single criterion dominates by unit scale.
 *   3. Compare two candidate S->T routes under all four presets to CONFIRM the
 *      spec-required divergence (spec §3.3: "at least one circuit where
 *      different presets select different routes").
 *
 * DESIGN NOTE — this file does NOT implement Dijkstra or any routing. It only
 * SUMS the cost of routes you hand it. The real preset-divergence gameplay test
 * (Person A, Phase 2) uses the game's actual dijkstra() so there is still only
 * ONE routing implementation in the project (README §0).
 *
 * RUN:  npx tsx src/experiments/measure-refs.ts
 *       (falls back to an embedded demo circuit until the real circuits exist)
 */

// In the scaffolded repo these come from the shared contract. We keep a local
// mirror so this helper runs standalone before core/ is written; replace the
// local type with:  import type { Edge } from "../core/types";
type Edge = {
  id: number; from: number; to: number;
  distance: number; baseTime: number; fuelCost: number;
  difficulty: number; // 1..5
  obstacle?: number;   // 0..5 active-hazard penalty on the edge (0 when clear)
};

// ---- Normalization references -------------------------------------------------

export interface NormalizationRefs {
  maxDistance: number; maxTime: number; maxFuel: number;
  maxDifficulty: number; maxObstacle: number;
}

/** Round a measured maximum up to a clean reference constant with headroom. */
function cleanUp(x: number): number {
  const steps = [12, 15, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
  for (const s of steps) if (x <= s) return s;
  return Math.ceil(x / 100) * 100;
}

/** Measure references across the UNION of all circuits (stable for the whole championship). */
export function computeRefs(circuits: Edge[][]): {
  measured: { maxDistance: number; maxTime: number; maxFuel: number };
  refs: NormalizationRefs;
} {
  const all = circuits.flat();
  if (all.length === 0) throw new Error("No edges supplied");
  const maxDistance = Math.max(...all.map(e => e.distance));
  const maxTime = Math.max(...all.map(e => e.baseTime));
  const maxFuel = Math.max(...all.map(e => e.fuelCost));
  return {
    measured: { maxDistance, maxTime, maxFuel },
    refs: {
      maxDistance: cleanUp(maxDistance),
      maxTime: cleanUp(maxTime),
      maxFuel: cleanUp(maxFuel),
      maxDifficulty: 5, // fixed bounded scale
      maxObstacle: 5,   // fixed bounded hazard scale (0..5)
    },
  };
}

function normalizedTerms(e: Edge, r: NormalizationRefs) {
  return {
    D: e.distance / r.maxDistance,
    T: e.baseTime / r.maxTime,
    F: e.fuelCost / r.maxFuel,
    R: e.difficulty / r.maxDifficulty,
    O: (e.obstacle ?? 0) / r.maxObstacle,
  };
}

function spreadReport(circuits: Edge[][], r: NormalizationRefs) {
  const all = circuits.flat();
  const keys = ["D", "T", "F", "R", "O"] as const;
  const cols: Record<string, number[]> = { D: [], T: [], F: [], R: [], O: [] };
  for (const e of all) {
    const n = normalizedTerms(e, r);
    for (const k of keys) cols[k].push(n[k]);
  }
  const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  console.log("\nNormalized term spread (every value must sit in [0,1]):");
  for (const k of keys) {
    const v = cols[k];
    console.log(`  ${k}  min=${Math.min(...v).toFixed(2)}  median=${median(v).toFixed(2)}  max=${Math.max(...v).toFixed(2)}`);
  }
}

// ---- Preset divergence check (sums costs of GIVEN routes; no routing here) -----

export type PresetName = "Balanced" | "Speed" | "Economy" | "Safety";
export type CostWeights = { wD: number; wT: number; wF: number; wR: number; wO: number };

export const PRESETS: Record<PresetName, CostWeights> = {
  Balanced: { wD: 0.20, wT: 0.20, wF: 0.20, wR: 0.20, wO: 0.20 },
  Speed:    { wD: 0.15, wT: 0.50, wF: 0.10, wR: 0.15, wO: 0.10 },
  Economy:  { wD: 0.15, wT: 0.10, wF: 0.50, wR: 0.15, wO: 0.10 },
  Safety:   { wD: 0.10, wT: 0.10, wF: 0.10, wR: 0.40, wO: 0.30 },
};

export function routeCost(route: Edge[], w: CostWeights, r: NormalizationRefs): number {
  let total = 0;
  for (const e of route) {
    const n = normalizedTerms(e, r);
    total += w.wD * n.D + w.wT * n.T + w.wF * n.F + w.wR * n.R + w.wO * n.O;
  }
  return total;
}

export function comparePresets(routes: Record<string, Edge[]>, r: NormalizationRefs) {
  const names = Object.keys(routes);
  console.log(`\nPreset divergence check over candidate routes [${names.join(", ")}]:`);
  const header = ["Preset".padEnd(10), ...names.map(n => n.padStart(12)), "  Winner"].join("");
  console.log(header);
  const winners = new Set<string>();
  for (const [preset, w] of Object.entries(PRESETS)) {
    const costs = names.map(n => routeCost(routes[n], w, r));
    const minIdx = costs.indexOf(Math.min(...costs));
    winners.add(names[minIdx]);
    console.log([preset.padEnd(10), ...costs.map(c => c.toFixed(3).padStart(12)), "  " + names[minIdx]].join(""));
  }
  console.log(winners.size > 1
    ? `PASS: presets diverge (${winners.size} distinct winners) — spec §3.3 satisfied.`
    : `WARN: all presets picked the same route — retune weights or sharpen the two routes.`);
}

// ---- Embedded demo data (used until real circuits exist) ----------------------

const DEMO_CIRCUIT: Edge[] = [
  { id: 1, from: 0, to: 1, distance: 60,  baseTime: 3.0, fuelCost: 4,  difficulty: 5 },
  { id: 2, from: 1, to: 2, distance: 70,  baseTime: 3.6, fuelCost: 5,  difficulty: 5 },
  { id: 3, from: 0, to: 3, distance: 140, baseTime: 6.2, fuelCost: 8,  difficulty: 1 },
  { id: 4, from: 3, to: 4, distance: 120, baseTime: 5.5, fuelCost: 7,  difficulty: 1 },
  { id: 5, from: 4, to: 2, distance: 110, baseTime: 5.0, fuelCost: 6,  difficulty: 2 },
  { id: 6, from: 2, to: 5, distance: 260, baseTime: 11.0, fuelCost: 14, difficulty: 1 },
  { id: 7, from: 1, to: 4, distance: 155, baseTime: 7.0, fuelCost: 9,  difficulty: 3 },
];

async function main() {
  // Try to load the real circuits once they exist; otherwise use the demo.
  let circuits: Edge[][] = [DEMO_CIRCUIT];
  try {
    const mod = await import("../data/circuits/index.js");
    if (mod?.ALL_CIRCUITS?.length) {
      circuits = mod.ALL_CIRCUITS.map((g: any) => g.allEdges());
      console.log(`Loaded ${circuits.length} real circuit(s).`);
    }
  } catch {
    console.log("(!) Real circuits not found — using embedded DEMO circuit.");
  }

  const { measured, refs } = computeRefs(circuits);
  console.log("\nMeasured maxima (physical attributes):");
  console.log(`  maxDistance = ${measured.maxDistance}  -> reference ${refs.maxDistance}`);
  console.log(`  maxTime     = ${measured.maxTime}  -> reference ${refs.maxTime}`);
  console.log(`  maxFuel     = ${measured.maxFuel}  -> reference ${refs.maxFuel}`);
  console.log(`  maxDifficulty (fixed) = ${refs.maxDifficulty}`);
  console.log(`  maxObstacle   (fixed) = ${refs.maxObstacle}`);
  console.log("\nPaste into NormalizationRefs (src/core/cost.ts):");
  console.log("  " + JSON.stringify(refs));

  spreadReport(circuits, refs);

  // Two S->T candidate routes to prove preset divergence.
  const shortcut: Edge[] = [
    { id: 101, from: 0, to: 9, distance: 60, baseTime: 3.0, fuelCost: 4, difficulty: 5, obstacle: 3 },
    { id: 102, from: 9, to: 8, distance: 70, baseTime: 3.6, fuelCost: 5, difficulty: 5, obstacle: 2 },
  ];
  const mainRoute: Edge[] = [
    { id: 201, from: 0, to: 6, distance: 140, baseTime: 6.2, fuelCost: 8, difficulty: 1, obstacle: 0 },
    { id: 202, from: 6, to: 7, distance: 120, baseTime: 5.5, fuelCost: 7, difficulty: 1, obstacle: 0 },
    { id: 203, from: 7, to: 8, distance: 110, baseTime: 5.0, fuelCost: 6, difficulty: 2, obstacle: 0 },
  ];
  comparePresets({ Shortcut: shortcut, Main: mainRoute }, refs);
}

// Run only when invoked directly (not when imported by a test).
// Node ESM entrypoint check:
const isMain = (import.meta as any).url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("measure-refs.ts");
if (isMain) main();
