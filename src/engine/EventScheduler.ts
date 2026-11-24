/**
 * src/engine/EventScheduler.ts — Act 4: race-event priority queue (spec §4.5).
 *
 * Min-heap keyed by (triggerTime, priority, insertionSequence). Lower priority
 * number fires first when trigger times tie; insertionSequence makes every tie
 * deterministic. Cancellation is LAZY: a cancelled event is marked and skipped
 * when it reaches the heap top (trading a little memory for simplicity — no
 * decrease-key / removal from the middle of the heap).
 *
 * `popDue(now)` returns, in heap order, every non-cancelled event whose
 * triggerTime <= now — i.e. all events to apply at this tick, already ordered.
 */

import { BinaryHeap } from "../core/BinaryHeap";
import type { GameEvent } from "../core/types";

export type ScheduledEvent = Omit<GameEvent, "insertionSequence" | "cancelled">;

export class EventScheduler {
  private readonly heap: BinaryHeap<GameEvent>;
  private readonly byId = new Map<number, GameEvent>();
  private seq = 0;

  constructor() {
    this.heap = new BinaryHeap<GameEvent>((a, b) => {
      if (a.triggerTime !== b.triggerTime) return a.triggerTime < b.triggerTime;
      if (a.priority !== b.priority) return a.priority < b.priority;
      return a.insertionSequence < b.insertionSequence;
    });
  }

  /** Schedule an event; assigns a deterministic insertionSequence. */
  schedule(evt: ScheduledEvent): GameEvent {
    const full: GameEvent = { ...evt, insertionSequence: this.seq++, cancelled: false };
    this.byId.set(full.eventId, full);
    this.heap.push(full);
    return full;
  }

  /** Lazy cancellation: mark cancelled so it is ignored at the heap top. */
  cancel(eventId: number): boolean {
    const e = this.byId.get(eventId);
    if (!e || e.cancelled) return false;
    e.cancelled = true;
    return true;
  }

  /** Peek the next event that would fire (skips cancelled ones). */
  peek(): GameEvent | undefined {
    for (;;) {
      const top = this.heap.peek();
      if (!top) return undefined;
      if (top.cancelled) {
        this.heap.pop();
        continue;
      }
      return top;
    }
  }

  /** Extract every non-cancelled event with triggerTime <= now, in heap order. */
  popDue(now: number): GameEvent[] {
    const due: GameEvent[] = [];
    for (;;) {
      const top = this.heap.peek();
      if (!top) break;
      if (top.cancelled) {
        this.heap.pop();
        continue;
      }
      if (top.triggerTime <= now) {
        this.heap.pop();
        due.push(top);
      } else {
        break;
      }
    }
    return due;
  }

  get size(): number {
    return this.heap.size;
  }

  isEmpty(): boolean {
    return this.peek() === undefined;
  }
}
