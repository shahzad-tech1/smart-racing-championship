import { describe, it, expect } from "vitest";
import { EventScheduler, type ScheduledEvent } from "../../src/engine/EventScheduler";
import { EffectLayer } from "../../src/engine/effects";
import type { Edge } from "../../src/core/types";

function evt(e: Partial<ScheduledEvent> & { eventId: number }): ScheduledEvent {
  return {
    type: "RoadBlockage", triggerTime: 0, priority: 1, targetEdgeOrVertex: 0, duration: 0,
    ...e,
  };
}

describe("EventScheduler (min-heap, lazy deletion)", () => {
  it("orders by triggerTime, then priority, then insertion sequence", () => {
    const s = new EventScheduler();
    s.schedule(evt({ eventId: 1, triggerTime: 10, priority: 2 }));
    s.schedule(evt({ eventId: 2, triggerTime: 5, priority: 9 }));
    s.schedule(evt({ eventId: 3, triggerTime: 10, priority: 1 })); // same time, lower priority -> before #1
    s.schedule(evt({ eventId: 4, triggerTime: 10, priority: 1 })); // same time & priority -> later insertion after #3
    const order = s.popDue(100).map((e) => e.eventId);
    expect(order).toEqual([2, 3, 4, 1]);
  });

  it("breaks exact ties deterministically by insertion sequence", () => {
    const s = new EventScheduler();
    s.schedule(evt({ eventId: 7, triggerTime: 1, priority: 1 }));
    s.schedule(evt({ eventId: 8, triggerTime: 1, priority: 1 }));
    s.schedule(evt({ eventId: 9, triggerTime: 1, priority: 1 }));
    expect(s.popDue(1).map((e) => e.eventId)).toEqual([7, 8, 9]);
  });

  it("only returns events whose triggerTime <= now", () => {
    const s = new EventScheduler();
    s.schedule(evt({ eventId: 1, triggerTime: 5 }));
    s.schedule(evt({ eventId: 2, triggerTime: 20 }));
    expect(s.popDue(10).map((e) => e.eventId)).toEqual([1]);
    expect(s.popDue(10)).toEqual([]); // nothing new yet
    expect(s.popDue(25).map((e) => e.eventId)).toEqual([2]);
  });

  it("ignores cancelled events (lazy deletion)", () => {
    const s = new EventScheduler();
    s.schedule(evt({ eventId: 1, triggerTime: 5 }));
    s.schedule(evt({ eventId: 2, triggerTime: 6 }));
    expect(s.cancel(2)).toBe(true);
    expect(s.popDue(100).map((e) => e.eventId)).toEqual([1]);
  });
});

describe("EffectLayer (overlapping temporary effects)", () => {
  const base: Edge = {
    id: 42, from: 0, to: 1, distance: 100, baseTime: 10, fuelCost: 5,
    difficulty: 1, status: "Open", isShortcut: false, directed: false, obstacle: 0,
  };

  it("passes an edge through unchanged when no effects apply", () => {
    const fx = new EffectLayer();
    expect(fx.effectiveEdge(base)).toEqual(base);
  });

  it("blocks an edge under a road blockage", () => {
    const fx = new EffectLayer();
    fx.add({ sourceEventId: 1, type: "RoadBlockage", target: 42, expiresAt: Infinity });
    expect(fx.isBlocked(42)).toBe(true);
    expect(fx.effectiveEdge(base).status).toBe("Blocked");
  });

  it("takes the MAX difficulty penalty from overlapping oil spills; expiring one keeps the other", () => {
    const fx = new EffectLayer();
    fx.add({ sourceEventId: 1, type: "OilSpill", target: 42, expiresAt: 20, magnitude: 2 });
    fx.add({ sourceEventId: 2, type: "OilSpill", target: 42, expiresAt: 40, magnitude: 3 });
    expect(fx.effectiveEdge(base).difficulty).toBe(1 + 3); // max(2,3)

    fx.expire(25); // the magnitude-2 effect expired; the magnitude-3 one is still active
    expect(fx.activeCount()).toBe(1);
    expect(fx.effectiveEdge(base).difficulty).toBe(1 + 3);

    fx.expire(50); // both gone
    expect(fx.effectiveEdge(base).difficulty).toBe(1);
  });

  it("applies the strictest (minimum) speed cap, increasing effective time", () => {
    const fx = new EffectLayer();
    fx.add({ sourceEventId: 1, type: "SpeedRestriction", target: 42, expiresAt: Infinity, speedCap: 0.8 });
    fx.add({ sourceEventId: 2, type: "SpeedRestriction", target: 42, expiresAt: Infinity, speedCap: 0.5 });
    expect(fx.effectiveEdge(base).baseTime).toBeCloseTo(10 / 0.5, 9); // strictest cap 0.5
  });

  it("removeByEvent clears a specific effect's contribution", () => {
    const fx = new EffectLayer();
    fx.add({ sourceEventId: 1, type: "OilSpill", target: 42, expiresAt: Infinity, magnitude: 2 });
    fx.removeByEvent(1);
    expect(fx.effectiveEdge(base).difficulty).toBe(1);
  });
});
