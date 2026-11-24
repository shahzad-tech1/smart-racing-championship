/**
 * src/core/Graph.ts — Adjacency-list graph (contract §1, spec §3.1).
 *
 * O(V+E) memory; efficient neighbour iteration for sparse circuits.
 * Dynamic updates (block/unblock edge, activate/deactivate vertex) mutate in
 * place and MUST NOT rebuild the whole graph (spec §3.1). Because the adjacency
 * list stores references to the same Edge objects held in the edge map, a status
 * change is visible everywhere immediately.
 */

import type { Edge, EdgeStatus, Vertex } from "./types";

export interface Neighbor {
  edge: Edge;
  to: number;
}

export class Graph {
  private readonly vertices = new Map<number, Vertex>();
  private readonly edges = new Map<number, Edge>();
  private readonly adj = new Map<number, Neighbor[]>();

  constructor(vertices: Vertex[], edges: Edge[]) {
    for (const v of vertices) {
      if (this.vertices.has(v.id)) throw new Error(`Duplicate vertex id ${v.id}`);
      this.vertices.set(v.id, v);
      this.adj.set(v.id, []);
    }
    for (const e of edges) {
      if (this.edges.has(e.id)) throw new Error(`Duplicate edge id ${e.id}`);
      if (!this.vertices.has(e.from)) throw new Error(`Edge ${e.id} from missing vertex ${e.from}`);
      if (!this.vertices.has(e.to)) throw new Error(`Edge ${e.id} to missing vertex ${e.to}`);
      this.edges.set(e.id, e);
      this.adj.get(e.from)!.push({ edge: e, to: e.to });
      if (!e.directed) {
        this.adj.get(e.to)!.push({ edge: e, to: e.from });
      }
    }
  }

  // ---- read ----

  getVertex(id: number): Vertex {
    const v = this.vertices.get(id);
    if (!v) throw new Error(`No vertex ${id}`);
    return v;
  }

  getEdge(id: number): Edge {
    const e = this.edges.get(id);
    if (!e) throw new Error(`No edge ${id}`);
    return e;
  }

  hasVertex(id: number): boolean {
    return this.vertices.has(id);
  }

  /**
   * Neighbours of a vertex honouring edge direction.
   * @param opts.ignoreBlocked when true, Blocked edges are excluded (route searches).
   */
  neighbors(vertexId: number, opts?: { ignoreBlocked?: boolean }): Neighbor[] {
    const list = this.adj.get(vertexId);
    if (!list) throw new Error(`No vertex ${vertexId}`);
    if (opts?.ignoreBlocked) {
      return list.filter((n) => n.edge.status !== "Blocked");
    }
    return list;
  }

  get vertexCount(): number {
    return this.vertices.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  allVertices(): Vertex[] {
    return [...this.vertices.values()];
  }

  allEdges(): Edge[] {
    return [...this.edges.values()];
  }

  // ---- dynamic updates (no full rebuild) ----

  setEdgeStatus(edgeId: number, status: EdgeStatus): void {
    this.getEdge(edgeId).status = status;
  }

  setVertexActive(vertexId: number, active: boolean): void {
    this.getVertex(vertexId).active = active;
  }

  // ---- deep copy for "what-if" routing ----

  clone(): Graph {
    const v = this.allVertices().map((x) => ({ ...x }));
    const e = this.allEdges().map((x) => ({ ...x }));
    return new Graph(v, e);
  }
}
