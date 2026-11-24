import type { AppStateMachine } from '../../state/AppState.ts';
import { RaceEngine, type RaceConfig, type RaceState } from '../../engine/RaceEngine.ts';
import { CIRCUITS } from '../../data/circuits/index.ts';
import { buildRaceEvents, EVENT_LABEL } from '../../data/raceEvents.ts';
import { RULES } from '../../engine/rules.ts';
import { settings } from '../../state/Settings.ts';
import { session, racerName } from '../../state/session.ts';
import type { Graph } from '../../core/Graph.ts';
import { buildGrid } from '../../data/grid.ts';
import type { CircuitMeta } from '../../data/circuits/meta.ts';
import type { ScheduledEvent } from '../../engine/EventScheduler.ts';
import { RaceView, type CameraMode } from '../../render3d/RaceView.ts';
import { liveOrder } from '../../render3d/ranking.ts';
import { Vector3 } from 'three';

const HUMAN = 1;
const SWATCH = ['var(--lime)', 'var(--cyan)', 'var(--warning)', 'var(--ink)'];
const ALGO_LABEL: Record<string, string> = {
  Human: 'Dijkstra', AStarRouter: 'A*', BFSRouter: 'BFS', DFSRouter: 'DFS',
  FixedMainRoute: 'Dijkstra', ShortcutSeeker: 'Shortcut', MinDistance: 'MinDist',
};

