import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SpotLight,
  Vector3,
  BufferAttribute,
  type Material,
} from 'three';
import type { Graph } from '../core/Graph.ts';
import type { Edge, Vertex } from '../core/types.ts';
import type { CircuitMeta } from '../data/circuits/meta.ts';
import { makeRng } from '../core/rng.ts';
import type { Quality, Weather } from '../state/Settings.ts';
import { ART } from './palette.ts';
import { PropKit } from './props.ts';
import { createSky, curbTexture, grassTexture, roadTexture } from './procedural.ts';
import { bridgeLift, heightAt } from './heightField.ts';
import { makePolyline, ribbon, sampleAt, wall, type Polyline } from './ribbon.ts';
import type { Theme } from './theme.ts';
import { ParticlePool, RainField } from './ParticlePool.ts';
import { smokeTexture } from './procedural.ts';
import { PlaneGeometry as PG } from 'three';

export const ROAD_W = 9;
export const SHORTCUT_W = 7;
const ROAD_Y = 0.05;

export interface WorldOptions {
  theme: Theme;
  quality: Quality;
  weather: Weather;
  meta: CircuitMeta;
  /** Shadow-casting moon light; extent is the half-size of the shadow box. */
  shadowExtent?: number;
}

interface BarricadeVisual {
  edgeId: number;
  group: Group;
  warn: Group[];
  k: number;
  beacons: MeshStandardMaterial[];
}

