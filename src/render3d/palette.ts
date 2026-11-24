/**
 * src/render3d/palette.ts — neutral scene-art colours (asphalt, rubber, concrete, foliage…).
 * Brand colours (lime / cyan / danger / warning / nitro) are NOT here: they are read from the
 * CSS design tokens at runtime by theme.ts, so tokens.css stays the single brand source.
 */
export const ART = {
  asphalt: 0x1a1d21,
  asphaltWet: 0x101316,
  shoulder: 0x2a2a26,
  gravel: 0x4a4639,
  rubber: 0x0a0a0b,
  carbon: 0x0d0e10,
  steel: 0x8b949c,
  concrete: 0x464b50,
  concreteDark: 0x2a2e32,
  garageFloor: 0x0c0e10,
  wall: 0x14181c,
  grassA: 0x1c3a22,
  grassB: 0x274a2a,
  trunk: 0x3a2a1e,
  leafA: 0x1e4a2a,
  leafB: 0x2d6a36,
  barrierWhite: 0xd9dde0,
  barrierRed: 0xc22b2b,
  gold: 0xf2b630,
  sky: 0x070a10,
  horizon: 0x1b2a3c,
  fog: 0x0a0f16,
} as const;
