/**
 * src/experiments/run-all.ts — run all five studies and write raw results.
 * Usage: npm run experiments  ->  writes CSV + JSON into experiments-output/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { toCSV, type ExperimentResult } from "./harness";
import { runExp1 } from "./exp1-bfs-dfs";
import { runExp2 } from "./exp2-dijkstra-astar";
import { runExp3 } from "./exp3-dp-greedy";
import { runExp4 } from "./exp4-events";
import { runExp5 } from "./exp5-sorting";

function write(outDir: string, r: ExperimentResult): void {
  writeFileSync(resolve(outDir, `${r.name}.csv`), toCSV(r.headers, r.rows));
  writeFileSync(resolve(outDir, `${r.name}.json`), JSON.stringify(r, null, 2));
  console.log(`  ${r.name}: ${r.rows.length} rows`);
}

function main(): void {
  const outDir = resolve(process.cwd(), "experiments-output");
  mkdirSync(outDir, { recursive: true });
  console.log(`Writing experiment results to ${outDir}`);

  const exp5 = runExp5();
  const results: ExperimentResult[] = [runExp1(), runExp2(), runExp3(), runExp4(), exp5.sorting, exp5.topk];
  for (const r of results) write(outDir, r);

  console.log("Done. Raw CSV/JSON written for the report (spec §9.3).");
}

main();
