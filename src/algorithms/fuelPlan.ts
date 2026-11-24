/**
 * src/algorithms/fuelPlan.ts — Act 3: refuelling DP with optional station detours (spec §5.3, Problem B).
 *
 * `refuelDP` plans purchases when the stations ARE the stops of a fixed route. On a real circuit a station
 * usually hangs off a spur, so reaching it is a detour that costs fuel and time even if you buy little.
 * This DP generalises Problem B to that situation and is the planner the race engine runs for every racer.
 *
 * Model. The remaining route is a list of positions 0..P-1 (the last one is the destination).
 *   legFuel[i], legTime[i]   cost of driving position i -> i+1
 *   detour[i]                optional round trip i -> station -> i: goFuel, backFuel, time (without stop time)
 * State: arr[i][f] = minimum elapsed time on ARRIVAL at position i with f discrete fuel units.
 * Transitions at position i (at most one station stop per visit):
 *   no stop : continue with f
 *   stop    : needs f >= goFuel; arrive at the station with b = f - goFuel, buy a units with
 *             0 < a <= min(maxPurchase, capacity - b), return with f' = b + a - backFuel >= 0;
 *             time += detour.time + stopTime        (a fixed stop time for ANY positive purchase)
 *   drive   : needs f >= legFuel[i]; arrive at i+1 with f - legFuel[i], time += legTime[i]
 * Base: arr[0][startFuel] = 0. Answer: the cheapest reachable state at the destination. Reconstruction walks
 * the stored parent pointers. Unreachable states stay at Infinity (they are never expanded).
 * Complexity: O(P · C · A) time with A = maxPurchase/buyStep purchase options, O(P · C) space.
 * Fuel is an integer count of an agreed unit (the engine uses tenths of a unit, contract §5); `buyStep`
 * coarsens the purchase sizes (the engine buys whole units) to keep A small — a stated, bounded approximation.
 */

import type { AlgoTrace } from "../core/instrumentation";

export interface RoutePosition {
  legFuel: number;
  legTime: number;
  detour: { goFuel: number; backFuel: number; time: number } | null;
}

export interface FuelPlanParams {
  positions: RoutePosition[];
  capacity: number;
  startFuel: number;
  maxPurchase: number;
  stopTime: number;
  /** Purchase granularity in fuel units (default 1 = exact). */
  buyStep?: number;
}

export interface PlannedStop {
  position: number;
  /** Fuel units bought at the station. */
  buy: number;
}

export interface FuelPlanResult {
  feasible: boolean;
  /** Minimum total time (driving + detours + stop times); Infinity when infeasible. */
  totalTime: number;
  stops: PlannedStop[];
}

export function planFuelStops(p: FuelPlanParams, trace?: AlgoTrace): FuelPlanResult {
  const P = p.positions.length;
  const C = p.capacity;
  const step = Math.max(1, Math.floor(p.buyStep ?? 1));
  if (P === 0) return { feasible: true, totalTime: 0, stops: [] };

  let arr = new Float64Array(C + 1).fill(Infinity);
  arr[Math.min(Math.max(0, Math.floor(p.startFuel)), C)] = 0;

  const stopPrev: Int32Array[] = []; // stopPrev[i][f]: arrival fuel before the stop that produced post-fuel f (-1: no stop)
  const arrPrev: Int32Array[] = []; //  arrPrev[i][f]: post-stop fuel at i-1 that produced arrival fuel f at i
  let finalPost: Float64Array = arr;

  for (let i = 0; i < P; i++) {
    const pos = p.positions[i]!;
    const post = Float64Array.from(arr);
    const sp = new Int32Array(C + 1).fill(-1);
    const d = pos.detour;
    if (d) {
      for (let f = d.goFuel; f <= C; f++) {
        const t0 = arr[f]!;
        if (!Number.isFinite(t0)) continue;
        const base = f - d.goFuel;
        const maxA = Math.min(p.maxPurchase, C - base);
        for (let a = Math.min(step, maxA); a >= 1 && a <= maxA; a = a < maxA && a + step > maxA ? maxA : a + step) {
          if (trace) trace.counters.dpStatesComputed++;
          const nf = base + a - d.backFuel;
          if (nf < 0) continue;
          const t = t0 + d.time + p.stopTime;
          if (t < post[nf]!) {
            post[nf] = t;
            sp[nf] = f;
          }
        }
      }
    }
    stopPrev.push(sp);
    if (i === P - 1) {
      finalPost = post;
      break;
    }
    const next = new Float64Array(C + 1).fill(Infinity);
    const ap = new Int32Array(C + 1).fill(-1);
    for (let f = pos.legFuel; f <= C; f++) {
      const t0 = post[f]!;
      if (!Number.isFinite(t0)) continue;
      if (trace) trace.counters.dpStatesComputed++;
      const nf = f - pos.legFuel;
      const t = t0 + pos.legTime;
      if (t < next[nf]!) {
        next[nf] = t;
        ap[nf] = f;
      }
    }
    arrPrev.push(ap);
    arr = next;
  }

  let best = Infinity;
  let bestF = -1;
  for (let f = 0; f <= C; f++) {
    if (finalPost[f]! < best) {
      best = finalPost[f]!;
      bestF = f;
    }
  }
  if (!Number.isFinite(best)) return { feasible: false, totalTime: Infinity, stops: [] };

  const stops: PlannedStop[] = [];
  let f = bestF;
  for (let i = P - 1; i >= 0; i--) {
    const prev = stopPrev[i]![f]!;
    if (prev !== -1) {
      const d = p.positions[i]!.detour!;
      stops.push({ position: i, buy: f - prev + d.goFuel + d.backFuel });
      f = prev;
    }
    if (i > 0) f = arrPrev[i - 1]![f]!;
  }
  stops.reverse();
  return { feasible: true, totalTime: best, stops };
}
