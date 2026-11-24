/**
 * src/core/types.ts — Frozen data model (see docs/00_SHARED_CONTRACTS.md §1–2).
 * This is the shared vocabulary between Person A (algorithms) and Person B (UI).
 * Do not change a type here without a changelog row in the contract doc.
 */

// ---------- Graph model (§3.1) ----------

export type VertexType =
  | "Start"
  | "Finish"
  | "Checkpoint"
  | "Intersection"
  | "FuelStation"
  | "NitroPickup"
  | "DeadEnd";

export interface Vertex {
  id: number;
  x: number;
  y: number;
  type: VertexType;
  /** Required visit order for a mandatory checkpoint; otherwise null. */
  checkpointOrder: number | null;
  /** Whether a service vertex (fuel/nitro) is currently available. */
  active: boolean;
}

export type EdgeStatus = "Open" | "Blocked" | "Restricted";

export interface Edge {
  id: number;
  from: number;
  to: number;
  distance: number; // >= 0, road length (also the straight-line lower bound for A*)
  baseTime: number; // >= 0, travel time at normal speed
  fuelCost: number; // >= 0, base fuel to traverse
  difficulty: number; // integer 1 (easy) .. 5 (hard)
  status: EdgeStatus;
  isShortcut: boolean;
  directed: boolean; // false = both directions; true = one-way from->to
  /** 0..5 static hazard penalty (0 = clear). Dynamic hazards add on top via EffectLayer. */
  obstacle?: number;
}

// ---------- Other records (§3.2) ----------

export type StrategyType =
  | "FixedMainRoute"
  | "ShortcutSeeker"
  | "MinDistance"
  | "Human";

export interface Racer {
  id: number;
  name: string;
  isHuman: boolean;
  strategyType: StrategyType;
  currentVertex: number;
  /** Fuel in integer tenths-of-a-unit (contract §5). Max fuel 100 units => 1000 tenths. */
  fuel: number;
  nitroCharges: number;
  lap: number;
  /** The checkpointOrder we still need to visit next. */
  nextCheckpoint: number;
  totalTime: number;
}

export interface RaceResult {
  raceId: number;
  racerId: number;
  finishPosition: number;
  finishTime: number;
  fastestLap: number;
  bonusPoints: number;
  pointsAwarded: number;
}

export interface ChampionshipEntry {
  racerId: number;
  totalPoints: number;
  wins: number;
  sumOfFinishPositions: number;
  bestFastestLap: number; // lower is better
}

export type EventType =
  | "RoadBlockage"
  | "ShortcutToggle"
  | "OilSpill"
  | "SpeedRestriction"
  | "FuelStationAvailability"
  | "NitroBooster";

export interface GameEvent {
  eventId: number;
  type: EventType;
  triggerTime: number;
  priority: number; // lower fires first on tie (§4.5)
  insertionSequence: number; // breaks all remaining ties -> deterministic
  targetEdgeOrVertex: number;
  duration: number; // seconds
  cancelled: boolean; // lazy deletion flag
}
