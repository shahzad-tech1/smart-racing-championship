import {
  AmbientLight,
  Color,
  CylinderGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SpotLight,
  Vector3,
  BoxGeometry,
} from 'three';
import type { Quality } from '../state/Settings.ts';
import { Stage } from './Stage.ts';
import { createCar, type CarRig } from './CarModel.ts';
import { readTheme, type Theme } from './theme.ts';
import { makeEnvironment } from './procedural.ts';
import { ParticlePool } from './ParticlePool.ts';
import { smokeTexture } from './procedural.ts';

export type Livery = 'lime' | 'cyan' | 'white' | 'orange';
export const LIVERIES: readonly Livery[] = ['lime', 'cyan', 'white', 'orange'];

export function liveryColors(theme: Theme, l: Livery): { paint: Color; accent: Color } {
  switch (l) {
    case 'cyan': return { paint: theme.cyan.clone(), accent: theme.lime.clone() };
    case 'white': return { paint: new Color(0xe8ecef), accent: theme.danger.clone() };
    case 'orange': return { paint: theme.warning.clone(), accent: theme.text.clone() };
    default: return { paint: theme.lime.clone(), accent: theme.cyan.clone() };
  }
}

/** Cinematic garage: low-key warehouse light, one warm fluorescent tube, concrete floor with amber bay lines, slow orbit with pointer parallax. */
export class GarageView {
  readonly stage: Stage;
  readonly theme: Theme;
  private car: CarRig | null = null;
  private readonly turntable = new Group();
  private readonly smoke: ParticlePool;
  private revving = 0;
  private px = 0;
  private py = 0;
  private spin = 0;
  private fade = 1;
  private t0 = 0;
  reduceMotion = false;
  private readonly onMove = (e: PointerEvent): void => {
    const r = this.stage.container.getBoundingClientRect();
    this.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    this.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };

