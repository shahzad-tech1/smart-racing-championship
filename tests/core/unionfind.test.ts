import { describe, it, expect } from "vitest";
import { UnionFind } from "../../src/core/UnionFind";

describe("UnionFind", () => {
  it("starts with n singleton sets", () => {
    const uf = new UnionFind(5);
    expect(uf.count).toBe(5);
    expect(uf.connected(0, 1)).toBe(false);
  });

  it("unions and tracks connectivity transitively", () => {
    const uf = new UnionFind(5);
    expect(uf.union(0, 1)).toBe(true);
    expect(uf.union(1, 2)).toBe(true);
    expect(uf.connected(0, 2)).toBe(true);
    expect(uf.count).toBe(3); // {0,1,2}, {3}, {4}
  });

  it("union of already-connected returns false and does not change count", () => {
    const uf = new UnionFind(3);
    uf.union(0, 1);
    expect(uf.union(1, 0)).toBe(false);
    expect(uf.count).toBe(2);
  });
});