export function fmtTime(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** 3D racing screen: RaceEngine (unchanged logic) + RaceView (presentation) + DOM HUD. */
export class Racing {
  readonly el: HTMLElement;
  private view: RaceView | null = null;
  private engine: RaceEngine | null = null;
  private graph: Graph | null = null;
  private meta: CircuitMeta | null = null;
  private events: ScheduledEvent[] = [];
  private loggedEvents = new Set<number>();
  private circuitId = session.plan?.circuitId ?? CIRCUITS[Math.min(session.championship.raceIndex, CIRCUITS.length - 1)]!.meta.id;
  private accum = 0;
  private phase: 'lights' | 'go' | 'racing' | 'finished' = 'lights';
  private phaseT = 0;
  private paused = false;
  private simSpeed = 1;
  private recorded = false;
  private goBanner = false;
  private goT = 0;
  private lastFuel: number = RULES.MAX_FUEL_TENTHS;
  private readonly dt = 1 / 60;
  private readonly onKey = (e: KeyboardEvent): void => this.key(e);
  private readonly mapPos = new Vector3();

  // HUD refs
  private hud!: HTMLElement;
  private stageEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private lapEl!: HTMLElement;
  private cpEl!: HTMLElement;
  private fuelBar!: HTMLElement;
  private fuelEl!: HTMLElement;
  private pips!: HTMLElement;
  private tower!: HTMLElement;
  private feed!: HTMLElement;
  private lights!: HTMLElement;
  private banner!: HTMLElement;
  private map!: HTMLCanvasElement;
  private camBtn!: HTMLButtonElement;
  private nitroBtn!: HTMLButtonElement;
  private overlay: HTMLElement | null = null;
  private mapBounds = { minX: 0, minZ: 0, scale: 1, w: 1, h: 1 };
  private mapBase: HTMLCanvasElement | null = null;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = el('div', 'screen screen--race');
    this.el.style.cssText = 'height:100%;';
    container.appendChild(this.el);
    this.buildDom();
    window.addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.setupRace(this.circuitId));
  }

  // ------------------------------------------------------------------ DOM
  private buildDom(): void {
    this.stageEl = el('div', 'stage3d');
    const canvasHost = el('div', 'stage3d__canvas');
    this.stageEl.appendChild(canvasHost);
    this.hud = el('div', 'hud');
    this.hud.innerHTML = `
      <div class="hud__top">
        <div class="hud__interactive" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="hud__btn" data-act="menu">← Menu</button>
          <span data-slot="circuits" style="display:flex;gap:6px"></span>
          <button class="hud__btn" data-act="cam">Camera: Chase</button>
          <button class="hud__btn" data-act="speed">×1</button>
          <button class="hud__btn" data-act="pause">Pause</button>
        </div>
        <div class="hud__chip hud__timer"><div class="hud__num" data-slot="clock">0:00.00</div><div class="hud__lap" data-slot="lap">Lap 1</div><div class="hud__label" data-slot="cp">Checkpoint 0</div></div>
        <div class="hud__chip hud__tower" data-slot="tower"></div>
      </div>
      <div class="hud__feed" data-slot="feed" aria-live="polite"></div>
      <div class="hud__chip hud__map"><canvas data-slot="map" width="190" height="190"></canvas></div>
      <div class="hud__lights" data-slot="lights"></div>
      <div class="hud__banner" data-slot="banner"></div>
      <div class="hud__bottom">
        <div class="hud__chip hud__speed">
          <div><span class="hud__num" data-slot="speed">0</span><small>KM/H</small></div>
          <div class="hud__bar" data-slot="fuelbar"><i style="width:100%"></i></div>
          <div class="hud__stats"><div><div class="hud__label">Fuel</div><div class="hud__num" data-slot="fuel">100</div></div></div>
        </div>
        <div class="hud__chip hud__nitro hud__interactive">
          <div class="hud__label">Nitro</div>
          <div class="hud__pips" data-slot="pips"></div>
          <button class="hud__btn hud__btn--primary" data-act="nitro">Nitro  [N]</button>
        </div>
      </div>
      <div class="hud__help"><kbd>N</kbd> nitro <kbd>C</kbd> camera <kbd>P</kbd> pause <kbd>1</kbd>–<kbd>4</kbd> view</div>`;
    this.stageEl.appendChild(this.hud);
    this.el.appendChild(this.stageEl);
    const q = <T extends HTMLElement>(s: string): T => this.hud.querySelector(s) as T;
    this.speedEl = q('[data-slot=speed]');
    this.clockEl = q('[data-slot=clock]');
    this.lapEl = q('[data-slot=lap]');
    this.cpEl = q('[data-slot=cp]');
    this.fuelBar = q('[data-slot=fuelbar]');
    this.fuelEl = q('[data-slot=fuel]');
    this.pips = q('[data-slot=pips]');
    this.tower = q('[data-slot=tower]');
    this.feed = q('[data-slot=feed]');
    this.lights = q('[data-slot=lights]');
    this.banner = q('[data-slot=banner]');
    this.map = q('[data-slot=map]');
    this.camBtn = q('[data-act=cam]');
    this.nitroBtn = q('[data-act=nitro]');
    for (let i = 0; i < 5; i++) this.lights.appendChild(el('span', 'hud__light'));

    const slot = q('[data-slot=circuits]');
    for (const c of CIRCUITS) {
      const b = el('button', 'hud__btn');
      b.textContent = c.meta.name;
      b.dataset['circuit'] = c.meta.id;
      b.addEventListener('click', () => {
        this.circuitId = c.meta.id;
        this.setupRace(c.meta.id);
      });
      slot.appendChild(b);
    }
    this.hud.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!a) return;
      switch (a.dataset['act']) {
        case 'menu': this.app.navigate('MainMenu'); break;
        case 'cam': this.cycleCamera(); break;
        case 'speed': this.simSpeed = this.simSpeed === 1 ? 2 : this.simSpeed === 2 ? 4 : 1; a.textContent = `×${this.simSpeed}`; break;
        case 'pause': this.togglePause(); break;
        case 'nitro': this.fireNitro(); break;
      }
    });
  }

  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'n' || k === ' ') { this.fireNitro(); e.preventDefault(); }
    else if (k === 'c') this.cycleCamera();
    else if (k === 'p') this.togglePause();
    else if (k >= '1' && k <= '4') this.setCamera((['chase', 'hood', 'tv', 'top'] as CameraMode[])[Number(k) - 1]!);
  }

  private cycleCamera(): void {
    if (!this.view) return;
    this.setCamera(this.view.cycleMode());
  }

  private setCamera(m: CameraMode): void {
    this.view?.setMode(m);
    this.camBtn.textContent = `Camera: ${m === 'tv' ? 'TV' : m[0]!.toUpperCase() + m.slice(1)}`;
  }

  private togglePause(): void {
    if (this.phase !== 'racing') return;
    this.paused = !this.paused;
    (this.hud.querySelector('[data-act=pause]') as HTMLElement).textContent = this.paused ? 'Resume' : 'Pause';
    this.banner.innerHTML = this.paused ? '<div class="hud__num">PAUSED</div>' : '';
  }

  private fireNitro(): void {
    if (this.phase !== 'racing' || this.paused || !this.engine) return;
    if (this.engine.activateNitro(HUMAN)) this.log('Nitro engaged', 'info');
  }

  private log(text: string, tone: 'danger' | 'good' | 'info' | '' = ''): void {
    const e = el('div', `hud__event${tone ? ' hud__event--' + tone : ''}`);
    e.textContent = text;
    this.feed.appendChild(e);
    while (this.feed.children.length > 5) this.feed.firstElementChild?.remove();
    setTimeout(() => e.remove(), 9000);
  }

  // ------------------------------------------------------------------ race setup
  private setupRace(circuitId: string): void {
    const def = CIRCUITS.find((c) => c.meta.id === circuitId);
    if (!def) return;
    this.view?.dispose();
    this.view = null;
    this.overlay?.remove();
    this.overlay = null;
    this.feed.innerHTML = '';
    this.banner.innerHTML = '';
    this.hud.querySelectorAll<HTMLElement>('[data-circuit]').forEach((b) => b.classList.toggle('hud__btn--primary', b.dataset['circuit'] === circuitId));

    const graph = def.build();
    const meta = def.meta;
    this.graph = graph;
    this.meta = meta;
    this.events = buildRaceEvents(graph, meta);
    this.loggedEvents.clear();
    const plan = session.plan && session.plan.circuitId === circuitId ? session.plan : null;
    const config: RaceConfig = {
      startVertex: meta.startVertex,
      finishVertex: meta.finishVertex,
      checkpointOrder: [...meta.checkpointOrder],
      laps: meta.laps,
      ...(plan ? { humanPlan: { preset: plan.preset, useAStar: plan.algorithm === 'A*' } } : {}),
    };
    this.engine = new RaceEngine(graph, buildGrid(meta.startVertex), config, this.events);
    this.accum = 0;
    this.phase = 'lights';
    this.phaseT = 0;
    this.paused = false;
    this.recorded = false;
    this.lastFuel = RULES.MAX_FUEL_TENTHS;
    this.lights.style.display = 'flex';
    this.buildMapBase();

    const host = this.stageEl.querySelector('.stage3d__canvas') as HTMLElement;
    host.innerHTML = '';
    try {
      this.view = new RaceView(host, graph, {
        quality: settings.current.quality,
        weather: settings.current.weather,
        meta,
        events: this.events,
        racerIds: [1, 2, 3, 4],
      });
    } catch {
      this.showWebglError(host);
      return;
    }
    this.view.reduceMotion = settings.reduceMotion;
    this.view.setState(this.engine.state);
    this.view.placeOnGrid();
    if (plan) this.log(`Your route: ${plan.algorithm} · ${plan.preset} cost`, 'info');
    const orig = this.view.stage.onUpdate!;
    this.view.stage.onUpdate = (dt, t) => {
      this.tick(dt);
      orig(dt, t);
    };
    this.setCamera('chase');
    this.view.start();
  }

  private showWebglError(host: HTMLElement): void {
    host.innerHTML = `<div class="hud__fallback"><div><h2 class="hud__num" style="font-size:2rem">3D view unavailable</h2><p>WebGL could not start. Switch the renderer to 2D in Settings.</p></div></div>`;
  }

  // ------------------------------------------------------------------ loop
  private tick(rawDt: number): void {
    const engine = this.engine;
    const view = this.view;
    if (!engine || !view) return;
    const dtFrame = Math.min(rawDt, 0.1);

    if (this.phase === 'lights') {
      this.phaseT += dtFrame;
      const on = Math.min(5, Math.floor(this.phaseT / 0.85));
      this.paintLights(on, false);
      view.setStartLights(on, false);
      if (this.phaseT > 5 * 0.85 + 0.5) {
        this.phase = 'go';
        this.phaseT = 0;
        this.paintLights(5, true);
        view.setStartLights(5, true);
        this.banner.innerHTML = '<div class="hud__num" style="color:var(--lime)">GO</div>';
        this.goBanner = true;
        this.goT = 0;
      }
    } else if (this.phase === 'go') {
      this.phaseT += dtFrame;
      if (this.phaseT > 0.25) this.phase = 'racing';
    }
    if (this.phase === 'racing' && this.goBanner) {
      this.goT += dtFrame;
      if (this.goT > 1.2) {
        this.goBanner = false;
        this.banner.innerHTML = '';
        this.lights.style.display = 'none';
      }
    }
    if (this.phase === 'go' || this.phase === 'racing') {
      if (!this.paused) {
        this.accum += dtFrame * this.simSpeed;
        let guard = 0;
        while (this.accum >= this.dt && !engine.finished && guard++ < 600) {
          engine.tick(this.dt);
          this.accum -= this.dt;
        }
      }
    }
    const state = engine.state;
    view.setState(state);
    this.updateHud(state);
    if (engine.finished && this.phase !== 'finished' && this.phase !== 'lights') {
      this.phase = 'finished';
      this.finish();
    }
  }

  private paintLights(on: number, go: boolean): void {
    [...this.lights.children].forEach((c, i) => {
      c.className = 'hud__light' + (go ? ' hud__light--go' : i < on ? ' hud__light--red' : '');
    });
  }

  // ------------------------------------------------------------------ HUD
  private updateHud(state: RaceState): void {
    const meta = this.meta!;
    const graph = this.graph!;
    const me = state.racers.find((r) => r.isHuman);
    if (!me || !this.view) return;
    this.clockEl.textContent = fmtTime(state.clock);
    this.lapEl.textContent = `Lap ${Math.min(meta.laps, me.lap + 1)} / ${meta.laps}`;
    this.cpEl.textContent = `Checkpoint ${me.checkpointProgress} / ${meta.checkpointOrder.length}`;
    this.view.world.setCheckpointProgress(me.checkpointProgress);
    this.speedEl.textContent = String(Math.round(this.view.speedKmh));
    const fuelPct = Math.max(0, (me.fuelTenths / RULES.MAX_FUEL_TENTHS) * 100);
    (this.fuelBar.firstElementChild as HTMLElement).style.width = `${fuelPct}%`;
    this.fuelBar.className = 'hud__bar' + (fuelPct < 18 ? ' hud__bar--low' : fuelPct < 38 ? ' hud__bar--warn' : '');
    this.fuelEl.textContent = (me.fuelTenths / 10).toFixed(1);
    if (me.fuelTenths > this.lastFuel + 5) this.log('Refuelled at station', 'good');
    this.lastFuel = me.fuelTenths;

    // nitro pips
    const maxPips = Math.max(2, me.nitro + (me.nitroActive ? 1 : 0));
    if (this.pips.children.length !== maxPips) {
      this.pips.innerHTML = '';
      for (let i = 0; i < maxPips; i++) this.pips.appendChild(el('span', 'hud__pip'));
    }
    [...this.pips.children].forEach((p, i) => {
      p.className = 'hud__pip' + (i < me.nitro ? ' hud__pip--on' : i === me.nitro && me.nitroActive ? ' hud__pip--on hud__pip--burn' : '');
    });
    this.nitroBtn.disabled = me.nitro <= 0 || me.nitroActive || me.status !== 'racing';

    // timed events -> feed
    for (const ev of this.events) {
      if (state.clock >= ev.triggerTime && !this.loggedEvents.has(ev.eventId)) {
        this.loggedEvents.add(ev.eventId);
        const tone = ev.type === 'RoadBlockage' || ev.type === 'ShortcutToggle' ? 'danger' : ev.type === 'NitroBooster' ? 'good' : '';
        this.log(`${EVENT_LABEL[ev.type]}${ev.duration > 0 ? ` · ${ev.duration}s` : ''}`, tone);
      }
    }

    // timing tower
    const next = (s: (typeof state.racers)[number]): number => {
      const target = s.checkpointProgress < meta.checkpointOrder.length ? meta.checkpointOrder[s.checkpointProgress]! : meta.finishVertex;
      const a = graph.getVertex(s.currentVertex);
      const b = graph.getVertex(target);
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const order = liveOrder(state.racers.map((snap) => ({ snap, distToNext: next(snap) })));
    const lead = order[0]!.snap;
    this.tower.innerHTML = order
      .map((o, i) => {
        const s = o.snap;
        const idx = s.id - 1;
        const gap = i === 0 ? 'LEADER' : s.status === 'finished' ? fmtTime(s.totalTime) : s.status === 'dnf' ? 'DNF' : lead.lap === s.lap && lead.checkpointProgress === s.checkpointProgress ? `+${Math.max(0, (o.distToNext - next(lead)) * 0.1).toFixed(1)}` : `${s.checkpointProgress} cp`;
        const algo = ALGO_LABEL[s.strategyType] ?? s.strategyType;
        return `<div class="hud__row${s.isHuman ? ' hud__row--me' : ''}"><span class="hud__num">${i + 1}</span><span class="hud__swatch" style="background:${SWATCH[idx % 4]}"></span><span>${racerName(s.id)} <small style="color:var(--ink-2);font-size:0.72rem">${algo}</small></span><span class="hud__gap">${gap}</span></div>`;
      })
      .join('');
    this.drawMap(state);
  }

  private buildMapBase(): void {
    const g = this.graph!;
    const vs = g.allVertices();
    const minX = Math.min(...vs.map((v) => v.x));
    const maxX = Math.max(...vs.map((v) => v.x));
    const minZ = Math.min(...vs.map((v) => v.y));
    const maxZ = Math.max(...vs.map((v) => v.y));
    const W = 190, H = 190, pad = 16;
    const scale = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxZ - minZ || 1));
    const ox = (W - (maxX - minX) * scale) / 2;
    const oz = (H - (maxZ - minZ) * scale) / 2;
    this.mapBounds = { minX: minX - ox / scale, minZ: minZ - oz / scale, scale, w: W, h: H };
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const cs = getComputedStyle(document.documentElement);
    ctx.lineCap = 'round';
    for (const e of g.allEdges()) {
      const a = g.getVertex(e.from), b = g.getVertex(e.to);
      ctx.strokeStyle = e.isShortcut ? cs.getPropertyValue('--warning').trim() : 'rgba(231,236,240,0.55)';
      ctx.lineWidth = e.isShortcut ? 1.5 : 2.5;
      ctx.beginPath();
      ctx.moveTo((a.x - this.mapBounds.minX) * scale, (a.y - this.mapBounds.minZ) * scale);
      ctx.lineTo((b.x - this.mapBounds.minX) * scale, (b.y - this.mapBounds.minZ) * scale);
      ctx.stroke();
    }
    ctx.fillStyle = cs.getPropertyValue('--cyan').trim();
    for (const v of vs) {
      if (v.type !== 'Checkpoint' && v.type !== 'Start' && v.type !== 'Finish') continue;
      ctx.beginPath();
      ctx.arc((v.x - this.mapBounds.minX) * scale, (v.y - this.mapBounds.minZ) * scale, 3, 0, 6.3);
      ctx.fill();
    }
    this.mapBase = c;
  }

  private drawMap(state: RaceState): void {
    const ctx = this.map.getContext('2d');
    const g = this.graph;
    if (!ctx || !g || !this.mapBase || !this.view) return;
    ctx.clearRect(0, 0, this.map.width, this.map.height);
    ctx.drawImage(this.mapBase, 0, 0);
    const b = this.mapBounds;
    // closures
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
    ctx.lineWidth = 3;
    for (const e of g.allEdges()) {
      if (e.status !== 'Blocked') continue;
      const a = g.getVertex(e.from), c = g.getVertex(e.to);
      ctx.beginPath();
      ctx.moveTo((a.x - b.minX) * b.scale, (a.y - b.minZ) * b.scale);
      ctx.lineTo((c.x - b.minX) * b.scale, (c.y - b.minZ) * b.scale);
      ctx.stroke();
    }
    const css = getComputedStyle(document.documentElement);
    const cols = ['--lime', '--cyan', '--warning', '--ink'].map((t) => css.getPropertyValue(t).trim());
    for (const s of state.racers) {
      if (!this.view.carPosition(s.id, this.mapPos)) continue;
      ctx.fillStyle = cols[(s.id - 1) % 4]!;
      ctx.beginPath();
      ctx.arc((this.mapPos.x - b.minX) * b.scale, (this.mapPos.z - b.minZ) * b.scale, s.isHuman ? 5 : 3.5, 0, 6.3);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------ results
  private finish(): void {
    const engine = this.engine!;
    const results = engine.results();
    if (!this.recorded) {
      this.recorded = true;
      session.championship.addRaceResult(results);
    }
    this.banner.innerHTML = '<div class="hud__num">CHEQUERED FLAG</div>';
    setTimeout(() => {
      this.banner.innerHTML = '';
      const o = el('div', 'hud__overlay');
      const rows = results
        .map((r) => `<tr class="${r.racerId === HUMAN ? 'me' : ''}"><td class="hud__num">${r.finishPosition}</td><td>${racerName(r.racerId)}</td><td>${fmtTime(r.fastestLap)}</td><td>${fmtTime(r.finishTime)}</td></tr>`)
        .join('');
      o.innerHTML = `<div class="hud__panel"><div class="hud__label">${this.meta!.name}</div><h2>Race finished</h2>
        <table><thead><tr><th>Pos</th><th>Driver</th><th>Best lap</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="hud__label" style="margin-bottom:10px">Result saved to the championship (${session.championship.standings().length} drivers ranked)</div>
        <div class="hud__actions"><button class="hud__btn hud__btn--primary" data-r="again">Race again</button><button class="hud__btn" data-r="dash">Championship</button><button class="hud__btn" data-r="menu">Menu</button></div></div>`;
      o.addEventListener('click', (e) => {
        const a = (e.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
        if (!a) return;
        if (a.dataset['r'] === 'again') this.setupRace(this.circuitId);
        else if (a.dataset['r'] === 'dash') this.app.navigate('Dashboard');
        else this.app.navigate('MainMenu');
      });
      this.stageEl.appendChild(o);
      this.overlay = o;
    }, 1600);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.view?.dispose();
    this.el.remove();
  }
}
