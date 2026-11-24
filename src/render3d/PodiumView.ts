import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  SpotLight,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { Quality } from '../state/Settings.ts';
import { Stage } from './Stage.ts';
import { createCar, type CarRig } from './CarModel.ts';
import { readTheme, type Theme } from './theme.ts';
import { ART } from './palette.ts';
import { labelTexture, makeEnvironment, smokeTexture } from './procedural.ts';
import { ParticlePool } from './ParticlePool.ts';

export interface PodiumEntry {
  id: number;
  name: string;
  points: number;
}

const HEIGHTS = [2.4, 3.4, 1.6]; // visual slots: 2nd, 1st, 3rd
const SLOT_X = [-4.6, 0, 4.6];

/** 3D championship podium: three blocks, the leaders' cars, a trophy and confetti once the season is decided. */
export class PodiumView {
  readonly stage: Stage;
  readonly theme: Theme;
  reduceMotion = false;
  private readonly slots = new Group();
  private readonly cars: Array<CarRig | null> = [null, null, null];
  private readonly trophy = new Group();
  private readonly confetti: ParticlePool;
  private cheer = 0;
  private fade = 1;
  private orbit = 0;

  constructor(container: HTMLElement, quality: Quality) {
    this.theme = readTheme();
    this.stage = new Stage(container, { quality, bloom: 0.4, fov: 38, near: 0.1, far: 150 });
    const scene = this.stage.scene;
    scene.background = new Color(0x07090b);
    try { scene.environment = makeEnvironment(this.stage.renderer, 0.06); } catch { /* optional */ }
    scene.add(new AmbientLight(0x1c2229, 1), new HemisphereLight(0x6f8fb8, 0x0a0c0e, 0.4));
    const floor = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x13161a, roughness: 0.25, metalness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    for (const [x, c, i] of [[-6, this.theme.cyan, 0], [6, this.theme.lime, 1]] as const) {
      const s = new SpotLight(c, 300, 40, 0.55, 0.8, 1.6);
      s.position.set(x * 1.1, 9, 6);
      s.target.position.set(0, 2, 0);
      scene.add(s, s.target);
      void i;
    }
    const key = new SpotLight(0xfff3e2, 520, 50, 0.5, 0.6, 1.6);
    key.position.set(0, 14, 8);
    key.target.position.set(0, 2, 0);
    key.castShadow = quality !== 'low';
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key, key.target);

    scene.add(this.slots);
    this.buildBlocks();
    this.buildTrophy();
    scene.add(this.trophy);
    this.trophy.position.set(0, HEIGHTS[1]! + 1.7, -1.4);
    this.trophy.visible = false;

