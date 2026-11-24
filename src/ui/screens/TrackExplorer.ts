import type { AppStateMachine } from '../../state/AppState.ts';
import { CIRCUITS } from '../../data/circuits/index.ts';
import { bfs } from '../../algorithms/bfs.ts';
import { dfs } from '../../algorithms/dfs.ts';
import { dijkstra } from '../../algorithms/dijkstra.ts';
import { aStar, weightedHeuristic } from '../../algorithms/astar.ts';
import { PRESETS, REFS, costFn, type PresetName } from '../../core/cost.ts';
import { recordingTrace, type AlgoStep, type Counters } from '../../core/instrumentation.ts';
import type { Graph } from '../../core/Graph.ts';
import type { PathResult } from '../../algorithms/pathTypes.ts';
import { settings } from '../../state/Settings.ts';
import { session } from '../../state/session.ts';
import { Vector2, Vector3 } from 'three';
import type { Stage } from '../../render3d/Stage.ts';
import type { TrackWorld } from '../../render3d/TrackWorld.ts';
import type { GraphOverlay } from '../../render3d/GraphOverlay.ts';
import type { CarRig } from '../../render3d/CarModel.ts';

type Algo = 'BFS' | 'DFS' | 'Dijkstra' | 'A*';
const ALGOS: Algo[] = ['BFS', 'DFS', 'Dijkstra', 'A*'];
const BLURB: Record<Algo, string> = {
  BFS: 'Fewest roads, ignores distance. O(V+E).',
  DFS: 'Walks as deep as it can first; finds cycles and components. O(V+E).',
  Dijkstra: 'Cheapest route under the chosen cost preset. O((V+E) log V).',
  'A*': 'Dijkstra steered by a Euclidean-based heuristic: same cost, fewer expansions.',
};

function edgesOfPath(g: Graph, path: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const hops = g.neighbors(path[i]!, { ignoreBlocked: true }).filter((n) => n.to === path[i + 1]);
    if (hops.length === 0) continue;
    out.push(hops.reduce((a, b) => (b.edge.distance < a.edge.distance ? b : a)).edge.id);
  }
  return out;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** 3D track explorer: pick start/goal on the circuit, replay BFS / DFS / Dijkstra / A* step by step. */
export class TrackExplorer {
  readonly el: HTMLElement;
  private circuitIdx = 0;
  private algo: Algo = 'Dijkstra';
  private preset: PresetName = 'Balanced';
  private graph!: Graph;
  private start: number | null = null;
  private goal: number | null = null;
  private steps: AlgoStep[] = [];
  private cursor = 0;
  private playing = false;
  private speed = 14; // steps per second
  private acc = 0;
  private result: PathResult | null = null;
  private pathEdges: number[] = [];
  private counters: Counters | null = null;
  private extra = '';
  private visited = new Set<number>();
  private stage: Stage | null = null;
  private world: TrackWorld | null = null;
  private overlay: GraphOverlay | null = null;
  private controls: { update(): boolean; target: Vector3; dispose(): void; enabled: boolean; autoRotate: boolean } | null = null;
  private ghost: CarRig | null = null;
  private ghostT = 0;
  private downAt = new Vector2();
  private disposed = false;
  private building = false;

