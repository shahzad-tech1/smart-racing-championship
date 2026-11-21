import { describe, it, expect } from "vitest";
import { buildCircuit1 } from "../../src/data/circuits/circuit1";

describe("Graph (circuit1)", () => {
  it("builds with the expected size", () => {
    const g = buildCircuit1();
    expect(g.vertexCount).toBe(16);
    expect(g.edgeCount).toBe(19);
  });

  it("neighbours honour undirected edges", () => {
    const g = buildCircuit1();
    // vertex 0 touches edge 1 (0->1) and edge 12 (11-0, undirected) => neighbours 1 and 11
    const tos = g.neighbors(0).map((n) => n.to).sort((a, b) => a - b);
    expect(tos).toEqual([1, 11]);
  });

  it("ignoreBlocked excludes blocked edges from route searches", () => {
    const g = buildCircuit1();
    expect(g.neighbors(0, { ignoreBlocked: true }).length).toBe(2);
    g.setEdgeStatus(1, "Blocked"); // the 0->1 edge
    expect(g.neighbors(0, { ignoreBlocked: true }).map((n) => n.to)).toEqual([11]);
    // without the filter, the blocked edge is still listed
    expect(g.neighbors(0).length).toBe(2);
  });

  it("setEdgeStatus mutates in place without rebuilding (object identity preserved)", () => {
    const g = buildCircuit1();
    const otherBefore = g.getEdge(5);
    const neighborEdgeBefore = g.neighbors(0)[0]!.edge;
    g.setEdgeStatus(3, "Restricted");
    expect(g.getEdge(3).status).toBe("Restricted");
    // unrelated edge object is the very same instance
    expect(g.getEdge(5)).toBe(otherBefore);
    // adjacency holds the same edge instances (so a status change is visible everywhere)
    expect(g.neighbors(0)[0]!.edge).toBe(neighborEdgeBefore);
  });

  it("clone is independent of the original", () => {
    const g = buildCircuit1();
    const c = g.clone();
    c.setEdgeStatus(1, "Blocked");
    expect(c.getEdge(1).status).toBe("Blocked");
    expect(g.getEdge(1).status).toBe("Open");
  });

  it("throws on unknown vertex/edge instead of returning undefined", () => {
    const g = buildCircuit1();
    expect(() => g.getVertex(999)).toThrow();
    expect(() => g.getEdge(999)).toThrow();
  });
});