interface EdgeFx {
  oil?: Mesh;
  oilK: number;
  oilOn: boolean;
  speed?: Group[];
  speedOn: boolean;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function bounce(t: number): number {
  // ease-out with a single overshoot, for the closure "drop-in"
  const c = 1.9;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

export class TrackWorld {
  readonly group = new Group();
  readonly bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, cx: 0, cz: 0, size: 0 };
  readonly moon: DirectionalLight;
  readonly rain: RainField | null;
  readonly dust: ParticlePool;
  private readonly kit: PropKit;
  private readonly polys = new Map<number, Polyline>();
  private readonly vertexY = new Map<number, number>();
  private readonly barricades = new Map<number, BarricadeVisual>();
  private readonly fx = new Map<number, EdgeFx>();
  private readonly fuel = new Map<number, ReturnType<PropKit['fuelStation']>>();
  private readonly nitro = new Map<number, ReturnType<PropKit['nitroPickup']>>();
  private readonly gates = new Map<number, { led: MeshStandardMaterial; order: number }>();
  private startLights: MeshStandardMaterial[] = [];
  private checkpointsReached = 0;
  private readonly roadMat: MeshStandardMaterial;
  private readonly rand: () => number;
  private flashClock = 0;

  constructor(readonly graph: Graph, readonly opts: WorldOptions) {
    const { theme, quality, weather, meta } = opts;
    this.kit = new PropKit(theme);
    this.rand = makeRng(0x5eed + meta.checkpointOrder.length * 31 + graph.allVertices().length);
    const wet = weather === 'rain';

    this.computeBounds();
    this.buildPolylines();

    // ---- atmosphere
    const fogColor = new Color(ART.fog);
    this.group.add(new Group()); // keeps child order stable for tests/debug
    const sky = createSky(new Color(ART.sky), new Color(ART.horizon), new Color(0x2a4b6e).multiplyScalar(wet ? 0.5 : 1));
    sky.position.set(this.bounds.cx, 0, this.bounds.cz);
    this.group.add(sky);
    this.fog = new FogExp2(fogColor.getHex(), wet ? 0.0026 : 0.0013);

    const hemi = new HemisphereLight(0x8fb0e0, 0x1a2418, 1.05);
    this.group.add(hemi);
    this.moon = new DirectionalLight(0xbfd2ff, 2.1);
    const ext = opts.shadowExtent ?? 90;
    this.moon.castShadow = quality !== 'low';
    this.moon.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 600;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.6;
    this.moon.position.set(this.bounds.cx - 120, 220, this.bounds.cz + 90);
    this.moon.target.position.set(this.bounds.cx, 0, this.bounds.cz);
    this.group.add(this.moon, this.moon.target);

    // ---- materials
    const roadTex = roadTexture({ wet });
    this.roadMat = new MeshStandardMaterial({
      map: roadTex,
      roughness: wet ? 0.3 : 0.62,
      metalness: wet ? 0.35 : 0.08,
      envMapIntensity: 1,
    });

    this.buildTerrain();
    this.buildRoads(wet);
    this.buildBridges();
    this.buildBarriers();
    this.buildVertexProps();
    this.buildScenery(quality);

    this.dust = new ParticlePool(900, smokeTexture(), false);
    this.group.add(this.dust.points);
    this.rain = wet ? new RainField(quality === 'high' ? 5000 : 2800) : null;
    if (this.rain) this.group.add(this.rain.lines);
    this.sync(0, 0);
  }

  /** Scene fog for this world (assign to `scene.fog`). */
  readonly fog: FogExp2;

  // ------------------------------------------------------------------ queries
  heightOnRoad(x: number, z: number): number {
    return heightAt(x, z);
  }

  vertexPos(id: number, out: Vector3): Vector3 {
    const v = this.graph.getVertex(id);
    return out.set(v.x, (this.vertexY.get(id) ?? heightAt(v.x, v.y)) + ROAD_Y, v.y);
  }

  /**
   * Point on an edge while travelling from `fromVertex`. `progress` in [0,1]; `lane` is the lateral
   * offset in world units. Writes the position and the (horizontal) direction of travel.
   */
  pointOnEdge(edge: Edge, fromVertex: number, progress: number, lane: number, outPos: Vector3, outDir: Vector3): void {
    const pl = this.polys.get(edge.id);
    if (!pl) {
      this.vertexPos(fromVertex, outPos);
      outDir.set(0, 0, 1);
      return;
    }
    const forward = fromVertex === edge.from;
    const p = Math.min(1, Math.max(0, progress));
    sampleAt(pl, (forward ? p : 1 - p) * pl.len, outPos, outDir);
    if (!forward) outDir.negate();
    outPos.x += -outDir.z * lane;
    outPos.z += outDir.x * lane;
    outPos.y += ROAD_Y + 0.02;
  }

  edgeMidpoint(edgeId: number, out: Vector3): Vector3 {
    const pl = this.polys.get(edgeId);
    if (!pl) return out.set(0, 0, 0);
    sampleAt(pl, pl.len / 2, out);
    return out;
  }

  edgePolyline(edgeId: number): Polyline | undefined {
    return this.polys.get(edgeId);
  }

  // ------------------------------------------------------------------ build
  private computeBounds(): void {
    const vs = this.graph.allVertices();
    const b = this.bounds;
    b.minX = Math.min(...vs.map((v) => v.x));
    b.maxX = Math.max(...vs.map((v) => v.x));
    b.minZ = Math.min(...vs.map((v) => v.y));
    b.maxZ = Math.max(...vs.map((v) => v.y));
    b.cx = (b.minX + b.maxX) / 2;
    b.cz = (b.minZ + b.maxZ) / 2;
    b.size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    for (const v of vs) this.vertexY.set(v.id, heightAt(v.x, v.y));
  }

  private isBridge(e: Edge): boolean {
    return e.isShortcut;
  }

  private buildPolylines(): void {
    for (const e of this.graph.allEdges()) {
      const a = this.graph.getVertex(e.from);
      const b = this.graph.getVertex(e.to);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(2, Math.ceil(len / (this.isBridge(e) ? 4 : 6)));
      const peak = 7 + (e.id % 2) * 4.5;
      const pts: Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a.x + (b.x - a.x) * t;
        const z = a.y + (b.y - a.y) * t;
        const y = heightAt(x, z) + (this.isBridge(e) ? bridgeLift(t, peak) : 0);
        pts.push(new Vector3(x, y, z));
      }
      this.polys.set(e.id, makePolyline(pts));
    }
  }

  private roadWidth(e: Edge): number {
    return e.isShortcut ? SHORTCUT_W : ROAD_W;
  }

