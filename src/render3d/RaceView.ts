import { Color, MathUtils, Vector3 } from 'three';
import type { Graph } from '../core/Graph.ts';
import type { CircuitMeta } from '../data/circuits/meta.ts';
import type { RaceState, RacerSnapshot } from '../engine/RaceEngine.ts';
import type { ScheduledEvent } from '../engine/EventScheduler.ts';
import type { Quality, Weather } from '../state/Settings.ts';
import { Stage } from './Stage.ts';
import { TrackWorld } from './TrackWorld.ts';
import { CarRig, createCar } from './CarModel.ts';
import { readTheme, type Theme } from './theme.ts';
import { makeEnvironment } from './procedural.ts';
import { liveryColors, type Livery } from './GarageView.ts';
import { session } from '../state/session.ts';

export type CameraMode = 'chase' | 'hood' | 'tv' | 'top';
export const CAMERA_MODES: readonly CameraMode[] = ['chase', 'hood', 'tv', 'top'];

/** 1 world unit = 1.8 m; cars are modelled in metres. */
const UNIT_M = 1.8;
/** Cars are drawn a little larger than true scale so they read against a 16 m wide road. */
const CAR_SCALE = 1.1;

interface CarState {
  rig: CarRig;
  pos: Vector3;
  yaw: number;
  speed: number;
  prevSpeed: number;
  yawRate: number;
  inited: boolean;
  lane: number;
}

export interface RaceViewOptions {
  quality: Quality;
  weather: Weather;
  meta: CircuitMeta;
  events: ScheduledEvent[];
  racerIds: number[];
}

/** 3D presentation of a RaceEngine. Reads engine snapshots only; never writes back. */
export class RaceView {
  readonly stage: Stage;
  readonly world: TrackWorld;
  readonly theme: Theme;
  mode: CameraMode = 'chase';
  /** Display speed of the followed car, km/h (units/s * 1.8 m * 3.6). */
  speedKmh = 0;
  followId = 1;

  private readonly cars = new Map<number, CarState>();
  private state: RaceState | null = null;
  private readonly camPos = new Vector3();
  private readonly camLook = new Vector3();
  private camInit = false;
  private readonly p = new Vector3();
  private readonly d = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private fov = 62;
  private fade = 1;
  private fadeIn = true;
  private orbit = 0;
  private lastClock = -1;

  constructor(container: HTMLElement, private readonly graph: Graph, private readonly opts: RaceViewOptions) {
    this.theme = readTheme();
    this.stage = new Stage(container, { quality: opts.quality, bloom: 0.3, fov: this.fov, near: 0.4, far: 5000 });
    this.world = new TrackWorld(graph, { theme: this.theme, quality: opts.quality, weather: opts.weather, meta: opts.meta });
    this.stage.scene.add(this.world.group);
    this.stage.scene.fog = this.world.fog;
    this.stage.scene.background = new Color(0x0a1018);
    try {
      this.stage.scene.environment = makeEnvironment(this.stage.renderer);
    } catch {
      /* environment is optional polish */
    }
    const mine = liveryColors(this.theme, session.livery as Livery);
    const paints = [mine.paint, this.theme.cyan, this.theme.warning, new Color(0xe8ecef), new Color(0xff5fa2)];
    const accents = [mine.accent, this.theme.lime, this.theme.text, this.theme.danger, this.theme.cyan];
    opts.racerIds.forEach((id, i) => {
      const rig = createCar({
        paint: paints[i % paints.length]!,
        accent: accents[i % accents.length]!,
        flame: this.theme.nitro,
        number: id,
        headlightBeam: i === 0,
      });
      rig.group.scale.setScalar(CAR_SCALE);
      rig.setHeadlights(true);
      this.stage.scene.add(rig.group);
      this.cars.set(id, {
        rig,
        pos: new Vector3(),
        yaw: 0,
        speed: 0,
        prevSpeed: 0,
        yawRate: 0,
        inited: false,
        lane: (i - (opts.racerIds.length - 1) / 2) * 2.4,
      });
    });
    this.world.setViewport(this.stage.height, this.fov);
    this.stage.onUpdate = (dt, t) => this.frame(dt, t);
    this.stage.setFade(1);
  }

  start(): void {
    this.stage.start();
  }

  setMode(m: CameraMode): void {
    this.mode = m;
    this.camInit = false;
  }

