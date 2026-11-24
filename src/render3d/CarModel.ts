import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SpotLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  MeshBasicMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { ART } from './palette.ts';
import { labelTexture } from './procedural.ts';

/**
 * Procedural open-wheel racing car, built in metres (length ~5.4 m), forward = +Z, origin at ground contact.
 * Wheels spin, front wheels steer, the body pitches/rolls on its suspension, brake lights respond to braking,
 * headlights/LED strips glow, and nitro adds twin exhaust flames. No external model files.
 */
export interface CarOptions {
  paint: Color;
  accent: Color;
  flame: Color;
  number: number;
  /** Real SpotLight in front of the car (player only — keeps the light count low). */
  headlightBeam?: boolean;
}

export interface CarDynamics {
  /** forward speed in m/s (drives wheel spin) */
  speed: number;
  /** front wheel steer, radians (+ = toward +X) */
  steer: number;
  /** 0..1 */
  brake: number;
  /** 0..1 flame intensity */
  nitro: number;
  /** longitudinal acceleration m/s^2 (+ = accelerating) */
  accel: number;
  /** lateral acceleration m/s^2 (+ = turning toward +X) */
  lateral: number;
}

interface WheelRig {
  steer: Group;
  spin: Group;
  front: boolean;
  radius: number;
}

const SHARED: Record<string, Material> = {};
function shared<T extends Material>(key: string, make: () => T): T {
  let m = SHARED[key] as T | undefined;
  if (!m) {
    m = make();
    SHARED[key] = m;
  }
  return m;
}

