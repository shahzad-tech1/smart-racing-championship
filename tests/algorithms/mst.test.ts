import { describe, it, expect } from "vitest";
import { Graph } from "../../src/core/Graph";
import { kruskalMST, mstWeight } from "../../src/algorithms/mst";
import { buildCircuit1 } from "../../src/data/circuits/circuit1";
import { V, E } from "./fixtures";

describe("Kruskal MST", () => {
  it("spans a connected graph with V-1 edges", () => {
    const g = buildCircuit1(); // 16 vertices, connected
    const mst = kruskalMST(g);
    expect(mst.length).toBe(g.vertexCount - 1);
  });

  it("chooses the minimum total weight on a small weighted graph", () => {
    // 0-1 (1), 1-2 (2), 0-2 (3): MST should take 0-1 and 1-2 (weight 3), not 0-2.
    const g = new Graph(
      [V(0), V(1), V(2)],
      [E(1, 0, 1, { distance: 1 }), E(2, 1, 2, { distance: 2 }), E(3, 0, 2, { distance: 3 })],
    );
    const mst = kruskalMST(g);
    expect(mstWeight(mst)).toBe(3);
    expect(mst.map((e) => e.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("produces a spanning FOREST on a disconnected graph", () => {
    // two components {0-1} and {2-3} -> forest has V - components = 4 - 2 = 2 edges
    const g = new Graph([V(0), V(1), V(2), V(3)], [E(1, 0, 1), E(2, 2, 3)]);
    expect(kruskalMST(g).length).toBe(2);
  });
});
