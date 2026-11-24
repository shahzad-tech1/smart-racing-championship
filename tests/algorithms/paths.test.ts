import { describe, it, expect } from "vitest";
import { enumerateSimplePaths, alternativeRoutes, samePath } from "../../src/algorithms/paths";
import { bfsEdgeExample, triangle } from "./fixtures";

describe("bounded simple-path enumeration", () => {
  it("finds both simple paths in the detour example", () => {
    const paths = enumerateSimplePaths(bfsEdgeExample(), 0, 1, { maxPaths: 10, maxLen: 5 });
    expect(paths.length).toBe(2);
    expect(paths).toContainEqual([0, 1]);
    expect(paths).toContainEqual([0, 2, 3, 1]);
  });

  it("respects maxPaths (never returns more than the cap)", () => {
    const paths = enumerateSimplePaths(bfsEdgeExample(), 0, 1, { maxPaths: 1, maxLen: 5 });
    expect(paths.length).toBe(1);
  });

  it("respects maxLen (abandons branches that are too long)", () => {
    // maxLen 1 edge keeps only the direct 1-edge path, not the 3-edge detour
    const paths = enumerateSimplePaths(bfsEdgeExample(), 0, 1, { maxPaths: 10, maxLen: 1 });
    expect(paths).toEqual([[0, 1]]);
  });

  it("source == goal yields the trivial single-vertex path", () => {
    expect(enumerateSimplePaths(triangle(), 0, 0, { maxPaths: 5, maxLen: 5 })).toEqual([[0]]);
  });

  it("only returns simple paths (no repeated vertices) even with a cycle", () => {
    const paths = enumerateSimplePaths(triangle(), 0, 2, { maxPaths: 10, maxLen: 10 });
    for (const p of paths) {
      expect(new Set(p).size).toBe(p.length);
    }
    // 0->2 directly and 0->1->2
    expect(paths).toContainEqual([0, 2]);
    expect(paths).toContainEqual([0, 1, 2]);
  });

  it("alternativeRoutes excludes the given main route", () => {
    const main = [0, 1];
    const alts = alternativeRoutes(bfsEdgeExample(), 0, 1, main, { maxPaths: 10, maxLen: 5 });
    expect(alts.every((p) => !samePath(p, main))).toBe(true);
    expect(alts).toContainEqual([0, 2, 3, 1]);
  });
});
