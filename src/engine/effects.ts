/**
 * src/engine/effects.ts — Act 4: overlapping temporary effects (spec §4.5).
 *
 * Each active effect is stored INDEPENDENTLY with its own expiry/event id. The
 * effective edge is recomputed from all currently-active effects in a documented
 * order, so expiring one effect never erases another that is still active.
 *
 * Documented combination order:
 *   - blockage  = OR of all blockage/shortcut-close effects (blocked if any);
 *   - difficulty/obstacle penalty = MAX magnitude among active oil spills;
 *   - speed cap = STRICTEST (minimum) cap among active speed restrictions,
 *                 applied as effective time = baseTime / cap.
 * The base edge object is never mutated — effects are a derived layer on top.
 */

import type { Edge, EventType } from "../core/types";
import { withRestriction } from "../core/cost";

export interface ActiveEffect {
  sourceEventId: number;
  type: EventType;
  /** edge or vertex id the effect applies to. */
  target: number;
  /** race-clock seconds; Infinity = until reversed/cleared. */
  expiresAt: number;
  /** oil-spill difficulty/obstacle penalty (added, capped at 5). */
  magnitude?: number;
  /** speed-restriction cap in (0,1]; effective time = baseTime / cap. */
  speedCap?: number;
}

export class EffectLayer {
  private effects: ActiveEffect[] = [];

  add(effect: ActiveEffect): void {
    this.effects.push(effect);
  }

  removeByEvent(eventId: number): void {
    this.effects = this.effects.filter((e) => e.sourceEventId !== eventId);
  }

  /** Drop effects whose expiry has passed. Still-active effects are untouched. */
  expire(now: number): void {
    this.effects = this.effects.filter((e) => e.expiresAt > now);
  }

  /** All currently-stored effects targeting a given edge/vertex id. */
  private forTarget(target: number): ActiveEffect[] {
    return this.effects.filter((e) => e.target === target);
  }

  isBlocked(edgeId: number): boolean {
    return this.forTarget(edgeId).some(
      (e) => e.type === "RoadBlockage" || e.type === "ShortcutToggle",
    );
  }

  /** Derive the effective edge from the base edge + all active effects on it. */
  effectiveEdge(base: Edge): Edge {
    // a Restricted road is slow before any temporary effect is layered on (spec §3.1)
    const slowed = withRestriction(base);
    const fx = this.forTarget(base.id);
    if (fx.length === 0) return slowed;

    let status = base.status;
    if (fx.some((e) => e.type === "RoadBlockage" || e.type === "ShortcutToggle")) {
      status = "Blocked";
    }

    let penalty = 0;
    let strictestCap = 1;
    for (const e of fx) {
      if (e.type === "OilSpill" && e.magnitude) penalty = Math.max(penalty, e.magnitude);
      if (e.type === "SpeedRestriction" && e.speedCap) strictestCap = Math.min(strictestCap, e.speedCap);
    }

    return {
      ...slowed,
      status,
      difficulty: Math.min(5, base.difficulty + penalty),
      obstacle: Math.min(5, (base.obstacle ?? 0) + penalty),
      baseTime: slowed.baseTime / strictestCap,
    };
  }

  /** For tests/visualization. */
  activeCount(): number {
    return this.effects.length;
  }
}
