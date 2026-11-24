/**
 * src/algorithms/refuel.ts — Act 3: refuelling DP (spec §5.3, Problem B).
 *
 * For a fixed route whose ordered stops are fuel stations 0..m-1 followed by the
 * destination m, let legFuel[j] be the fuel needed from stop j to j+1 and C the
 * tank capacity. dp[j][f] = minimum additional stop time to arrive at stop j with
 * f discrete fuel units. At an available station buy a units with
 * 0 <= a <= min(C - f, maxPurchase); a non-station stop allows no purchase.
 * If f + a >= legFuel[j], transition to dp[j+1][f + a - legFuel[j]].
 * A positive purchase costs a fixed stopTime; buying nothing costs 0.
 *
 * ALL fuel values are integer tenths-of-a-unit (contract §5): 100 units = 1000,
 * a 40-unit max purchase = 400. The destination is feasible iff a reachable state
 * arrives with non-negative fuel. Direct complexity O(m·C²).
 */

import type { AlgoTrace } from "../core/instrumentation";

export interface RefuelParams {
  /** Fuel needed on each leg j -> j+1, in tenths. length m. */
  legFuel: number[];
  /** Tank capacity in tenths. */
  capacity: number;
  /** Starting fuel in tenths. */
  startFuel: number;
  /** Whether stop j is an available station you may buy at. length m. */
  stations: boolean[];
  /** Max purchase per stop, in tenths (default 400 = 40 units). */
  maxPurchase?: number;
  /** Fixed time cost for any positive purchase (default 0). */
  stopTime?: number;
}

export interface RefuelResult {
  feasible: boolean;
  minStopTime: number;
  /** Units (tenths) to buy at each stop j; 0 where nothing is bought. length m. */
  purchases: number[];
}

export function refuelDP(params: RefuelParams, trace?: AlgoTrace): RefuelResult {
  const { legFuel, capacity: C, startFuel } = params;
  const maxPurchase = params.maxPurchase ?? 400;
  const stopTime = params.stopTime ?? 0;
  const m = legFuel.length;

  const INF = Infinity;
  // cur[f] = min stop-time to be at the current stop with f fuel
  let cur = new Array<number>(C + 1).fill(INF);
  const f0 = Math.min(Math.max(0, startFuel), C);
  cur[f0] = 0;

  // parents[j][arriveFuel] = how we reached stop j+1 with arriveFuel
  const parents: Array<Array<{ fromF: number; buy: number } | null>> = [];

  for (let j = 0; j < m; j++) {
    const d = legFuel[j]!;
    const canBuy = params.stations[j] ?? false;
    const next = new Array<number>(C + 1).fill(INF);
    const par: Array<{ fromF: number; buy: number } | null> = new Array(C + 1).fill(null);

    for (let f = 0; f <= C; f++) {
      if (!Number.isFinite(cur[f]!)) continue;
      const maxA = canBuy ? Math.min(C - f, maxPurchase) : 0;
      for (let a = 0; a <= maxA; a++) {
        if (trace) trace.counters.dpStatesComputed++;
        const nf = f + a;
        if (nf < d) continue; // not enough fuel to cross this leg
        const arrive = nf - d;
        const cand = cur[f]! + (a > 0 ? stopTime : 0);
        if (cand < next[arrive]!) {
          next[arrive] = cand;
          par[arrive] = { fromF: f, buy: a };
        }
      }
    }
    parents.push(par);
    cur = next;
  }

  // destination = stop m; pick the reachable state with least stop time
  let best = INF;
  let bestFuel = -1;
  for (let f = 0; f <= C; f++) {
    if (cur[f]! < best) {
      best = cur[f]!;
      bestFuel = f;
    }
  }
  if (!Number.isFinite(best)) {
    return { feasible: false, minStopTime: INF, purchases: [] };
  }

  // reconstruct purchases
  const purchases = new Array<number>(m).fill(0);
  let f = bestFuel;
  for (let j = m - 1; j >= 0; j--) {
    const p = parents[j]![f]!;
    purchases[j] = p.buy;
    f = p.fromF;
  }

  return { feasible: true, minStopTime: best, purchases };
}