function box(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function along(geo: BufferGeometry, mat: Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): Mesh {
  geo.rotateX(Math.PI / 2);
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

const flameMaterial = (color: Color): ShaderMaterial =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: color }, uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vTip;
      uniform float uTime; uniform float uPower;
      void main() {
        vUv = uv;
        vTip = clamp(-position.z / 1.0, 0.0, 1.0);
        vec3 p = position;
        p.xy *= 1.0 + 0.18 * sin(uTime * 60.0 + position.z * 9.0) * vTip;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPower; uniform float uTime;
      varying vec2 vUv; varying float vTip;
      void main() {
        float along = 1.0 - vTip;
        float core = pow(along, 1.6);
        vec3 col = mix(uColor, vec3(1.0), core * 0.85);
        float flick = 0.8 + 0.2 * sin(uTime * 90.0 + vUv.x * 12.0);
        gl_FragColor = vec4(col * (1.2 + core * 1.6), core * uPower * flick);
      }
    `,
  });

export class CarRig {
  readonly group = new Group();
  /** Sprung body: pitch/roll/heave are applied here, wheels stay on the ground. */
  readonly body = new Group();
  private readonly wheels: WheelRig[] = [];
  private readonly brakeMat: MeshStandardMaterial;
  private readonly headMat: MeshStandardMaterial;
  private readonly flames: Mesh[] = [];
  private readonly flameMat: ShaderMaterial;
  private readonly flameLight: PointLight;
  private readonly beam: SpotLight | null = null;
  private pitch = 0;
  private roll = 0;
  private heave = 0;
  private phase = Math.random() * 10;
  private readonly tmp = new Vector3();

  constructor(readonly opts: CarOptions) {
    const paint = new MeshPhysicalMaterial({
      color: opts.paint,
      metalness: 0.35,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.1,
    });
    const accent = new MeshPhysicalMaterial({ color: opts.accent, metalness: 0.2, roughness: 0.35, clearcoat: 0.8 });
    const carbon = shared('carbon', () => new MeshStandardMaterial({ color: ART.carbon, metalness: 0.6, roughness: 0.38 }));
    const rubber = shared('rubber', () => new MeshStandardMaterial({ color: ART.rubber, metalness: 0, roughness: 0.88 }));
    const steel = shared('steel', () => new MeshStandardMaterial({ color: ART.steel, metalness: 0.95, roughness: 0.25 }));
    const visor = shared('visor', () => new MeshPhysicalMaterial({ color: 0x050607, metalness: 0.2, roughness: 0.05, clearcoat: 1 }));
    this.brakeMat = new MeshStandardMaterial({ color: 0x300000, emissive: new Color(0xff1a1a), emissiveIntensity: 0.5 });
    this.headMat = new MeshStandardMaterial({ color: 0x111418, emissive: new Color(0xdff6ff), emissiveIntensity: 2.2 });

    const b = this.body;
    // --- floor & diffuser
    b.add(box(1.55, 0.04, 3.9, carbon, 0, 0.09, -0.05));
    b.add(box(1.2, 0.05, 0.5, carbon, 0, 0.14, -2.0));
    // --- monocoque, nose, sidepods, engine cover
    b.add(along(new CapsuleGeometry(0.27, 2.1, 10, 24), paint, 0, 0.42, 0.15, 1.12, 0.8, 1));
    b.add(along(new CylinderGeometry(0.07, 0.25, 1.75, 24), paint, 0, 0.31, 1.95, 1.0, 0.62, 1));
    for (const sx of [-1, 1]) {
      b.add(along(new CapsuleGeometry(0.2, 1.25, 8, 20), paint, sx * 0.53, 0.34, -0.2, 1.1, 0.95, 1));
      b.add(box(0.2, 0.17, 0.05, carbon, sx * 0.55, 0.38, 0.5)); // sidepod inlet
    }
    b.add(along(new CapsuleGeometry(0.16, 1.5, 8, 18), paint, 0, 0.66, -0.9, 0.9, 1.25, 1));
    const fin = box(0.035, 0.42, 1.3, paint, 0, 0.88, -1.5);
    fin.rotation.x = 0.05;
    b.add(fin);
    // --- cockpit: helmet, visor, halo
    const helmet = new Mesh(new SphereGeometry(0.14, 20, 14), accent);
    helmet.position.set(0, 0.7, 0.18);
    helmet.castShadow = true;
    b.add(helmet);
    const vs = new Mesh(new SphereGeometry(0.142, 20, 8, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.2), visor);
    vs.position.copy(helmet.position);
    vs.rotation.x = -0.9;
    b.add(vs);
    const halo = new Mesh(new TorusGeometry(0.29, 0.017, 8, 30, Math.PI), carbon);
    halo.rotation.y = Math.PI / 2;
    halo.position.set(0, 0.6, 0.2);
    halo.castShadow = true;
    b.add(halo);
    b.add(box(0.035, 0.035, 0.34, carbon, 0, 0.62, 0.62));
    // --- front wing (stacked flaps + endplates)
    b.add(box(2.0, 0.035, 0.42, carbon, 0, 0.1, 2.62));
    for (let i = 0; i < 3; i++) {
      const f = box(1.92 - i * 0.04, 0.028, 0.3, i === 1 ? accent : paint, 0, 0.17 + i * 0.07, 2.55 - i * 0.07);
      f.rotation.x = -0.1 - i * 0.07;
      b.add(f);
    }
    for (const sx of [-1, 1]) {
      b.add(box(0.04, 0.3, 0.58, paint, sx * 1.0, 0.22, 2.55));
      b.add(box(0.042, 0.06, 0.58, accent, sx * 1.0, 0.36, 2.55));
    }
    // --- rear wing + beam wing
    b.add(box(1.05, 0.04, 0.38, paint, 0, 1.0, -2.15));
    const flap = box(1.0, 0.032, 0.28, accent, 0, 0.88, -2.13);
    flap.rotation.x = 0.18;
    b.add(flap);
    for (const sx of [-1, 1]) {
      b.add(box(0.035, 0.46, 0.62, paint, sx * 0.53, 0.82, -2.15));
      b.add(box(0.037, 0.07, 0.62, accent, sx * 0.53, 1.04, -2.15));
    }
    b.add(box(0.06, 0.5, 0.2, carbon, 0, 0.64, -2.0));
    b.add(box(0.8, 0.03, 0.22, carbon, 0, 0.3, -2.28));
    // --- lights: brake/rain light, front LED "headlights"
    const rain = new Mesh(new BoxGeometry(0.16, 0.09, 0.03), this.brakeMat);
    rain.position.set(0, 0.52, -2.3);
    b.add(rain);
    for (const sx of [-1, 1]) {
      const end = new Mesh(new BoxGeometry(0.04, 0.05, 0.05), this.brakeMat);
      end.position.set(sx * 0.53, 0.64, -2.46);
      b.add(end);
      const led = new Mesh(new BoxGeometry(0.17, 0.028, 0.05), this.headMat);
      led.position.set(sx * 0.2, 0.355, 1.2);
      b.add(led);
    }
    if (opts.headlightBeam) {
      const sp = new SpotLight(0xdff6ff, 90, 70, 0.5, 0.65, 1.5);
      sp.position.set(0, 0.4, 2.2);
      sp.target.position.set(0, 0, 22);
      this.beam = sp;
      b.add(sp);
      b.add(sp.target);
    }
    // --- number plates on sidepods
    const num = labelTexture(String(opts.number), { color: '#0a0c0e', bg: '#' + opts.accent.getHexString(), size: 72, padding: 10 });
    const plate = new MeshBasicMaterial({ map: num.texture, toneMapped: false });
    for (const sx of [-1, 1]) {
      const p = new Mesh(new PlaneGeometry(0.3, 0.3 / num.aspect), plate);
      p.position.set(sx * 0.768, 0.36, -0.15);
      p.rotation.y = sx * (Math.PI / 2);
      b.add(p);
    }

    // --- nitro flames
    this.flameMat = flameMaterial(opts.flame);
    for (const sx of [-1, 1]) {
      const cone = new Mesh(new ConeGeometry(0.1, 1.9, 14, 1, true), this.flameMat);
      cone.geometry.rotateX(-Math.PI / 2);
      cone.geometry.translate(0, 0, -0.95);
      cone.position.set(sx * 0.14, 0.5, -2.34);
      cone.scale.set(1, 1, 0.001);
      cone.frustumCulled = false;
      this.flames.push(cone);
      b.add(cone);
    }
    this.flameLight = new PointLight(opts.flame, 0, 9, 2);
    this.flameLight.position.set(0, 0.5, -2.8);
    b.add(this.flameLight);

    // --- wheels (outside the sprung body)
    this.group.add(b);
    const addWheel = (x: number, z: number, r: number, w: number, front: boolean): void => {
      const root = new Group();
      root.position.set(x, r, z);
      const steer = new Group();
      const spin = new Group();
      const tire = new Mesh(new CylinderGeometry(r, r, w, 36), rubber);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spin.add(tire);
      const stripe = new Mesh(new TorusGeometry(r * 0.9, 0.012, 6, 36), accent);
      stripe.rotation.y = Math.PI / 2;
      stripe.position.x = Math.sign(x) * (w / 2 + 0.002);
      spin.add(stripe);
      const rim = new Mesh(new CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 24), steel);
      rim.rotation.z = Math.PI / 2;
      spin.add(rim);
      for (let i = 0; i < 5; i++) {
        const spoke = new Mesh(new BoxGeometry(w + 0.03, r * 0.12, r * 1.05), carbon);
        spoke.rotation.x = (i / 5) * Math.PI;
        spin.add(spoke);
      }
      steer.add(spin);
      root.add(steer);
      this.group.add(root);
      this.wheels.push({ steer, spin, front, radius: r });
      // suspension wishbones (static, hub -> chassis)
      const inner = Math.sign(x) * 0.28;
      for (const dz of [-0.14, 0.14]) {
        const len = Math.hypot(x - inner, 0.18);
        const arm = new Mesh(new CylinderGeometry(0.011, 0.011, len, 6), carbon);
        arm.position.set((x + inner) / 2, r * 0.95 + 0.05, z + dz * 0.5);
        arm.rotation.z = Math.PI / 2;
        this.group.add(arm);
      }
    };
    addWheel(-0.86, 1.78, 0.34, 0.3, true);
    addWheel(0.86, 1.78, 0.34, 0.3, true);
    addWheel(-0.82, -1.62, 0.37, 0.4, false);
    addWheel(0.82, -1.62, 0.37, 0.4, false);
  }

  /** Advance wheel spin, suspension, brake lights and flames. */
  update(dt: number, d: CarDynamics, t: number): void {
    this.phase += dt;
    for (const w of this.wheels) {
      w.spin.rotation.x += (d.speed / w.radius) * dt;
      if (w.front) w.steer.rotation.y += (d.steer - w.steer.rotation.y) * Math.min(1, dt * 14);
    }
    // sprung body: nose dives under braking, squats under power, rolls in corners
    const targetPitch = -d.accel * 0.0035;
    const targetRoll = d.lateral * 0.0045;
    const k = Math.min(1, dt * 7);
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;
    const speedShake = Math.min(1, Math.abs(d.speed) / 60);
    const target = Math.sin(this.phase * 53) * 0.0016 * (0.3 + speedShake) + Math.sin(this.phase * 11) * 0.0012;
    this.heave += (target - this.heave) * k;
    this.body.rotation.x = Math.max(-0.07, Math.min(0.07, this.pitch));
    this.body.rotation.z = Math.max(-0.08, Math.min(0.08, this.roll));
    this.body.position.y = this.heave - Math.abs(this.pitch) * 0.1;

    this.brakeMat.emissiveIntensity = 0.5 + d.brake * 5;
    this.flameMat.uniforms['uTime']!.value = t;
    this.flameMat.uniforms['uPower']!.value = d.nitro;
    const len = d.nitro > 0.01 ? 0.7 + d.nitro * (0.9 + 0.35 * Math.sin(t * 70)) : 0.001;
    for (const f of this.flames) f.scale.z = len;
    this.flameLight.intensity = d.nitro * (14 + 5 * Math.sin(t * 80));
  }

  setHeadlights(on: boolean): void {
    this.headMat.emissiveIntensity = on ? 2.2 : 0.05;
    if (this.beam) this.beam.visible = on;
  }

  /** World position of a wheel contact patch (for smoke/sparks). index: 0 FL, 1 FR, 2 RL, 3 RR. */
  wheelWorld(index: number, out: Vector3): Vector3 {
    const w = this.wheels[index];
    if (!w) return out.copy(this.group.position);
    w.spin.getWorldPosition(out);
    out.y -= w.radius * 0.8;
    return out;
  }

  exhaustWorld(out: Vector3): Vector3 {
    this.tmp.set(0, 0.5, -2.4);
    return out.copy(this.tmp).applyMatrix4(this.body.matrixWorld);
  }
}

export function createCar(opts: CarOptions): CarRig {
  return new CarRig(opts);
}
