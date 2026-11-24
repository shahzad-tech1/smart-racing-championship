/**
 * src/core/BinaryHeap.ts — a generic binary min-heap.
 *
 * Written ONCE and reused by: A* / Dijkstra (priority queue), the race event
 * scheduler (Act 4), and top-k retrieval (Act 5). O(log n) push/pop, O(1) peek.
 *
 * It is a pure data structure: it does not touch counters. Callers that need to
 * report heapPushes/heapPops for the Lab or experiments increment their own
 * AlgoTrace counters around push()/pop().
 *
 * `less(a, b)` must return true when `a` should come out before `b` (i.e. `a`
 * has higher priority / is "smaller"). Provide a total order for determinism.
 */

export class BinaryHeap<T> {
  private readonly data: T[] = [];

  constructor(private readonly less: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  /** Read-only copy of the underlying array (heap order) — used by the Lab's heap view. */
  snapshot(): T[] {
    return this.data.slice();
  }

  peek(): T | undefined {
    return this.data[0];
  }

  push(value: T): void {
    this.data.push(value);
    this.siftUp(this.data.length - 1);
  }

  pop(): T | undefined {
    const n = this.data.length;
    if (n === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (n > 1) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    const { data, less } = this;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(data[i]!, data[parent]!)) break;
      [data[i], data[parent]] = [data[parent]!, data[i]!];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const { data, less } = this;
    const n = data.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && less(data[left]!, data[smallest]!)) smallest = left;
      if (right < n && less(data[right]!, data[smallest]!)) smallest = right;
      if (smallest === i) break;
      [data[i], data[smallest]] = [data[smallest]!, data[i]!];
      i = smallest;
    }
  }
}