  cycleMode(): CameraMode {
    this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]!);
    return this.mode;
  }

  /** Latest engine snapshot to draw (call after each engine tick batch). */
  setState(s: RaceState): void {
    this.state = s;
  }

  setStartLights(on: number, go: boolean): void {
    this.world.setStartLights(on, go);
  }

  /** Put every car on the grid (before the engine moves them). */
  placeOnGrid(): void {
    if (!this.state) return;
    this.applyState(0, true);
  }

  private snapPos(s: RacerSnapshot, c: CarState, out: Vector3, dir: Vector3): void {
    if (s.edgeId !== null) {
      const e = this.graph.getEdge(s.edgeId);
      this.world.pointOnEdge(e, s.currentVertex, s.progress, c.lane, out, dir);
    } else {
      this.world.vertexPos(s.currentVertex, out);
      dir.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    }
  }

  private applyState(dt: number, snap: boolean): void {
    const st = this.state;
    if (!st) return;
    const k = snap || dt <= 0 ? 1 : 1 - Math.exp(-dt * 22);
    for (const s of st.racers) {
      const c = this.cars.get(s.id);
      if (!c) continue;
      this.snapPos(s, c, this.p, this.d);
      const targetYaw = Math.atan2(this.d.x, this.d.z);
      if (!c.inited) {
        c.pos.copy(this.p);
        c.yaw = targetYaw;
        c.inited = true;
      }
      const before = this.tmp.copy(c.pos);
      c.pos.lerp(this.p, k);
      const moved = c.pos.distanceTo(before);
      const yawDiff = MathUtils.euclideanModulo(targetYaw - c.yaw + Math.PI, Math.PI * 2) - Math.PI;
      const dyaw = yawDiff * Math.min(1, snap ? 1 : dt * 9);
      c.yaw += dyaw;
      if (dt > 0) {
        const spd = moved / dt; // units / s
        c.prevSpeed = c.speed;
        c.speed += (spd - c.speed) * Math.min(1, dt * 8);
        c.yawRate += (dyaw / dt - c.yawRate) * Math.min(1, dt * 8);
      }
      const racing = s.status === 'racing';
      if (!racing) c.speed *= 0.9;
      c.rig.group.position.copy(c.pos);
      c.rig.group.rotation.y = c.yaw;
    }
  }

  private frame(dt: number, t: number): void {
    this.applyState(dt, false);
    const st = this.state;

    // ---- cars: dynamics, nitro flame, smoke
    if (st) {
      for (const s of st.racers) {
        const c = this.cars.get(s.id);
        if (!c) continue;
        const v = c.speed * UNIT_M;
        const accel = dt > 0 ? ((c.speed - c.prevSpeed) / dt) * UNIT_M : 0;
        const steer = MathUtils.clamp(c.yawRate * 0.35, -0.5, 0.5);
        c.rig.update(
          dt,
          {
            speed: c.speed / CAR_SCALE,
            steer,
            brake: accel < -3 ? Math.min(1, -accel / 14) : 0,
            nitro: s.nitroActive ? 1 : 0,
            accel,
            lateral: c.yawRate * v,
          },
          t,
        );
        if (s.nitroActive) {
          c.rig.exhaustWorld(this.tmp);
          for (let i = 0; i < 2; i++) {
            this.world.dust.emit({
              x: this.tmp.x, y: this.tmp.y, z: this.tmp.z,
              vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: 0,
              life: 0.5, size0: 1.4, size1: 5, c0: this.theme.nitro, c1: this.theme.cyan, alpha: 0.5, drag: 2,
            });
          }
        }
        if (Math.abs(c.yawRate * v) > 14 && s.status === 'racing') {
          c.rig.wheelWorld(2, this.tmp);
          this.world.dust.emit({
            x: this.tmp.x, y: this.tmp.y + 0.2, z: this.tmp.z,
            vx: (Math.random() - 0.5) * 2, vy: 1.2, vz: (Math.random() - 0.5) * 2,
            life: 1.1, size0: 1.6, size1: 6, c0: new Color(0xb8bec4), alpha: 0.22, drag: 1.5,
          });
        }
      }
      this.syncEvents(st.clock);
    }
    const f = st ? this.cars.get(this.followId) : undefined;
    this.speedKmh = f ? f.speed * UNIT_M * 3.6 : 0;

    this.world.sync(dt, t);
    this.rain(dt, t);
    this.updateCamera(dt, t);

    this.stage.setSpeedBlur(MathUtils.clamp((this.speedKmh - 140) / 300, 0, 1) * (this.mode === 'top' || this.reduceMotion ? 0 : 1));
    if (this.fadeIn) {
      this.fade = Math.max(0, this.fade - dt * 1.2);
      this.stage.setFade(this.fade);
      if (this.fade <= 0) this.fadeIn = false;
    }
  }

  private rain(dt: number, t: number): void {
    if (this.world.rain) this.world.rain.update(t, this.stage.camera.position);
    void dt;
  }

  private active = new Map<string, boolean>();

  /** Oil / speed-limit visuals follow the scheduled event windows (the engine applies the real effects). */
  private syncEvents(clock: number): void {
    if (clock === this.lastClock) return;
    this.lastClock = clock;
    for (const ev of this.opts.events) {
      const kind = ev.type === 'OilSpill' ? 'oil' : ev.type === 'SpeedRestriction' ? 'speed' : null;
      if (!kind) continue;
      const on = clock >= ev.triggerTime && (ev.duration <= 0 || clock < ev.triggerTime + ev.duration);
      const key = `${ev.eventId}`;
      if (this.active.get(key) !== on) {
        this.active.set(key, on);
        this.world.setEffect(ev.targetEdgeOrVertex, kind, on);
      }
    }
  }

  private updateCamera(dt: number, t: number): void {
    const cam = this.stage.camera;
    const c = this.cars.get(this.followId) ?? [...this.cars.values()][0];
    if (!c) return;
    const fwd = this.tmp2.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const car = c.pos;
    const kmh = this.speedKmh;
    let wantFov = 62;
    const wantPos = this.p;
    const wantLook = this.d;
    switch (this.mode) {
      case 'chase': {
        // elevated chase: high and far enough back to read the road ahead, checkpoints and side routes
        const back = 13 + Math.min(5, kmh / 60);
        wantPos.copy(car).addScaledVector(fwd, -back);
        wantPos.y += 7.5;
        wantLook.copy(car).addScaledVector(fwd, 16);
        wantLook.y += 0.4;
        wantFov = 58 + Math.min(8, kmh / 28);
        break;
      }
      case 'hood': {
        wantPos.copy(car).addScaledVector(fwd, 0.6);
        wantPos.y += 1.5;
        wantLook.copy(car).addScaledVector(fwd, 40);
        wantLook.y += 1.2;
        wantFov = 74 + Math.min(14, kmh / 18);
        break;
      }
      case 'tv': {
        this.orbit += dt * 0.12;
        const r = 60;
        wantPos.set(car.x + Math.cos(this.orbit) * r, car.y + 26, car.z + Math.sin(this.orbit) * r);
        wantLook.copy(car).addScaledVector(fwd, 6);
        wantFov = 44;
        break;
      }
      case 'top': {
        wantPos.set(car.x, car.y + 190, car.z - 0.1);
        wantLook.copy(car);
        wantFov = 50;
        break;
      }
    }
    // keep the camera above the ground
    wantPos.y = Math.max(wantPos.y, this.world.heightOnRoad(wantPos.x, wantPos.z) + 1.2);
    const posK = this.mode === 'hood' ? 1 : 1 - Math.exp(-dt * (this.mode === 'chase' ? 7 : 3));
    if (!this.camInit) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this.camInit = true;
    } else {
      this.camPos.lerp(wantPos, posK);
      this.camLook.lerp(wantLook, this.mode === 'hood' ? 1 : 1 - Math.exp(-dt * 9));
    }
    cam.position.copy(this.camPos);
    // no handheld shake: the camera only follows the car
    void t;
    cam.lookAt(this.camLook);
    this.fov += (wantFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
      this.world.setViewport(this.stage.height, this.fov);
    }
    this.world.focusShadow(car);
  }

  reduceMotion = false;

  /** Position of a racer for the minimap (world x,z). */
  carPosition(id: number, out: Vector3): Vector3 | null {
    const c = this.cars.get(id);
    return c ? out.copy(c.pos) : null;
  }

  dispose(): void {
    this.stage.stop();
    this.stage.dispose();
  }
}