  constructor(container: HTMLElement, quality: Quality, livery: Livery) {
    this.theme = readTheme();
    this.stage = new Stage(container, { quality, bloom: 0.18, fov: 34, near: 0.1, far: 120 });
    const scene = this.stage.scene;
    scene.background = new Color(0x0b0d0f);
    try {
      scene.environment = makeEnvironment(this.stage.renderer, 0.06);
    } catch { /* optional */ }
    scene.add(new AmbientLight(0x1a1d20, 0.8), new HemisphereLight(0x8d98a3, 0x0a0c0e, 0.3));

    // glossy floor
    const floor = new Mesh(
      new PlaneGeometry(60, 60),
      new MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.36, metalness: 0.32, envMapIntensity: 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // back wall + light strips
    const wallMat = new MeshStandardMaterial({ color: 0x0f1215, roughness: 0.85, metalness: 0.1 });
    const wall = new Mesh(new PlaneGeometry(40, 12), wallMat);
    wall.position.set(0, 6, -9);
    scene.add(wall);
    // one warm fluorescent tube on the left wall, like a real workshop (no neon, no pulsing)
    const tube = new Mesh(new BoxGeometry(0.1, 0.1, 4.2), new MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xfff0d2, emissiveIntensity: 2.4 }));
    tube.position.set(-11.7, 3.1, -2.2);
    scene.add(tube);
    const tubeLight = new PointLight(0xffe4b8, 16, 18, 2);
    tubeLight.position.set(-10.4, 3.1, -2.2);
    scene.add(tubeLight);
    const sideWall = new Mesh(new PlaneGeometry(30, 10), wallMat);
    sideWall.rotation.y = Math.PI / 2;
    sideWall.position.set(-12, 5, 0);
    scene.add(sideWall);
    // matte amber bay markings crossing the concrete diagonally
    const bays = new Group();
    bays.rotation.y = 0.52;
    for (const x of [-4.2, 5.6]) {
      const line = new Mesh(new PlaneGeometry(0.2, 40), new MeshStandardMaterial({ color: 0xb98a2b, roughness: 0.8, metalness: 0 }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.012, 0);
      bays.add(line);
    }
    scene.add(bays);

    // turntable
    const base = new Mesh(
      new CylinderGeometry(3.4, 3.6, 0.22, 64),
      new MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.4, metalness: 0.6 }),
    );
    base.position.y = 0.11;
    base.receiveShadow = true;
    scene.add(base);
    const ring = new Mesh(
      new CylinderGeometry(3.45, 3.45, 0.04, 64),
      new MeshStandardMaterial({ color: 0x0a0c0e, emissive: this.theme.lime, emissiveIntensity: 0.45 }),
    );
    ring.position.y = 0.23;
    scene.add(ring);
    this.turntable.position.y = 0.22;
    scene.add(this.turntable);

    // lights: key from above, rim lights lime/cyan
    const key = new SpotLight(0xfff3e2, 520, 40, 0.5, 0.65, 1.6);
    key.position.set(2, 11, 4);
    key.target.position.set(0, 0.5, 0);
    key.castShadow = quality !== 'low';
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    scene.add(key, key.target);
    // cool-white rim lights separate the silhouette from the dark room
    const rimL = new SpotLight(0xdfe8f2, 220, 30, 0.6, 0.8, 1.6);
    rimL.position.set(-7, 4, -5);
    rimL.target.position.set(0, 0.6, 0);
    const rimR = new SpotLight(0xdfe8f2, 160, 30, 0.6, 0.8, 1.6);
    rimR.position.set(7, 4, -5);
    rimR.target.position.set(0, 0.6, 0);
    scene.add(rimL, rimL.target, rimR, rimR.target);

    this.smoke = new ParticlePool(260, smokeTexture(), false);
    scene.add(this.smoke.points);
    this.smoke.setViewport(this.stage.height, 34);

    this.setLivery(livery);
    this.stage.enableDepthOfField(11, 0.00012, 0.006);
    this.stage.setFade(1);
    window.addEventListener('pointermove', this.onMove);
    this.stage.onUpdate = (dt, t) => this.frame(dt, t);
  }

  setLivery(l: Livery): void {
    if (this.car) {
      this.turntable.remove(this.car.group);
    }
    const { paint, accent } = liveryColors(this.theme, l);
    this.car = createCar({ paint, accent, flame: this.theme.nitro, number: 1, headlightBeam: false });
    this.car.group.scale.setScalar(1.35);
    this.car.setHeadlights(true);
    this.turntable.add(this.car.group);
    this.car.group.rotation.y = this.spin;
  }

  /** Short engine rev: exhaust flame + haze, used by the "Start engine" button. */
  rev(): void {
    this.revving = 1.4;
  }

  start(): void {
    this.stage.start();
  }

  private frame(dt: number, t: number): void {
    if (!this.t0) this.t0 = t;
    const intro = MathUtils.smoothstep(t - this.t0, 0, 2.6);
    // slow orbit with pointer parallax; camera pushes in during the intro
    const orbit = this.reduceMotion ? 0.55 : 0.55 + Math.sin(t * 0.1) * 0.22;
    const radius = MathUtils.lerp(14, 9.6, intro);
    const cam = this.stage.camera;
    const tx = Math.sin(orbit + this.px * 0.12) * radius;
    const tz = Math.cos(orbit + this.px * 0.12) * radius;
    cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 3);
    cam.position.z += (tz - cam.position.z) * Math.min(1, dt * 3);
    cam.position.y += (MathUtils.lerp(3.6, 1.5, intro) - this.py * 0.3 - cam.position.y) * Math.min(1, dt * 3);
    cam.lookAt(0, 0.7, 0);
    const w = this.stage.width;
    const h = this.stage.height;
    if (w / h > 1.25) cam.setViewOffset(w, h, -w * 0.2, 0, w, h);
    else cam.clearViewOffset();
    this.stage.setFocus(cam.position.distanceTo(new Vector3(0, 0.8, 0)));

    if (!this.reduceMotion) this.spin += dt * 0.18;
    this.turntable.rotation.y = this.spin;

    if (this.car) {
      const burst = this.revving > 0;
      if (burst) this.revving -= dt;
      this.car.update(dt, { speed: burst ? 18 : 0, steer: 0, brake: 0, nitro: burst ? Math.min(1, this.revving) : 0, accel: 0, lateral: 0 }, t);
      if (burst) {
        const p = new Vector3();
        this.car.exhaustWorld(p);
        for (let i = 0; i < 3; i++) {
          this.smoke.emit({
            x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 2,
            life: 1.8, size0: 0.5, size1: 2.4, c0: new Color(0x9aa4ac), alpha: 0.2, drag: 1,
          });
        }
      }
    }
    // ambient floor haze
    if (!this.reduceMotion && Math.random() < dt * 14) {
      this.smoke.emit({
        x: (Math.random() - 0.5) * 9, y: 0.05, z: (Math.random() - 0.5) * 9, vx: 0.2, vy: 0.12, vz: 0.1,
        life: 5, size0: 2, size1: 5, c0: new Color(0x5a6872), alpha: 0.05, drag: 0.2,
      });
    }
    this.smoke.update(dt);

    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt * 0.9);
      this.stage.setFade(this.fade);
    }
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove);
    this.stage.stop();
    this.stage.dispose();
  }
}