  private stageHost!: HTMLElement;
  private panel!: HTMLElement;
  private info!: HTMLElement;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = el('div', 'screen');
    this.el.style.cssText = 'height:100%;';
    container.appendChild(this.el);
    const root = el('div', 'stage3d');
    this.stageHost = el('div', 'stage3d__canvas');
    const hud = el('div', 'hud');
    this.panel = el('div', 'hud__chip hud__interactive');
    this.panel.style.cssText = 'position:absolute;left:16px;top:60px;width:280px;max-height:calc(100% - 80px);overflow:auto;pointer-events:auto;';
    this.info = el('div', 'hud__chip hud__interactive');
    this.info.style.cssText = 'position:absolute;right:16px;top:14px;width:290px;max-height:calc(100% - 28px);overflow:auto;pointer-events:auto;';
    const top = el('div', 'hud__top');
    top.innerHTML = '<div class="hud__interactive" style="display:flex;gap:8px"><button class="hud__btn" data-act="menu">← Menu</button></div>';
    top.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act=menu]')) this.app.navigate('MainMenu');
    });
    hud.append(top, this.panel, this.info);
    root.append(this.stageHost, hud);
    this.el.appendChild(root);
    this.renderPanel();
    this.renderInfo();
    void this.mount();
  }

  // ------------------------------------------------------------------ 3D
  private async mount(): Promise<void> {
    if (this.building) return;
    this.building = true;
    try {
      const [{ Stage }, { TrackWorld }, { GraphOverlay }, { readTheme }, { OrbitControls }, { createCar }, { makeEnvironment }] = await Promise.all([
        import('../../render3d/Stage.ts'),
        import('../../render3d/TrackWorld.ts'),
        import('../../render3d/GraphOverlay.ts'),
        import('../../render3d/theme.ts'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('../../render3d/CarModel.ts'),
        import('../../render3d/procedural.ts'),
      ]);
      if (this.disposed) return;
      this.teardown3d();
      this.stageHost.innerHTML = '';
      const def = CIRCUITS[this.circuitIdx]!;
      this.graph = def.build();
      const theme = readTheme();
      const stage = new Stage(this.stageHost, { quality: settings.current.quality, bloom: 0.28, fov: 48, near: 0.5, far: 6000 });
      const world = new TrackWorld(this.graph, { theme, quality: settings.current.quality, weather: 'clear', meta: def.meta, shadowExtent: 340 });
      stage.scene.add(world.group);
      stage.scene.fog = world.fog;
      try { stage.scene.environment = makeEnvironment(stage.renderer); } catch { /* optional */ }
      const overlay = new GraphOverlay(this.graph, world, theme);
      stage.scene.add(overlay.group);
      const ghost = createCar({ paint: theme.lime.clone(), accent: theme.cyan.clone(), flame: theme.nitro, number: 0 });
      ghost.group.scale.setScalar(1.6);
      ghost.group.visible = false;
      stage.scene.add(ghost.group);
      world.setViewport(stage.height, 48);
      const b = world.bounds;
      stage.camera.position.set(b.cx + b.size * 0.55, b.size * 0.75, b.cz + b.size * 0.85);
      const controls = new OrbitControls(stage.camera, stage.renderer.domElement);
      controls.target.set(b.cx, 0, b.cz);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minDistance = 30;
      controls.maxDistance = b.size * 2.2;
      controls.autoRotate = !settings.reduceMotion;
      controls.autoRotateSpeed = 0.35;
      controls.update();
      this.stage = stage;
      this.world = world;
      this.overlay = overlay;
      this.ghost = ghost;
      this.controls = controls as unknown as TrackExplorer['controls'];
      const dom = stage.renderer.domElement;
      dom.addEventListener('pointerdown', (e) => {
        this.downAt.set(e.clientX, e.clientY);
        if (this.controls) this.controls.autoRotate = false;
      });
      dom.addEventListener('pointerup', (e) => {
        if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return;
        const r = dom.getBoundingClientRect();
        const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const id = this.overlay?.pick(ndc, stage.camera);
        if (id !== null && id !== undefined) this.onPick(id);
      });
      const tmpA = new Vector3();
      const tmpD = new Vector3();
      stage.onUpdate = (dt, t) => {
        this.advance(dt);
        controls.update();
        world.sync(dt, t);
        overlay.update(dt, t);
        this.driveGhost(dt, t, tmpA, tmpD);
        world.focusShadow(controls.target);
      };
      stage.start();
      this.resetRun(true);
    } catch {
      this.stageHost.innerHTML = '<div class="hud__fallback"><div><h2 class="hud__num" style="font-size:2rem">3D view unavailable</h2><p>WebGL could not start. Pick the 2D renderer in Settings to use the classic explorer.</p></div></div>';
    } finally {
      this.building = false;
    }
  }

  private teardown3d(): void {
    this.controls?.dispose();
    this.stage?.stop();
    this.stage?.dispose();
    this.stage = null;
    this.world = null;
    this.overlay = null;
    this.controls = null;
    this.ghost = null;
  }

  // ------------------------------------------------------------------ interaction
  private onPick(id: number): void {
    if (this.start === null || (this.start !== null && this.goal !== null)) {
      this.start = id;
      this.goal = null;
    } else if (id !== this.start) {
      this.goal = id;
    }
    this.resetRun(false);
    this.renderPanel();
  }

  private needsGoal(): boolean {
    return this.algo === 'Dijkstra' || this.algo === 'A*';
  }

  private canRun(): boolean {
    return this.start !== null && (!this.needsGoal() || this.goal !== null);
  }

  /** Clear animation state; keep the selection. */
  private resetRun(full: boolean): void {
    if (full) {
      this.start = null;
      this.goal = null;
    }
    this.steps = [];
    this.cursor = 0;
    this.playing = false;
    this.acc = 0;
    this.result = null;
    this.pathEdges = [];
    this.counters = null;
    this.extra = '';
    this.visited.clear();
    this.overlay?.reset();
    if (this.start !== null) this.overlay?.setNode(this.start, 'start');
    if (this.goal !== null) this.overlay?.setNode(this.goal, 'goal');
    if (this.ghost) this.ghost.group.visible = false;
    this.renderInfo();
  }

  /** Run the real algorithm once with a recording trace, then replay the recorded steps. */
  private prepare(): void {
    if (!this.canRun() || this.start === null) return;
    const g = this.graph;
    const trace = recordingTrace();
    const cost = costFn(PRESETS[this.preset], REFS);
    let res: PathResult | null = null;
    this.extra = '';
    if (this.algo === 'BFS') {
      const r = bfs(g, this.start, this.goal ?? undefined, trace);
      res = r.found ? { found: true, path: r.path, edges: edgesOfPath(g, r.path), cost: r.edgeCount } : null;
      this.extra = `Reachable vertices: ${r.reachable.size}${r.found ? ` · ${r.edgeCount} roads (not cost-optimal)` : ''}`;
    } else if (this.algo === 'DFS') {
      const r = dfs(g, this.start, trace);
      this.extra = `${r.hasCycle ? 'Cycle detected' : 'No cycle'} · ${r.components.length} component${r.components.length === 1 ? '' : 's'}`;
    } else if (this.algo === 'Dijkstra') {
      res = dijkstra(g, this.start, this.goal!, cost, trace);
    } else {
      res = aStar(g, this.start, this.goal!, cost, weightedHeuristic(g, cost), trace);
    }
    if (this.needsGoal() && this.goal !== null) {
      // honest comparison: the other algorithm on the same query
      const other = recordingTrace();
      if (this.algo === 'A*') dijkstra(g, this.start, this.goal, cost, other);
      else aStar(g, this.start, this.goal, cost, weightedHeuristic(g, cost), other);
      const mine = trace.counters.visitedVertices;
      const theirs = other.counters.visitedVertices;
      this.extra = `${this.algo} expanded ${mine} vertices · ${this.algo === 'A*' ? 'Dijkstra' : 'A*'} expanded ${theirs}`;
    }
    this.result = res;
    this.steps = trace.steps ?? [];
    this.counters = trace.counters;
    this.cursor = 0;
    this.visited.clear();
    this.overlay?.reset();
    if (this.start !== null) this.overlay?.setNode(this.start, 'start');
    if (this.goal !== null) this.overlay?.setNode(this.goal, 'goal');
    if (this.ghost && this.start !== null) this.moveGhostToVertex(this.start);
    this.renderInfo();
  }

  private applyStep(s: AlgoStep): void {
    const o = this.overlay;
    if (!o) return;
    switch (s.kind) {
      case 'visit':
        this.visited.add(s.vertex);
        if (s.vertex !== this.start && s.vertex !== this.goal) o.setNode(s.vertex, 'visited');
        this.moveGhostToVertex(s.vertex);
        break;
      case 'enqueue':
        if (s.vertex !== this.start && s.vertex !== this.goal && !this.visited.has(s.vertex)) o.setNode(s.vertex, 'frontier');
        break;
      case 'relax':
        o.setEdge(s.edge, 'considered');
        if (s.to !== undefined && s.to !== this.start && s.to !== this.goal && !this.visited.has(s.to)) o.setNode(s.to, 'frontier');
        break;
      default:
        break;
    }
  }

  private moveGhostToVertex(v: number): void {
    const ghost = this.ghost;
    const world = this.world;
    if (!ghost || !world) return;
    const vert = this.graph.getVertex(v);
    ghost.group.visible = true;
    ghost.group.position.set(vert.x, 2, vert.y);
  }

  private finishRun(): void {
    const o = this.overlay;
    if (!o) return;
    this.playing = false;
    if (this.result?.found) {
      this.pathEdges = this.result.edges;
      for (const e of this.result.edges) o.setEdge(e, 'primary');
      for (const v of this.result.path) if (v !== this.start && v !== this.goal) o.setNode(v, 'path');
      this.ghostT = 0;
      if (this.ghost) this.ghost.group.visible = true;
    }
    this.renderInfo();
    this.renderPanel();
  }

  private advance(dt: number): void {
    if (!this.playing) return;
    this.acc += dt * this.speed;
    let moved = false;
    while (this.acc >= 1 && this.cursor < this.steps.length) {
      this.acc -= 1;
      this.applyStep(this.steps[this.cursor++]!);
      moved = true;
    }
    if (moved) this.renderInfo();
    if (this.cursor >= this.steps.length) this.finishRun();
  }

  private stepOnce(): void {
    if (this.steps.length === 0) this.prepare();
    if (this.cursor < this.steps.length) this.applyStep(this.steps[this.cursor++]!);
    if (this.cursor >= this.steps.length && this.steps.length > 0) this.finishRun();
    this.renderPanel();
  }

  private togglePlay(): void {
    if (!this.canRun()) return;
    if (this.steps.length === 0 || this.cursor >= this.steps.length) {
      this.prepare();
    }
    this.playing = !this.playing;
    this.renderPanel();
  }

  private driveGhost(dt: number, t: number, p: Vector3, d: Vector3): void {
    const ghost = this.ghost;
    const world = this.world;
    if (!ghost || !world || !ghost.group.visible || !this.result?.found) return;
    const path = this.result.path;
    const edges = this.pathEdges;
    if (edges.length === 0) return;
    this.ghostT += dt * 0.55;
    const total = edges.length;
    const x = this.ghostT % total;
    const i = Math.min(total - 1, Math.floor(x));
    const edge = this.graph.getEdge(edges[i]!);
    world.pointOnEdge(edge, path[i]!, x - i, 0, p, d);
    ghost.group.position.copy(p);
    ghost.group.rotation.y = Math.atan2(d.x, d.z);
    ghost.update(dt, { speed: 24, steer: 0, brake: 0, nitro: 0, accel: 0, lateral: 0 }, t);
  }

  // ------------------------------------------------------------------ UI
  private seg(key: string, opts: string[], cur: string): string {
    return `<div class="seg" data-key="${key}" style="flex-wrap:wrap">${opts.map((o) => `<button type="button" data-v="${o}" aria-pressed="${o === cur}">${o}</button>`).join('')}</div>`;
  }

  private renderPanel(): void {
    const sName = this.start === null ? '—' : `Vertex ${this.start}`;
    const gName = this.goal === null ? (this.needsGoal() ? 'click a vertex' : 'optional') : `Vertex ${this.goal}`;
    this.panel.innerHTML = `
      <div class="hud__label">Circuit</div>
      <div style="margin:6px 0 12px">${this.seg('circuit', CIRCUITS.map((c) => c.meta.name), CIRCUITS[this.circuitIdx]!.meta.name)}</div>
      <div class="hud__label">Algorithm</div>
      <div style="margin:6px 0 4px">${this.seg('algo', ALGOS, this.algo)}</div>
      <p style="color:var(--ink-2);font-size:0.85rem;margin:6px 0 12px">${BLURB[this.algo]}</p>
      ${this.needsGoal() ? `<div class="hud__label">Cost preset</div><div style="margin:6px 0 12px">${this.seg('preset', ['Balanced', 'Speed', 'Economy', 'Safety'], this.preset)}</div>` : ''}
      <div class="hud__label">Start → goal</div>
      <p style="margin:6px 0 12px"><b>${sName}</b> → <b>${gName}</b><br><span style="color:var(--ink-2);font-size:0.8rem">Click glowing markers on the track. Drag to orbit, scroll to zoom.</span></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="hud__btn hud__btn--primary" data-act="play" ${this.canRun() ? '' : 'disabled'}>${this.playing ? 'Pause' : this.cursor > 0 && this.cursor < this.steps.length ? 'Resume' : 'Run'}</button>
        <button class="hud__btn" data-act="step" ${this.canRun() ? '' : 'disabled'}>Step</button>
        <button class="hud__btn" data-act="reset">Reset</button>
      </div>
      ${this.racePlanHtml()}
      <div class="hud__label" style="margin-top:14px">Speed</div>
      <div style="margin-top:6px">${this.seg('speed', ['Slow', 'Normal', 'Fast'], this.speed <= 6 ? 'Slow' : this.speed <= 16 ? 'Normal' : 'Fast')}</div>`;
    this.panel.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      const grp = b.closest('[data-key]') as HTMLElement | null;
      if (grp) return this.onSeg(grp.dataset['key']!, b.dataset['v']!);
      const act = b.dataset['act'];
      if (act === 'play') this.togglePlay();
      else if (act === 'step') this.stepOnce();
      else if (act === 'reset') {
        this.resetRun(true);
        this.renderPanel();
      } else if (act === 'raceplan') this.racePlan();
    };
  }

  /** Only Dijkstra / A* produce a checkpoint-ordered, cost-optimal route the race engine can drive. */
  private racePlanHtml(): string {
    if (this.algo === 'Dijkstra' || this.algo === 'A*') {
      return `<div style="margin-top:14px"><button class="hud__btn hud__btn--primary" data-act="raceplan" style="width:100%">Race this plan →</button>
        <p style="color:var(--ink-2);font-size:0.78rem;margin:6px 0 0">Your car will be routed by ${this.algo} with the ${this.preset} cost, checkpoints in order.</p></div>`;
    }
    return `<p style="color:var(--ink-2);font-size:0.78rem;margin-top:14px">BFS and DFS explore the circuit. Pick Dijkstra or A* to race a plan.</p>`;
  }

  private racePlan(): void {
    if (this.algo !== 'Dijkstra' && this.algo !== 'A*') return;
    session.plan = { circuitId: CIRCUITS[this.circuitIdx]!.meta.id, algorithm: this.algo, preset: this.preset };
    this.app.navigate('Racing');
  }

  private onSeg(key: string, v: string): void {
    if (key === 'circuit') {
      const i = CIRCUITS.findIndex((c) => c.meta.name === v);
      if (i >= 0 && i !== this.circuitIdx) {
        this.circuitIdx = i;
        this.start = null;
        this.goal = null;
        this.resetRun(true);
        void this.mount();
      }
    } else if (key === 'algo') {
      this.algo = v as Algo;
      this.resetRun(false);
    } else if (key === 'preset') {
      this.preset = v as PresetName;
      this.resetRun(false);
    } else if (key === 'speed') {
      this.speed = v === 'Slow' ? 5 : v === 'Fast' ? 40 : 14;
    }
    this.renderPanel();
  }

  private describeStep(s: AlgoStep): string {
    switch (s.kind) {
      case 'visit': return `Visit vertex ${s.vertex}`;
      case 'enqueue': return `Queue vertex ${s.vertex}`;
      case 'relax': return `${s.improved ? 'Relax' : 'Skip'} edge ${s.edge}${s.g !== undefined ? ` (cost ${s.g.toFixed(2)})` : ''}`;
      case 'pathFound': return `Path found — cost ${s.cost.toFixed(3)}`;
      default: return 'Step';
    }
  }

  private renderInfo(): void {
    const c = this.counters;
    const r = this.result;
    const progress = this.steps.length ? Math.round((this.cursor / this.steps.length) * 100) : 0;
    const done = this.steps.length > 0 && this.cursor >= this.steps.length;
    const ds = this.algo === 'BFS' ? 'FIFO queue' : this.algo === 'DFS' ? 'Stack' : 'Min-heap (priority queue)';
    const complexity = BLURB[this.algo];
    const lastStep = this.cursor > 0 ? this.steps[this.cursor - 1] : null;
    let routeHtml = '';
    if (r?.found && done) {
      routeHtml = `<div class="hud__label" style="margin-top:12px">Route</div>
        <div class="hud__num" style="font-size:1.6rem">${this.algo === 'BFS' ? `${r.cost} roads` : `cost ${r.cost.toFixed(3)}`}</div>
        <div style="color:var(--ink-2);font-size:0.85rem;word-break:break-word">${r.path.join(' → ')}</div>`;
    } else if (done && this.needsGoal()) {
      routeHtml = '<p style="color:var(--danger);margin-top:12px" role="alert">No route between these vertices. A road may be blocked.</p>';
    }
    this.info.innerHTML = `
      <div class="hud__label">${this.algo}${this.start !== null ? ` · from ${this.start}` : ''}</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:0.82rem;margin:6px 0">
        <span class="hud__label">Structure</span><span>${ds}</span>
        <span class="hud__label">Complexity</span><span>${complexity}</span>
      </div>
      ${this.steps.length ? `<div class="hud__bar" style="margin:8px 0"><i style="width:${progress}%"></i></div>` : '<p style="color:var(--ink-2);margin:8px 0">Choose a start vertex, then run the algorithm. The car follows the exploration in real time.</p>'}
      ${lastStep && !done ? `<div style="color:var(--lime);font-size:0.88rem;margin:4px 0">${this.describeStep(lastStep)}</div>` : ''}
      ${c ? `<div class="hud__stats" style="flex-wrap:wrap">
        <div><div class="hud__label">Expanded</div><div class="hud__num">${c.visitedVertices}</div></div>
        <div><div class="hud__label">Edges</div><div class="hud__num">${c.examinedEdges || c.relaxedEdges}</div></div>
        ${c.heapPushes ? `<div><div class="hud__label">Heap ops</div><div class="hud__num">${c.heapPushes + c.heapPops}</div></div>` : ''}</div>` : ''}
      ${this.extra ? `<p style="margin-top:10px;font-size:0.9rem">${this.extra}</p>` : ''}
      ${routeHtml}
      <div class="hud__label" style="margin-top:14px">Legend</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:0.8rem;color:var(--ink-2);margin-top:6px">
        <i class="hud__swatch" style="background:var(--lime);height:10px"></i>start / route / car
        <i class="hud__swatch" style="background:var(--danger);height:10px"></i>goal
        <i class="hud__swatch" style="background:var(--cyan);height:10px"></i>visited
        <i class="hud__swatch" style="background:var(--warning);height:10px"></i>frontier / queued</div>`;
  }

  dispose(): void {
    this.disposed = true;
    this.teardown3d();
    this.el.remove();
  }
}