  private buildTerrain(): void {
    const b = this.bounds;
    const SIZE = b.size + 1100;
    const SEG = this.opts.quality === 'low' ? 140 : 240;
    const geo = new PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const ground = this.graph.allEdges().filter((e) => !this.isBridge(e));
    const segs = ground.map((e) => {
      const a = this.graph.getVertex(e.from);
      const c = this.graph.getVertex(e.to);
      return { ax: a.x, az: a.y, bx: c.x, bz: c.y, w: this.roadWidth(e) };
    });
    const verts = this.graph.allVertices();
    const cA = new Color(ART.grassA);
    const cB = new Color(ART.grassB);
    const tmp = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + b.cx;
      const z = pos.getZ(i) + b.cz;
      let best = Infinity;
      let bestY = 0;
      let bestHalf = ROAD_W / 2;
      for (const s of segs) {
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
        const qx = s.ax + dx * t;
        const qz = s.az + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (d < best) {
          best = d;
          bestY = heightAt(qx, qz);
          bestHalf = s.w / 2;
        }
      }
      for (const v of verts) {
        const d = Math.hypot(x - v.x, z - v.y);
        if (d < best) {
          best = d;
          bestY = heightAt(v.x, v.y);
          bestHalf = ROAD_W / 2;
        }
      }
      const h0 = heightAt(x, z);
      const corridor = bestHalf + 6.5;
      const blend = smooth(corridor, corridor + 22, best);
      const y = (bestY - 0.12) * (1 - blend) + h0 * blend;
      pos.setXYZ(i, x - b.cx, y, z - b.cz);
      const n = (Math.sin(x * 0.07) * Math.cos(z * 0.06) + Math.sin((x + z) * 0.13)) * 0.25 + 0.5;
      tmp.copy(cA).lerp(cB, Math.min(1, Math.max(0, n)));
      const shade = 0.7 + 0.3 * (1 - Math.min(1, best / 80));
      colors[i * 3] = tmp.r * shade;
      colors[i * 3 + 1] = tmp.g * shade;
      colors[i * 3 + 2] = tmp.b * shade;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const gt = grassTexture('#3f7a45', '#56994f');
    gt.repeat.set(SIZE / 24, SIZE / 24);
    const terrain = new Mesh(geo, new MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 1, metalness: 0 }));
    terrain.position.set(b.cx, 0, b.cz);
    terrain.receiveShadow = true;
    this.group.add(terrain);
  }

  private buildRoads(wet: boolean): void {
    const curb = new MeshStandardMaterial({ map: curbTexture(), roughness: wet ? 0.35 : 0.7 });
    const gravel = new MeshStandardMaterial({ color: ART.gravel, roughness: 1 });
    const shortcutMat = this.roadMat.clone();
    shortcutMat.color = new Color(0xc9d2da);
    const amber = new MeshStandardMaterial({ color: 0x000000, emissive: this.opts.theme.warning, emissiveIntensity: 1.6 });
    for (const e of this.graph.allEdges()) {
      const pl = this.polys.get(e.id)!;
      const w = this.roadWidth(e);
      const bridge = this.isBridge(e);
      const road = new Mesh(ribbon(pl, -w / 2, w / 2, ROAD_Y, 0, pl.len, 16), bridge ? shortcutMat : this.roadMat);
      road.receiveShadow = true;
      this.group.add(road);
      if (!bridge) {
        const run = new Mesh(ribbon(pl, -w / 2 - 6, w / 2 + 6, -0.04, 0, pl.len, 10), gravel);
        run.receiveShadow = true;
        this.group.add(run);
        const s0 = 11;
        const s1 = pl.len - 11;
        if (s1 > s0 + 8) {
          for (const sgn of [-1, 1]) {
            const o0 = sgn * (w / 2);
            const o1 = sgn * (w / 2 + 0.9);
            const c = new Mesh(ribbon(pl, Math.min(o0, o1), Math.max(o0, o1), ROAD_Y + 0.05, s0, s1, 3.2), curb);
            c.receiveShadow = true;
            this.group.add(c);
          }
        }
      } else {
        // amber glow lines mark a shortcut
        for (const sgn of [-1, 1]) {
          const o = sgn * (w / 2 - 0.25);
          const g = new Mesh(ribbon(pl, o - 0.12, o + 0.12, ROAD_Y + 0.03, 6, pl.len - 6, 16), amber);
          this.group.add(g);
        }
      }
    }
    // junction discs hide the overlap of road ends
    const disc = this.kit.mat('disc', () => new MeshStandardMaterial({ map: this.roadMat.map, color: 0xffffff, roughness: wet ? 0.3 : 0.65, metalness: wet ? 0.3 : 0.08, polygonOffset: true, polygonOffsetFactor: -3 }));
    for (const v of this.graph.allVertices()) {
      const m = new Mesh(this.kit.groundDisc(ROAD_W * 0.84, 0x1c1f23).geometry, disc);
      m.rotation.x = -Math.PI / 2;
      m.position.set(v.x, (this.vertexY.get(v.id) ?? 0) + ROAD_Y + 0.012, v.y);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  private buildBridges(): void {
    const concrete = this.kit.concrete().clone();
    concrete.side = DoubleSide;
    const rail = this.kit.mat('rail', () => new MeshStandardMaterial({ color: 0xaab3bb, metalness: 0.7, roughness: 0.35 }));
    const pillarGeo = new CylinderGeometry(0.9, 1.1, 1, 12);
    const pillars: Array<{ x: number; z: number; y0: number; y1: number }> = [];
    for (const e of this.graph.allEdges()) {
      if (!this.isBridge(e)) continue;
      const pl = this.polys.get(e.id)!;
      const w = SHORTCUT_W;
      const side = new Mesh(wall(pl, -w / 2 - 0.3, -1.1, 0.0, 0, pl.len), concrete);
      const side2 = new Mesh(wall(pl, w / 2 + 0.3, -1.1, 0.0, 0, pl.len, true), concrete);
      const under = new Mesh(ribbon(pl, -w / 2 - 0.3, w / 2 + 0.3, -1.1, 0, pl.len, 8), concrete);
      for (const m of [side, side2, under]) {
        m.castShadow = true;
        m.receiveShadow = true;
        this.group.add(m);
      }
      for (const sgn of [-1, 1]) {
        const parapet = new Mesh(wall(pl, sgn * (w / 2 + 0.2), 0.1, 0.95, 0, pl.len, sgn > 0), rail);
        this.group.add(parapet);
      }
      const p = new Vector3();
      for (let s = 28; s < pl.len - 20; s += 34) {
        sampleAt(pl, s, p);
        const g = heightAt(p.x, p.z);
        if (p.y - g > 2) pillars.push({ x: p.x, z: p.z, y0: g - 0.3, y1: p.y - 1.1 });
      }
    }
    if (pillars.length) {
      const inst = new InstancedMesh(pillarGeo, concrete, pillars.length);
      const o = new Object3D();
      pillars.forEach((pi, i) => {
        o.position.set(pi.x, (pi.y0 + pi.y1) / 2, pi.z);
        o.scale.set(1, pi.y1 - pi.y0, 1);
        o.updateMatrix();
        inst.setMatrixAt(i, o.matrix);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      this.group.add(inst);
    }
  }

  private nearVertex(x: number, z: number, r: number): boolean {
    for (const v of this.graph.allVertices()) if (Math.hypot(x - v.x, z - v.y) < r) return true;
    return false;
  }

  private distToGroundRoad(x: number, z: number): number {
    let best = Infinity;
    for (const e of this.graph.allEdges()) {
      if (this.isBridge(e)) continue;
      const a = this.graph.getVertex(e.from);
      const c = this.graph.getVertex(e.to);
      const dx = c.x - a.x;
      const dz = c.y - a.y;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.y) * dz) / l2));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.y + dz * t)));
    }
    return best;
  }

  private buildBarriers(): void {
    const items: Array<{ x: number; y: number; z: number; ry: number; red: boolean }> = [];
    const p = new Vector3();
    const t = new Vector3();
    for (const e of this.graph.allEdges()) {
      if (this.isBridge(e)) continue;
      const pl = this.polys.get(e.id)!;
      const w = this.roadWidth(e);
      let k = 0;
      for (let s = 14; s < pl.len - 14; s += 3.2, k++) {
        sampleAt(pl, s, p, t);
        const ry = Math.atan2(t.x, t.z);
        for (const sgn of [-1, 1]) {
          const o = sgn * (w / 2 + 3.4);
          const x = p.x - t.z * o;
          const z = p.z + t.x * o;
          if (this.nearVertex(x, z, 15)) continue;
          items.push({ x, y: p.y, z, ry, red: k % 2 === 0 });
        }
      }
    }
    if (!items.length) return;
    const geo = new BoxGeometry(0.5, 0.85, 3.1);
    const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.1 });
    const inst = new InstancedMesh(geo, mat, items.length);
    const o = new Object3D();
    const red = new Color(ART.barrierRed);
    const white = new Color(ART.barrierWhite);
    items.forEach((it, i) => {
      o.position.set(it.x, it.y + 0.4, it.z);
      o.rotation.set(0, it.ry, 0);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
      inst.setColorAt(i, it.red ? red : white);
    });
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  private orientationAt(v: Vertex): number {
    // heading along the main route: from the previous checkpoint (or start/finish) into this vertex
    const meta = this.opts.meta;
    const order = meta.checkpointOrder;
    let prevId: number | undefined;
    let nextId: number | undefined;
    const idx = order.indexOf(v.id);
    if (v.id === meta.startVertex) nextId = order[0];
    else if (v.id === meta.finishVertex) prevId = order[order.length - 1];
    else if (idx >= 0) prevId = idx === 0 ? meta.startVertex : order[idx - 1];
    const pv = prevId !== undefined && this.graph.hasVertex(prevId) ? this.graph.getVertex(prevId) : null;
    const nv = nextId !== undefined && this.graph.hasVertex(nextId) ? this.graph.getVertex(nextId) : null;
    if (pv) return Math.atan2(v.x - pv.x, v.y - pv.y);
    if (nv) return Math.atan2(nv.x - v.x, nv.y - v.y);
    const nb = this.graph.neighbors(v.id, { ignoreBlocked: false })[0];
    if (nb) {
      const o = this.graph.getVertex(nb.to);
      return Math.atan2(o.x - v.x, o.y - v.y);
    }
    return 0;
  }

  private buildVertexProps(): void {
    const meta = this.opts.meta;
    const theme = this.opts.theme;
    for (const v of this.graph.allVertices()) {
      const y = (this.vertexY.get(v.id) ?? 0) + ROAD_Y;
      const ry = this.orientationAt(v);
      const place = (g: Object3D): void => {
        g.position.set(v.x, y, v.y);
        g.rotation.y = ry;
        this.group.add(g);
      };
      if (v.type === 'Checkpoint') {
        const gate = this.kit.gate(ROAD_W, 'checkpoint', String(v.checkpointOrder ?? ''));
        place(gate.group);
        this.gates.set(v.id, { led: gate.led, order: v.checkpointOrder ?? 0 });
      } else if (v.type === 'Start') {
        const gate = this.kit.gate(ROAD_W, 'start', 'START');
        place(gate.group);
        this.startLights = gate.lights;
        const strip = this.kit.checkerStrip(ROAD_W);
        strip.position.set(v.x, y + 0.03, v.y);
        strip.rotation.z = -ry;
        this.group.add(strip);
        this.buildGrandstand(v, ry);
      } else if (v.type === 'Finish') {
        const gate = this.kit.gate(ROAD_W, 'finish', 'FINISH');
        place(gate.group);
        const strip = this.kit.checkerStrip(ROAD_W);
        strip.position.set(v.x, y + 0.03, v.y);
        strip.rotation.z = -ry;
        this.group.add(strip);
      } else if (v.type === 'FuelStation') {
        const f = this.kit.fuelStation();
        // face the closest road: orient along the connecting edge
        const nb = this.graph.neighbors(v.id, { ignoreBlocked: false })[0];
        let a = 0;
        if (nb) {
          const o = this.graph.getVertex(nb.to);
          a = Math.atan2(o.x - v.x, o.y - v.y) + Math.PI / 2;
        }
        f.group.position.set(v.x, y, v.y);
        f.group.rotation.y = a;
        this.group.add(f.group);
        this.fuel.set(v.id, f);
      } else if (v.type === 'NitroPickup') {
        const n = this.kit.nitroPickup();
        n.group.position.set(v.x, y, v.y);
        this.group.add(n.group);
        this.nitro.set(v.id, n);
      } else if (v.type === 'DeadEnd') {
        const d = this.kit.deadEnd(ROAD_W);
        const nb = this.graph.neighbors(v.id, { ignoreBlocked: false })[0];
        let a = 0;
        if (nb) {
          const o = this.graph.getVertex(nb.to);
          a = Math.atan2(v.x - o.x, v.y - o.y);
        }
        d.position.set(v.x, y, v.y);
        d.rotation.y = a;
        this.group.add(d);
      }
    }

    // static obstacles from edge.obstacle: cone/tyre clusters at the lane edge (cars pass beside them)
    const cone = new ConeGeometry(0.34, 0.9, 10);
    const coneMat = new MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 });
    const cones: Array<{ x: number; y: number; z: number }> = [];
    const p = new Vector3();
    const t = new Vector3();
    for (const e of this.graph.allEdges()) {
      if (!e.obstacle || e.obstacle <= 0) continue;
      const pl = this.polys.get(e.id)!;
      const w = this.roadWidth(e);
      for (let i = 0; i < 4 + e.obstacle * 2; i++) {
        sampleAt(pl, pl.len * (0.46 + i * 0.012), p, t);
        const o = (i % 2 === 0 ? 1 : -1) * (w / 2 - 0.9);
        cones.push({ x: p.x - t.z * o, y: p.y + ROAD_Y + 0.45, z: p.z + t.x * o });
      }
      const sign = this.kit.warningTriangle('!');
      sampleAt(pl, pl.len * 0.4, p, t);
      sign.position.set(p.x - t.z * (w / 2 + 1.4), p.y, p.z + t.x * (w / 2 + 1.4));
      sign.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
      this.group.add(sign);
    }
    if (cones.length) {
      const inst = new InstancedMesh(cone, coneMat, cones.length);
      const o = new Object3D();
      cones.forEach((c, i) => {
        o.position.set(c.x, c.y, c.z);
        o.updateMatrix();
        inst.setMatrixAt(i, o.matrix);
      });
      inst.castShadow = true;
      this.group.add(inst);
    }
    void meta;
    void theme;
  }

  private buildGrandstand(v: Vertex, ry: number): void {
    const y = (this.vertexY.get(v.id) ?? 0) + ROAD_Y;
    const stand = this.kit.grandstand(64);
    const dirX = Math.sin(ry);
    const dirZ = Math.cos(ry);
    // left of travel, set back from the barrier
    const off = ROAD_W / 2 + 26;
    stand.position.set(v.x - dirZ * off, y + 0.2, v.y + dirX * off);
    stand.rotation.y = ry + Math.PI / 2 * 0 + Math.PI / 2;
    // face the road: grandstand front (+z local) must point toward the road centre line
    stand.rotation.y = Math.atan2(dirZ, -dirX) + Math.PI;
    stand.rotation.y = Math.atan2(v.x - stand.position.x, v.y - stand.position.z);
    this.group.add(stand);
    const pit = this.kit.pitBuilding(54);
    const offP = -(ROAD_W / 2 + 22);
    pit.position.set(v.x - dirZ * offP, y, v.y + dirX * offP);
    pit.rotation.y = Math.atan2(v.x - pit.position.x, v.y - pit.position.z);
    this.group.add(pit);
    // floodlights
    for (const k of [-1, 1]) {
      const flood = new SpotLight(0xfff0d8, 2600, 220, 0.5, 0.7, 1.6);
      flood.position.set(v.x - dirZ * (ROAD_W / 2 + 18) + dirX * k * 38, y + 26, v.y + dirX * (ROAD_W / 2 + 18) + dirZ * k * 38);
      flood.target.position.set(v.x + dirX * k * 18, y, v.y + dirZ * k * 18);
      this.group.add(flood, flood.target);
    }
    // sponsor boards along the start straight
    const p = new Vector3();
    const t = new Vector3();
    const names = ['SMART RACING', 'DIJKSTRA', 'A*  HEURISTIC', 'MERGE SORT', 'NITRO'];
    const edges = this.graph.neighbors(v.id, { ignoreBlocked: false });
    const first = edges[0] ? this.polys.get(edges[0].edge.id) : undefined;
    if (first) {
      const fwd = edges[0]!.edge.from === v.id;
      names.forEach((n, i) => {
        const s = (fwd ? 22 : first.len - 22) + (fwd ? 1 : -1) * i * 14;
        if (s < 0 || s > first.len) return;
        sampleAt(first, s, p, t);
        const board = this.kit.sign(n, 9, '#0a0c0e', i % 2 ? '#' + this.opts.theme.cyan.getHexString() : '#' + this.opts.theme.lime.getHexString());
        const o = ROAD_W / 2 + 4.6;
        board.position.set(p.x - t.z * o, p.y + 1.1, p.z + t.x * o);
        board.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2 + Math.PI;
        board.scale.y = 0.5;
        this.group.add(board);
      });
    }
  }

  private buildScenery(quality: Quality): void {
    const b = this.bounds;
    const count = quality === 'high' ? 900 : quality === 'medium' ? 520 : 200;
    const rand = this.rand;
    const trunkGeo = new CylinderGeometry(0.28, 0.42, 3.2, 6);
    const crownGeo = new ConeGeometry(2.4, 6.4, 7);
    const crown2Geo = new ConeGeometry(1.8, 5, 7);
    const trunkMat = new MeshStandardMaterial({ color: ART.trunk, roughness: 1 });
    const leafMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const trunk = new InstancedMesh(trunkGeo, trunkMat, count);
    const crown = new InstancedMesh(crownGeo, leafMat, count);
    const crown2 = new InstancedMesh(crown2Geo, leafMat, count);
    const o = new Object3D();
    const la = new Color(ART.leafA);
    const lb = new Color(ART.leafB);
    const c = new Color();
    let placed = 0;
    const R = b.size / 2 + 420;
    for (let tries = 0; tries < count * 14 && placed < count; tries++) {
      const x = b.cx + (rand() * 2 - 1) * R;
      const z = b.cz + (rand() * 2 - 1) * R;
      if (this.distToGroundRoad(x, z) < ROAD_W / 2 + 12) continue;
      if (this.nearVertex(x, z, 26)) continue;
      let underBridge = false;
      for (const e of this.graph.allEdges()) {
        if (!this.isBridge(e)) continue;
        const a = this.graph.getVertex(e.from);
        const d = this.graph.getVertex(e.to);
        const dx = d.x - a.x;
        const dz = d.y - a.y;
        const l2 = dx * dx + dz * dz || 1;
        const tt = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.y) * dz) / l2));
        if (Math.hypot(x - (a.x + dx * tt), z - (a.y + dz * tt)) < 14) underBridge = true;
      }
      if (underBridge) continue;
      const s = 0.7 + rand() * 1.1;
      const y = heightAt(x, z);
      o.position.set(x, y + 1.6 * s, z);
      o.scale.set(s, s, s);
      o.rotation.set(0, rand() * 6.28, 0);
      o.updateMatrix();
      trunk.setMatrixAt(placed, o.matrix);
      o.position.set(x, y + (3.2 + 2.6) * s, z);
      o.updateMatrix();
      crown.setMatrixAt(placed, o.matrix);
      o.position.set(x, y + (3.2 + 5.6) * s, z);
      o.updateMatrix();
      crown2.setMatrixAt(placed, o.matrix);
      c.copy(la).lerp(lb, rand());
      crown.setColorAt(placed, c);
      crown2.setColorAt(placed, c);
      placed++;
    }
    for (const m of [trunk, crown, crown2]) {
      m.count = placed;
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = quality !== 'low';
      this.group.add(m);
    }
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    if (crown2.instanceColor) crown2.instanceColor.needsUpdate = true;

    // lamp poles
    const verts = this.graph.allVertices().filter((v) => v.type === 'Checkpoint');
    verts.forEach((v, i) => {
      if (i % 2) return;
      const dx = v.x - b.cx;
      const dz = v.y - b.cz;
      const l = Math.hypot(dx, dz) || 1;
      const pole = this.kit.lampPole(14);
      pole.position.set(v.x + (dx / l) * 12, (this.vertexY.get(v.id) ?? 0), v.y + (dz / l) * 12);
      pole.rotation.y = Math.atan2(dz / l, -dx / l);
      this.group.add(pole);
    });

    // city skyline backdrop
    this.group.add(this.kit.skyline(quality === 'low' ? 24 : 64, b.size / 2 + 760, rand));
    const sk = this.group.children[this.group.children.length - 1]!;
    sk.position.set(b.cx, 0, b.cz);
  }

  // ------------------------------------------------------------------ live state
  /** 0..N checkpoints the human has cleared this lap; drives the gate colours. */
  setCheckpointProgress(n: number): void {
    this.checkpointsReached = n;
  }

  /** 0..5 lights on; `go` turns them green. */
  setStartLights(on: number, go = false): void {
    const green = new Color(0x31ff7a);
    const red = new Color(0xff2a1a);
    this.startLights.forEach((m, i) => {
      const lit = go || i < on;
      m.emissive.copy(go ? green : red);
      m.emissiveIntensity = lit ? 5 : 0;
    });
  }

  setEffect(edgeId: number, kind: 'oil' | 'speed', on: boolean): void {
    let fx = this.fx.get(edgeId);
    if (!fx) {
      fx = { oilK: 0, oilOn: false, speedOn: false };
      this.fx.set(edgeId, fx);
    }
    const pl = this.polys.get(edgeId);
    if (!pl) return;
    const p = new Vector3();
    const t = new Vector3();
    if (kind === 'oil') {
      fx.oilOn = on;
      if (on && !fx.oil) {
        fx.oil = this.kit.oilPatch();
        sampleAt(pl, pl.len * 0.5, p, t);
        fx.oil.position.set(p.x, p.y + ROAD_Y + 0.045, p.z);
        fx.oil.rotation.z = Math.atan2(t.x, t.z);
        fx.oil.scale.setScalar(0.001);
        this.group.add(fx.oil);
      }
    } else {
      fx.speedOn = on;
      if (on && !fx.speed) {
        fx.speed = [];
        for (const s of [0.18, 0.82]) {
          const sign = this.kit.speedSign('50');
          sampleAt(pl, pl.len * s, p, t);
          const w = this.roadWidth(this.graph.getEdge(edgeId));
          sign.position.set(p.x - t.z * (w / 2 + 1.5), p.y, p.z + t.x * (w / 2 + 1.5));
          sign.rotation.y = Math.atan2(t.x, t.z) + (s < 0.5 ? Math.PI : 0);
          this.group.add(sign);
          fx.speed.push(sign);
        }
      }
      fx.speed?.forEach((g) => (g.visible = on));
    }
  }

  private ensureBarricade(edgeId: number): BarricadeVisual {
    let b = this.barricades.get(edgeId);
    if (b) return b;
    const pl = this.polys.get(edgeId)!;
    const w = this.roadWidth(this.graph.getEdge(edgeId));
    const group = this.kit.barricade(w);
    const p = new Vector3();
    const t = new Vector3();
    sampleAt(pl, pl.len * 0.5, p, t);
    group.position.set(p.x, p.y + ROAD_Y, p.z);
    group.rotation.y = Math.atan2(t.x, t.z);
    this.group.add(group);
    const warn: Group[] = [];
    for (const s of [0.12, 0.88]) {
      const tri = this.kit.warningTriangle('!');
      sampleAt(pl, pl.len * s, p, t);
      tri.position.set(p.x - t.z * (w / 2 - 1), p.y + ROAD_Y, p.z + t.x * (w / 2 - 1));
      tri.rotation.y = Math.atan2(t.x, t.z) + (s < 0.5 ? Math.PI : 0);
      this.group.add(tri);
      warn.push(tri);
    }
    const beacons: MeshStandardMaterial[] = [];
    group.traverse((o) => {
      if (o.name === 'beacon') beacons.push((o as Mesh).material as MeshStandardMaterial);
    });
    b = { edgeId, group, warn, k: 0, beacons };
    group.visible = false;
    warn.forEach((x) => (x.visible = false));
    this.barricades.set(edgeId, b);
    return b;
  }

  /**
   * Make the visuals match the live graph (closures, service availability) and advance animations.
   * Call once per frame; cheap (a loop over edges + a few services).
   */
  sync(dt: number, t: number): void {
    this.flashClock += dt;
    const flash = Math.sin(t * 9) > 0 ? 1 : 0.15;
    for (const e of this.graph.allEdges()) {
      const blocked = e.status === 'Blocked';
      let bv = this.barricades.get(e.id);
      if (blocked && !bv) bv = this.ensureBarricade(e.id);
      if (!bv) continue;
      const target = blocked ? 1 : 0;
      bv.k += (target - bv.k) * Math.min(1, dt * (blocked ? 3.2 : 5));
      if (Math.abs(target - bv.k) < 0.004) bv.k = target;
      const vis = bv.k > 0.01;
      bv.group.visible = vis;
      bv.warn.forEach((w) => (w.visible = vis));
      if (vis) {
        const kk = blocked ? bounce(Math.min(1, bv.k)) : bv.k;
        bv.group.scale.set(1, Math.max(0.01, kk), 1);
        bv.group.position.y += 0; // base height set at build time
        for (const m of bv.beacons) m.emissiveIntensity = 0.3 + flash * 4;
      }
    }
    for (const [id, fx] of this.fx) {
      if (fx.oil) {
        fx.oilK += ((fx.oilOn ? 1 : 0) - fx.oilK) * Math.min(1, dt * 3);
        fx.oil.scale.setScalar(Math.max(0.001, fx.oilK));
        fx.oil.visible = fx.oilK > 0.01;
      }
      void id;
    }
    for (const [id, f] of this.fuel) f.setActive(this.graph.getVertex(id).active);
    for (const [id, n] of this.nitro) {
      n.setActive(this.graph.getVertex(id).active);
      n.update(t);
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (const g of this.gates.values()) {
      if (g.order <= this.checkpointsReached) {
        g.led.emissive.copy(this.opts.theme.lime);
        g.led.emissiveIntensity = 0.7;
      } else if (g.order === this.checkpointsReached + 1) {
        g.led.emissive.copy(this.opts.theme.lime).lerp(new Color(0xffffff), pulse * 0.5);
        g.led.emissiveIntensity = 2.2 + pulse * 2.4;
      } else {
        g.led.emissive.copy(this.opts.theme.cyan);
        g.led.emissiveIntensity = 0.9;
      }
    }
    this.dust.update(dt);
  }

  /** Move the shadow box so it stays centred on the action (race: follow cars). */
  focusShadow(center: Vector3): void {
    const off = new Vector3(-120, 220, 90);
    this.moon.position.copy(center).add(off);
    this.moon.target.position.copy(center);
    this.moon.target.updateMatrixWorld();
  }

  setViewport(heightPx: number, fov: number): void {
    this.dust.setViewport(heightPx, fov);
  }

  /** Materials swapped in/out by tests or quality changes could be disposed here; scene dispose handles meshes. */
  get materials(): Material[] {
    return [this.roadMat];
  }
}

// keep PG referenced so tree-shaking never drops the side-effect-free import in strict builds
void PG;