    this.confetti = new ParticlePool(500, smokeTexture(), true);
    scene.add(this.confetti.points);
    this.confetti.setViewport(this.stage.height, 38);
    this.stage.camera.position.set(0, 6, 23);
    this.stage.setFade(1);
    this.stage.onUpdate = (dt, t) => this.frame(dt, t);
  }

  private buildBlocks(): void {
    const mats = [
      new MeshStandardMaterial({ color: 0x9aa4ac, metalness: 0.8, roughness: 0.3 }),
      new MeshStandardMaterial({ color: ART.gold, metalness: 0.9, roughness: 0.25 }),
      new MeshStandardMaterial({ color: 0x9c6a3a, metalness: 0.8, roughness: 0.35 }),
    ];
    for (let i = 0; i < 3; i++) {
      const b = new Mesh(new BoxGeometry(3.6, HEIGHTS[i]!, 3.4), mats[i]!);
      b.position.set(SLOT_X[i]!, HEIGHTS[i]! / 2, 0);
      b.castShadow = true;
      b.receiveShadow = true;
      this.slots.add(b);
      const strip = new Mesh(new BoxGeometry(3.62, 0.08, 3.42), new MeshBasicMaterial({ color: i === 1 ? this.theme.lime : this.theme.cyan, toneMapped: false }));
      strip.position.set(SLOT_X[i]!, HEIGHTS[i]! - 0.04, 0);
      this.slots.add(strip);
      const rank = labelTexture(String(i === 1 ? 1 : i === 0 ? 2 : 3), { color: '#0a0c0e', size: 120, padding: 4 });
      const face = new Mesh(new PlaneGeometry(1.5 * rank.aspect, 1.5), new MeshBasicMaterial({ map: rank.texture, transparent: true }));
      face.position.set(SLOT_X[i]!, HEIGHTS[i]! / 2, 1.71);
      this.slots.add(face);
    }
  }

  private buildTrophy(): void {
    const gold = new MeshStandardMaterial({ color: ART.gold, metalness: 1, roughness: 0.18, emissive: ART.gold, emissiveIntensity: 0.12 });
    const cup = new Mesh(new CylinderGeometry(0.9, 0.35, 1.3, 28, 1, true), gold);
    cup.position.y = 0.9;
    const stem = new Mesh(new CylinderGeometry(0.12, 0.16, 0.7, 14), gold);
    const base = new Mesh(new CylinderGeometry(0.55, 0.65, 0.18, 24), gold);
    base.position.y = -0.42;
    const handle = new Mesh(new TorusGeometry(0.45, 0.07, 10, 24), gold);
    handle.position.set(0.95, 0.95, 0);
    const handle2 = handle.clone();
    handle2.position.x = -0.95;
    const ball = new Mesh(new SphereGeometry(0.28, 20, 16), gold);
    ball.position.y = 1.85;
    const tip = new Mesh(new ConeGeometry(0.1, 0.3, 10), gold);
    tip.position.y = 2.2;
    this.trophy.add(cup, stem, base, handle, handle2, ball, tip);
    this.trophy.scale.setScalar(0.9);
  }

  /** Entries are already ranked best-first (from the championship's sorted standings). */
  setStandings(top: PodiumEntry[], decided: boolean): void {
    // slot order: 2nd, 1st, 3rd  <-  top[1], top[0], top[2]
    const order = [top[1], top[0], top[2]];
    const colors = [this.theme.cyan, this.theme.lime, this.theme.warning];
    for (let i = 0; i < 3; i++) {
      const old = this.cars[i];
      if (old) this.slots.remove(old.group);
      this.cars[i] = null;
      const e = order[i];
      // clear previous name tags
      this.slots.children.filter((c) => c.userData['tag'] === i).forEach((c) => this.slots.remove(c));
      if (!e) continue;
      const car = createCar({ paint: colors[i]!.clone(), accent: this.theme.text.clone(), flame: this.theme.nitro, number: e.id });
      car.group.scale.setScalar(1.15);
      car.group.position.set(SLOT_X[i]!, HEIGHTS[i]!, 0);
      car.group.rotation.y = i === 1 ? 0.3 : i === 0 ? 0.5 : -0.5;
      car.setHeadlights(true);
      this.slots.add(car.group);
      this.cars[i] = car;
      const l = labelTexture(`${e.name}  ${e.points} PTS`, { color: '#ffffff', bg: 'rgba(9,11,13,0.8)', size: 56, padding: 14 });
      const tag = new Sprite(new SpriteMaterial({ map: l.texture, transparent: true, depthTest: false }));
      tag.scale.set(0.8 * l.aspect, 0.8, 1);
      tag.position.set(SLOT_X[i]!, HEIGHTS[i]! + 2.5, 0);
      tag.userData['tag'] = i;
      tag.renderOrder = 10;
      this.slots.add(tag);
    }
    this.trophy.visible = decided && !!top[0];
    if (decided && top[0] && !this.reduceMotion) this.cheer = 4;
  }

  start(): void {
    this.stage.start();
  }

  private frame(dt: number, t: number): void {
    this.orbit += this.reduceMotion ? 0 : dt * 0.1;
    const a = Math.sin(this.orbit) * 0.32;
    const cam = this.stage.camera;
    cam.position.x += (Math.sin(a) * 23 - cam.position.x) * Math.min(1, dt * 2);
    cam.position.z += (Math.cos(a) * 23 - cam.position.z) * Math.min(1, dt * 2);
    cam.position.y = 6;
    cam.lookAt(0, 2.4, 0);
    const w = this.stage.width;
    const h = this.stage.height;
    if (w / h > 1.25) cam.setViewOffset(w, h, -w * 0.26, 0, w, h);
    else cam.clearViewOffset();
    this.cars.forEach((c, i) => c?.update(dt, { speed: 0, steer: 0, brake: 0, nitro: 0, accel: 0, lateral: 0 }, t + i));
    if (this.trophy.visible) {
      this.trophy.rotation.y += dt * (this.reduceMotion ? 0 : 0.9);
      this.trophy.position.y = HEIGHTS[1]! + 1.7 + (this.reduceMotion ? 0 : Math.sin(t * 1.6) * 0.08);
    }
    if (this.cheer > 0) {
      this.cheer -= dt;
      const cols = [this.theme.lime, this.theme.cyan, this.theme.warning, new Color(0xffffff)];
      for (let i = 0; i < 6; i++) {
        this.confetti.emit({
          x: MathUtils.randFloatSpread(5), y: 9, z: MathUtils.randFloatSpread(3),
          vx: MathUtils.randFloatSpread(2), vy: -1 - Math.random() * 2, vz: MathUtils.randFloatSpread(1),
          life: 4, size0: 0.35, size1: 0.2, c0: cols[(Math.random() * 4) | 0]!, alpha: 0.95, gravity: -1.2, drag: 0.4,
        });
      }
    }
    this.confetti.update(dt);
    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt * 1.1);
      this.stage.setFade(this.fade);
    }
  }

  dispose(): void {
    this.stage.stop();
    this.stage.dispose();
  }
}
