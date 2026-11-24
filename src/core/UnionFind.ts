/**
 * src/core/UnionFind.ts — disjoint-set union (union by rank + path compression).
 * Supports Kruskal's MST in near-constant amortized time per operation.
 */
export class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];
  private numSets: number;

  /** Elements are 0..n-1. Use a dense index mapping for arbitrary ids. */
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array<number>(n).fill(0);
    this.numSets = n;
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root]!;
    // path compression
    while (this.parent[x] !== root) {
      const next = this.parent[x]!;
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  /** Returns true if the two were in different sets (i.e. a union happened). */
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra]! < this.rank[rb]!) {
      this.parent[ra] = rb;
    } else if (this.rank[ra]! > this.rank[rb]!) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]!++;
    }
    this.numSets--;
    return true;
  }

  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }

  get count(): number {
    return this.numSets;
  }
}
