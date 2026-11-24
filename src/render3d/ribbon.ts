import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * Ribbon geometry helpers: extrude a flat strip (or vertical wall) along a polyline.
 * `u` runs across the strip (0..1); `v` runs along it in world units / vRepeat.
 */
export interface Polyline {
  pts: Vector3[];
  /** cumulative arc length per point */
  cum: number[];
  len: number;
}

export function makePolyline(pts: Vector3[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
  return { pts, cum, len: cum[cum.length - 1]! };
}

/** Sample position + horizontal tangent at distance `s` along the polyline. */
export function sampleAt(pl: Polyline, s: number, outPos: Vector3, outTan?: Vector3): void {
  const d = Math.min(pl.len, Math.max(0, s));
  let lo = 0;
  let hi = pl.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pl.cum[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const a = pl.pts[lo]!;
  const b = pl.pts[hi]!;
  const seg = pl.cum[hi]! - pl.cum[lo]!;
  const k = seg > 1e-6 ? (d - pl.cum[lo]!) / seg : 0;
  outPos.lerpVectors(a, b, k);
  if (outTan) {
    outTan.set(b.x - a.x, 0, b.z - a.z);
    if (outTan.lengthSq() < 1e-9) outTan.set(0, 0, 1);
    outTan.normalize();
  }
}

function sideOf(tx: number, tz: number): [number, number] {
  // horizontal unit vector to the "right-hand" side of travel direction
  return [-tz, tx];
}

/**
 * Flat strip between lateral offsets [o0, o1] from the centre line, over arc range [s0, s1].
 * `yOff` is added to the centre-line height.
 */
export function ribbon(pl: Polyline, o0: number, o1: number, yOff: number, s0 = 0, s1 = pl.len, vRepeat = 16): BufferGeometry {
  const n = Math.max(2, Math.ceil((s1 - s0) / 4));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    sampleAt(pl, s, p, t);
    const [sx, sz] = sideOf(t.x, t.z);
    pos.push(p.x + sx * o0, p.y + yOff, p.z + sz * o0, p.x + sx * o1, p.y + yOff, p.z + sz * o1);
    const v = s / vRepeat;
    uv.push(0, v, 1, v);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // counter-clockwise seen from above (+Y normal)
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical wall at lateral offset `o`, between heights y0 and y1 relative to the centre line. */
export function wall(pl: Polyline, o: number, y0: number, y1: number, s0 = 0, s1 = pl.len, flip = false): BufferGeometry {
  const n = Math.max(2, Math.ceil((s1 - s0) / 4));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    sampleAt(pl, s, p, t);
    const [sx, sz] = sideOf(t.x, t.z);
    pos.push(p.x + sx * o, p.y + y0, p.z + sz * o, p.x + sx * o, p.y + y1, p.z + sz * o);
    uv.push(s / 8, 0, s / 8, 1);
    if (i < n) {
      const a = i * 2;
      if (flip) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
