/**
 * tests/guards/guards.test.ts — architectural guardrails (README §6).
 * These are the authoritative, CI-enforced versions of the quality gates.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Strip block and line comments so guards check CODE, not documentation. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function codeOf(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
}

const SRC = resolve(process.cwd(), "src");

describe("determinism guard", () => {
  it("no ambient randomness or wall-clock time in algorithms/engine/core", () => {
    const dirs = ["algorithms", "engine", "core"].map((d) => resolve(SRC, d));
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        // rng.ts is allowed to use Math.imul etc., but not Math.random
        const text = codeOf(file);
        if (/Math\.random\s*\(/.test(text)) offenders.push(`${file}: Math.random`);
        if (/Date\.now\s*\(/.test(text)) offenders.push(`${file}: Date.now`);
        if (/performance\.now\s*\(/.test(text)) offenders.push(`${file}: performance.now`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("architecture boundary guard", () => {
  it("core/algorithms/engine never import from ui/ or render/", () => {
    const dirs = ["algorithms", "engine", "core"].map((d) => resolve(SRC, d));
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        const text = codeOf(file);
        if (/from\s+['"][^'"]*\/(ui|render)\//.test(text) || /from\s+['"]\.\.?\/(ui|render)['"]/.test(text)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
