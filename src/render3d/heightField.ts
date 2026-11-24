/**
 * src/render3d/heightField.ts — deterministic terrain height (pure, unit-tested).
 * World convention: graph (x, y) -> world (x, height, z = y). 1 world unit = WORLD_M_PER_UNIT metres.
 */

export const WORLD_M_PER_UNIT = 1.8;

/** Gentle rolling hills; amplitude ~9 units, slopes under ~12 degrees. */
export function heightAt(x: number, z: number): number {
  return (
    5.2 * Math.sin(x * 0.0125 + 0.7) * Math.cos(z * 0.0105 - 0.3) +
    3.1 * Math.sin((x + z) * 0.021 + 1.9) +
    1.6 * Math.cos(x * 0.043 - z * 0.037)
  );
}

/** Arch profile for a bridged shortcut: 0 at the ends, `peak` mid-span (smooth). */
export function bridgeLift(t: number, peak: number): number {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  return peak * s * s;
}

/** Display speed (km/h) from world units per second. */
export function kmh(unitsPerSecond: number): number {
  return unitsPerSecond * WORLD_M_PER_UNIT * 3.6;
}
