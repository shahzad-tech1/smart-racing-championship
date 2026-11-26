import type { AppStateMachine } from '../../state/AppState.ts';
import { settings } from '../../state/Settings.ts';
import { CIRCUITS } from '../../data/circuits/index.ts';
import type { Graph } from '../../core/Graph.ts';
import type { AlgoStep } from '../../core/instrumentation.ts';
import { ALGOS, runAlgo, type AlgoDef, type Run, type Group } from './labAlgos.ts';
import type { Stage } from '../../render3d/Stage.ts';
import type { GraphOverlay } from '../../render3d/GraphOverlay.ts';
import type { CarRig } from '../../render3d/CarModel.ts';
import type { Item } from '../../algorithms/knapsack.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const GROUPS: Group[] = ['Graph search', 'Shortest path', 'Spanning tree', 'Sorting', 'Dynamic programming & greedy', 'Backtracking', 'Priority queues'];

/** Algorithm Lab: 12 real algorithms replayed from recorded traces. Graph algorithms play out on the 3D circuit. */
export class AlgorithmLab {
  readonly el: HTMLElement;
  private algo: AlgoDef = ALGOS[2]!;
  private run: Run | null = null;
  private cursor = 0;
  private playing = false;
  private acc = 0;
  private speed = 12;
  private seed = 5;
  private graph!: Graph;
  private meta = CIRCUITS[0]!.meta;
  private stage: Stage | null = null;
  private overlay: GraphOverlay | null = null;
  private ghost: CarRig | null = null;
  private visited = new Set<number>();
  private raf = 0;
  private lastT = 0;
  private disposed = false;
  private mounting = false;

  private host!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private list!: HTMLElement;
  private info!: HTMLElement;
  private bar!: HTMLElement;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = el('div', 'screen');
    this.el.style.cssText = 'height:100%;';
    container.appendChild(this.el);
    const root = el('div', 'stage3d');
    this.host = el('div', 'stage3d__canvas');
    this.canvas = el('canvas') as HTMLCanvasElement;
    this.canvas.style.cssText = 'position:absolute;left:300px;right:340px;top:70px;bottom:84px;width:calc(100% - 640px);height:calc(100% - 154px);display:none;background:rgba(9,11,13,0.72);border:1px solid rgba(255,255,255,0.08)';
    const hud = el('div', 'hud');
    hud.innerHTML = '<div class="hud__top"><div class="hud__interactive"><button class="hud__btn" data-a="menu">← Menu</button></div></div>';
    this.list = el('div', 'hud__chip hud__interactive');
    this.list.style.cssText = 'position:absolute;left:16px;top:60px;bottom:16px;width:272px;overflow:auto;pointer-events:auto;padding:12px 8px;';
    this.info = el('div', 'hud__chip hud__interactive');
    this.info.style.cssText = 'position:absolute;right:16px;top:14px;bottom:84px;width:312px;overflow:auto;pointer-events:auto;';
    this.bar = el('div', 'hud__chip hud__interactive');
    this.bar.style.cssText = 'position:absolute;left:304px;right:16px;bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;pointer-events:auto;padding:10px 14px;';
    hud.append(this.list, this.info, this.bar);
    root.append(this.host, this.canvas, hud);
    this.el.appendChild(root);
    hud.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-a=menu]')) this.app.navigate('MainMenu');
    });
    this.buildList();
    this.buildBar();
    this.select(this.algo);
    this.lastT = performance.now();
    this.loop();
    void this.mount3d();
  }

  // ------------------------------------------------------------------ 3D
  private async mount3d(): Promise<void> {
    if (this.mounting || settings.current.renderer === '2d') return;
    this.mounting = true;
    try {
      const [{ Stage, webglAvailable }, { TrackWorld }, { GraphOverlay }, { readTheme }, { makeEnvironment }, { OrbitControls }, { createCar }] = await Promise.all([
        import('../../render3d/Stage.ts'),
        import('../../render3d/TrackWorld.ts'),
        import('../../render3d/GraphOverlay.ts'),
        import('../../render3d/theme.ts'),
        import('../../render3d/procedural.ts'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('../../render3d/CarModel.ts'),
      ]);
      if (this.disposed || !webglAvailable()) return;
      const theme = readTheme();
      const stage = new Stage(this.host, { quality: settings.current.quality, bloom: 0.28, fov: 48, near: 0.5, far: 6000 });
      const world = new TrackWorld(this.graph, { theme, quality: settings.current.quality, weather: 'clear', meta: this.meta, shadowExtent: 340 });
      stage.scene.add(world.group);
      stage.scene.fog = world.fog;
      try { stage.scene.environment = makeEnvironment(stage.renderer); } catch { /* optional */ }
      const overlay = new GraphOverlay(this.graph, world, theme);
      stage.scene.add(overlay.group);
      const ghost = createCar({ paint: theme.lime.clone(), accent: theme.cyan.clone(), flame: theme.nitro, number: 0 });
      ghost.group.scale.setScalar(1.6);
      ghost.group.visible = false;
      stage.scene.add(ghost.group);
      this.ghost = ghost;
      world.setViewport(stage.height, 48);
      const b = world.bounds;
      stage.camera.position.set(b.cx + b.size * 0.15, b.size * 0.85, b.cz + b.size * 0.85);
      const controls = new OrbitControls(stage.camera, stage.renderer.domElement);
      controls.target.set(b.cx + b.size * 0.08, 0, b.cz);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minDistance = 30;
      controls.maxDistance = b.size * 2.2;
      controls.update();
      stage.onUpdate = (dt, t) => {
        controls.update();
        world.sync(dt, t);
        overlay.update(dt, t);
        world.focusShadow(controls.target);
      };
      this.stage = stage;
      this.overlay = overlay;
      (this as unknown as { controls: { dispose(): void } }).controls = controls;
      this.applyKind();
      this.replayTo(this.cursor);
    } catch {
      this.host.innerHTML = '<div class="hud__fallback"><div><h2 class="hud__num" style="font-size:2rem">3D view unavailable</h2><p>Graph algorithms show their numbers and step log only. Non-graph algorithms work as usual.</p></div></div>';
    } finally {
      this.mounting = false;
    }
  }

  private applyKind(): void {
    const graphMode = this.algo.kind === 'graph';
    this.host.style.display = graphMode ? '' : 'none';
    this.canvas.style.display = graphMode ? 'none' : 'block';
    if (this.ghost) this.ghost.group.visible = false;
    if (this.stage) {
      if (graphMode) this.stage.start();
      else this.stage.stop();
    }
  }

  // ------------------------------------------------------------------ UI
  private buildList(): void {
    let html = '<div class="hud__label" style="padding:4px 10px 8px">12 algorithms · real implementations</div>';
    for (const g of GROUPS) {
      html += `<div class="hud__label" style="padding:10px 10px 4px;color:var(--lime)">${g}</div>`;
      for (const a of ALGOS.filter((x) => x.group === g)) {
        html += `<button type="button" class="menu__item" data-id="${a.id}" style="font-size:1.05rem;padding:7px 10px;min-height:36px;width:100%;border-bottom:0"><span>${a.name}</span><small>${a.sample ? 'sample' : 'track'}</small></button>`;
      }
    }
    this.list.innerHTML = html;
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
      if (b) this.select(ALGOS.find((a) => a.id === b.dataset['id'])!);
    });
  }

  private buildBar(): void {
    this.bar.innerHTML = `
      <button class="hud__btn hud__btn--primary" data-a="play" style="min-width:84px">Run</button>
      <button class="hud__btn" data-a="step">Step</button>
      <button class="hud__btn" data-a="reset">Reset</button>
      <span class="hud__label" style="margin-left:8px">Speed</span>
      <div class="seg" data-key="speed">${['Slow', 'Normal', 'Fast'].map((s) => `<button type="button" data-v="${s}" aria-pressed="${s === 'Normal'}">${s}</button>`).join('')}</div>
      <button class="hud__btn" data-a="sample" style="margin-left:auto">New sample</button>`;
    this.bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      if (b.closest('[data-key=speed]')) {
        this.speed = b.dataset['v'] === 'Slow' ? 4 : b.dataset['v'] === 'Fast' ? 36 : 12;
        b.parentElement!.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        return;
      }
      switch (b.dataset['a']) {
        case 'play': this.toggle(); break;
        case 'step': this.stepOnce(); break;
        case 'reset': this.reset(); break;
        case 'sample': this.seed += 13; this.reset(); break;
      }
    });
  }

  private select(a: AlgoDef): void {
    this.algo = a;
    this.list.querySelectorAll('[data-id]').forEach((b) => {
      const on = (b as HTMLElement).dataset['id'] === a.id;
      (b as HTMLElement).style.color = on ? 'var(--lime)' : '';
      (b as HTMLElement).style.background = on ? 'rgba(183,255,56,0.08)' : '';
    });
    const sampleBtn = this.bar.querySelector('[data-a=sample]') as HTMLElement | null;
    if (sampleBtn) sampleBtn.style.visibility = a.sample ? 'visible' : 'hidden';
    this.reset();
    this.applyKind();
  }

  private ensureRun(): Run {
    if (!this.run) {
      this.graph = this.graph ?? CIRCUITS[0]!.build();
      this.run = runAlgo(this.algo.id, this.graph, this.meta, this.seed);
    }
    return this.run;
  }

  private reset(): void {
    this.graph = CIRCUITS[0]!.build();
    this.run = null;
    this.cursor = 0;
    this.playing = false;
    this.acc = 0;
    this.visited.clear();
    this.overlay?.reset();
    if (this.ghost) this.ghost.group.visible = false;
    this.markEndpoints();
    this.ensureRun();
    this.renderInfo();
    this.syncPlayLabel();
    this.drawPanel();
  }

  private markEndpoints(): void {
    if (this.algo.kind !== 'graph' || !this.overlay) return;
    this.overlay.setNode(this.meta.startVertex, 'start');
    if (this.algo.id !== 'kruskal' && this.algo.id !== 'dfs') this.overlay.setNode(this.meta.finishVertex, 'goal');
  }

  private toggle(): void {
    const run = this.ensureRun();
    if (this.cursor >= run.steps.length) {
      this.reset();
    }
    this.playing = !this.playing;
    this.syncPlayLabel();
  }

  private stepOnce(): void {
    const run = this.ensureRun();
    if (this.cursor >= run.steps.length) this.reset();
    this.advanceTo(this.cursor + 1);
    this.playing = false;
    this.syncPlayLabel();
  }

  private syncPlayLabel(): void {
    const b = this.bar.querySelector('[data-a=play]') as HTMLElement | null;
    const run = this.run;
    if (b) b.textContent = this.playing ? 'Pause' : run && this.cursor > 0 && this.cursor < run.steps.length ? 'Resume' : run && this.cursor >= run.steps.length && run.steps.length ? 'Replay' : 'Run';
  }

  // ------------------------------------------------------------------ playback
  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.playing || !this.run) return;
    this.acc += dt * (settings.reduceMotion ? this.speed * 1.5 : this.speed);
    const n = Math.floor(this.acc);
    if (n > 0) {
      this.acc -= n;
      this.advanceTo(this.cursor + n);
    }
  };

  private advanceTo(target: number): void {
    const run = this.ensureRun();
    const to = Math.min(run.steps.length, target);
    for (let i = this.cursor; i < to; i++) this.applyGraphStep(run.steps[i]!);
    this.cursor = to;
    const done = this.cursor >= run.steps.length;
    if (done) {
      this.playing = false;
      this.finishGraph();
    }
    this.renderInfo();
    this.syncPlayLabel();
    this.drawPanel();
  }

  /** Re-apply everything up to `n` (used after the 3D scene finishes loading). */
  private replayTo(n: number): void {
    const run = this.ensureRun();
    this.visited.clear();
    this.overlay?.reset();
    this.markEndpoints();
    for (let i = 0; i < n && i < run.steps.length; i++) this.applyGraphStep(run.steps[i]!);
    if (n >= run.steps.length) this.finishGraph();
  }

  private applyGraphStep(s: AlgoStep): void {
    const o = this.overlay;
    if (!o || this.algo.kind !== 'graph') return;
    const { startVertex: st, finishVertex: gl } = this.meta;
    switch (s.kind) {
      case 'visit':
        this.visited.add(s.vertex);
        if (s.vertex !== st && s.vertex !== gl) o.setNode(s.vertex, 'visited');
        this.moveLabGhost(s.vertex);
        break;
      case 'enqueue':
        if (s.vertex !== st && s.vertex !== gl && !this.visited.has(s.vertex)) o.setNode(s.vertex, 'frontier');
        break;
      case 'relax':
        o.setEdge(s.edge, this.algo.id === 'kruskal' ? 'primary' : 'considered');
        if (s.to !== undefined && s.to !== st && s.to !== gl && !this.visited.has(s.to)) o.setNode(s.to, 'frontier');
        break;
      default:
        break;
    }
  }

  private moveLabGhost(v: number): void {
    if (!this.ghost) return;
    const vert = this.graph.getVertex(v);
    this.ghost.group.visible = true;
    this.ghost.group.position.set(vert.x, 2, vert.y);
  }

  private finishGraph(): void {
    const o = this.overlay;
    const run = this.run;
    if (!o || !run || this.algo.kind !== 'graph' || this.algo.id === 'kruskal') return;
    for (const e of run.pathEdges ?? []) o.setEdge(e, 'primary');
    for (const v of run.path ?? []) if (v !== this.meta.startVertex && v !== this.meta.finishVertex) o.setNode(v, 'path');
  }

  // ------------------------------------------------------------------ info card
  private priorityQueue(): Array<{ v: number; g: number }> {
    const run = this.run;
    if (!run || (this.algo.id !== 'dijkstra' && this.algo.id !== 'astar')) return [];
    const best = new Map<number, number>();
    const seen = new Set<number>();
    for (let i = 0; i < this.cursor; i++) {
      const s = run.steps[i]!;
      if (s.kind === 'relax' && s.to !== undefined && s.g !== undefined && s.improved) best.set(s.to, s.g);
      if (s.kind === 'visit') seen.add(s.vertex);
    }
    return [...best.entries()].filter(([v]) => !seen.has(v)).map(([v, g]) => ({ v, g })).sort((a, b) => a.g - b.g).slice(0, 6);
  }

  private renderInfo(): void {
    const a = this.algo;
    const run = this.run;
    const total = run?.steps.length ?? 0;
    const pct = total ? Math.round((this.cursor / total) * 100) : 0;
    const c = run?.counters;
    const done = !!run && this.cursor >= total && total > 0;
    const pq = this.priorityQueue();
    const logStart = Math.max(0, this.cursor - 7);
    const log = run ? run.steps.slice(logStart, this.cursor).map((s, k) => `<div style="color:${logStart + k === this.cursor - 1 ? 'var(--ink)' : 'var(--ink-2)'}">${logStart + k + 1}. ${run.log(s, logStart + k)}</div>`).join('') : '';
    this.info.innerHTML = `
      <div class="hud__label">${a.group}${a.sample ? '' : ' · on the track'}</div>
      <h2 class="hud__num" style="font-size:1.9rem;margin:4px 0 6px;line-height:1.05">${a.name}</h2>
      ${a.sample ? '<span class="hud__chip" style="display:inline-block;padding:1px 8px;border-color:var(--warning);color:var(--warning);font-size:0.7rem;letter-spacing:0.12em;margin-bottom:6px">SAMPLE DATA</span>' : ''}
      <p style="color:var(--ink-2);font-size:0.88rem;margin:4px 0 10px">${a.blurb}</p>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:0.85rem"><span class="hud__label">Time</span><span>${a.time}</span><span class="hud__label">Space</span><span>${a.space}</span></div>
      <div class="hud__bar" style="margin:12px 0"><i style="width:${pct}%"></i></div>
      <div class="hud__stats" style="flex-wrap:wrap;gap:14px">
        ${c ? `${c.visitedVertices ? `<div><div class="hud__label">Visited</div><div class="hud__num">${c.visitedVertices}</div></div>` : ''}
        ${c.examinedEdges ? `<div><div class="hud__label">Edges</div><div class="hud__num">${c.examinedEdges}</div></div>` : ''}
        ${c.relaxedEdges ? `<div><div class="hud__label">Relaxed</div><div class="hud__num">${c.relaxedEdges}</div></div>` : ''}
        ${c.heapPushes + c.heapPops ? `<div><div class="hud__label">Heap ops</div><div class="hud__num">${c.heapPushes + c.heapPops}</div></div>` : ''}
        ${c.comparisons ? `<div><div class="hud__label">Compares</div><div class="hud__num">${c.comparisons}</div></div>` : ''}
        ${c.dpStatesComputed ? `<div><div class="hud__label">DP states</div><div class="hud__num">${c.dpStatesComputed}</div></div>` : ''}` : ''}
      </div>
      ${pq.length ? `<div class="hud__label" style="margin-top:12px">Priority queue (cheapest first)</div>${pq.map((p, i) => `<div class="hud__row" style="grid-template-columns:auto 1fr auto;padding:2px 0;${i === 0 ? 'color:var(--lime)' : ''}"><span class="hud__num">v${p.v}</span><span></span><span class="hud__gap">g=${p.g.toFixed(3)}</span></div>`).join('')}` : ''}
      ${done && run ? `<div class="hud__label" style="margin-top:12px">Result</div><p style="margin:4px 0 0;color:var(--lime)">${run.result}</p>` : ''}
      <div class="hud__label" style="margin:12px 0 4px">Step log · ${this.cursor} / ${total}</div>
      <div style="font-family:var(--font-mono);font-size:0.78rem;line-height:1.5">${log || '<span style="color:var(--ink-2)">Press Run or Step.</span>'}</div>`;
  }

  // ------------------------------------------------------------------ 2D panel (sorting, DP, backtracking)
  private drawPanel(): void {
    if (this.algo.kind === 'graph') return;
    const cv = this.canvas;
    const rect = cv.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width || 600));
    const h = Math.max(160, Math.floor(rect.height || 360));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const ctx = cv.getContext('2d');
    const run = this.run;
    if (!ctx || !run) return;
    const cs = getComputedStyle(document.documentElement);
    const col = { lime: cs.getPropertyValue('--lime').trim(), cyan: cs.getPropertyValue('--cyan').trim(), warn: cs.getPropertyValue('--warning').trim(), danger: cs.getPropertyValue('--danger').trim(), ink: cs.getPropertyValue('--ink').trim(), ink2: cs.getPropertyValue('--ink-2').trim(), bg: cs.getPropertyValue('--bg').trim() };
    ctx.clearRect(0, 0, w, h);
    ctx.font = '13px ' + (cs.getPropertyValue('--font-mono').trim() || 'monospace');
    const done = this.cursor >= run.steps.length && run.steps.length > 0;
    const data = run.data ?? {};
    if (this.algo.kind === 'array') this.drawArray(ctx, w, h, col, run, data, done);
    else if (this.algo.id === 'knapsack') this.drawKnapsack(ctx, w, h, col, run, data, done);
    else if (this.algo.id === 'greedy') this.drawGreedy(ctx, w, h, col, data);
    else if (this.algo.kind === 'refuel') this.drawRefuel(ctx, w, h, col, data);
    else this.drawBacktrack(ctx, w, h, col, run, data, done);
  }

  private drawArray(ctx: CanvasRenderingContext2D, w: number, h: number, col: Record<string, string>, run: Run, data: Record<string, unknown>, done: boolean): void {
    const arr = [...(data['arr'] as number[])];
    let hot = new Set<number>();
    for (let i = 0; i < this.cursor; i++) {
      const s = run.steps[i]!;
      hot = new Set();
      if (s.kind === 'compare') hot.add(s.i).add(s.j);
      else if (s.kind === 'swap') {
        const t = arr[s.i]!;
        arr[s.i] = arr[s.j]!;
        arr[s.j] = t;
        hot.add(s.i).add(s.j);
      } else if (s.kind === 'write' && typeof s.item === 'number') {
        arr[s.index] = s.item;
        hot.add(s.index);
      }
    }
    const show = done ? (data['sorted'] as number[]) : arr;
    const pad = 30;
    const bw = (w - pad * 2) / show.length;
    show.forEach((v, i) => {
      const bh = (v / 100) * (h - pad * 2 - 14);
      ctx.fillStyle = done ? col.lime! : hot.has(i) ? col.cyan! : col.ink2!;
      ctx.fillRect(pad + i * bw + 1, h - pad - bh, bw - 2, bh);
      if (bw > 22) {
        ctx.fillStyle = col.ink!;
        ctx.fillText(String(v), pad + i * bw + 2, h - pad + 14);
      }
    });
    ctx.fillStyle = col.ink2!;
    ctx.fillText('Track values · cyan = being compared / moved · lime = result', pad, 20);
  }

  private drawKnapsack(ctx: CanvasRenderingContext2D, w: number, h: number, col: Record<string, string>, run: Run, data: Record<string, unknown>, done: boolean): void {
    const items = data['items'] as Item[];
    const B = data['budget'] as number;
    const selected = new Set(data['selected'] as number[]);
    const m = items.length;
    const padL = 150;
    const padT = 44;
    const cw = Math.min(26, (w - padL - 20) / (B + 1));
    const ch = Math.min(34, (h - padT - 20) / m);
    const grid: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(B + 1).fill(-1));
    let maxV = 1;
    for (let i = 0; i < this.cursor; i++) {
      const s = run.steps[i]!;
      if (s.kind === 'dpCell') {
        grid[s.i]![s.b] = s.value;
        maxV = Math.max(maxV, s.value);
      }
    }
    ctx.fillStyle = col.ink2!;
    ctx.fillText(`Budget columns 0…${B}`, padL, 20);
    items.forEach((it, r) => {
      const y = padT + r * ch;
      ctx.fillStyle = done && selected.has(it.id) ? col.lime! : col.ink!;
      ctx.fillText(`#${it.id}  cost ${it.cost}  +${it.benefit}`, 12, y + ch * 0.62);
      for (let b = 0; b <= B; b++) {
        const v = grid[r + 1]![b]!;
        if (v < 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.strokeRect(padL + b * cw, y, cw - 1, ch - 1);
          continue;
        }
        ctx.fillStyle = done && selected.has(it.id) ? col.lime! : col.cyan!;
        ctx.globalAlpha = 0.12 + 0.75 * (v / maxV);
        ctx.fillRect(padL + b * cw, y, cw - 1, ch - 1);
        ctx.globalAlpha = 1;
        if (cw > 18) {
          ctx.fillStyle = col.ink!;
          ctx.fillText(String(v), padL + b * cw + 2, y + ch * 0.62);
        }
      }
    });
  }

  private drawGreedy(ctx: CanvasRenderingContext2D, w: number, h: number, col: Record<string, string>, data: Record<string, unknown>): void {
    const order = data['order'] as Item[];
    const budget = data['budget'] as number;
    let remaining = budget;
    const taken: Item[] = [];
    const rows = order.map((it, i) => {
      if (i >= this.cursor) return { it, state: 'pending' as const };
      if (it.cost <= remaining) {
        remaining -= it.cost;
        taken.push(it);
        return { it, state: 'take' as const };
      }
      return { it, state: 'skip' as const };
    });
    const ch = Math.min(40, (h - 110) / Math.max(1, order.length));
    ctx.fillStyle = col.ink2!;
    ctx.fillText(`Sorted by benefit/cost · budget ${budget}, remaining ${remaining}`, 16, 22);
    rows.forEach((r, i) => {
      const y = 44 + i * ch;
      ctx.fillStyle = r.state === 'take' ? col.lime! : r.state === 'skip' ? col.danger! : col.ink2!;
      ctx.fillText(`#${r.it.id}  cost ${r.it.cost}  +${r.it.benefit}  ratio ${(r.it.benefit / r.it.cost).toFixed(2)}  ${r.state === 'take' ? 'taken' : r.state === 'skip' ? "doesn't fit" : ''}`, 16, y + ch * 0.6);
    });
    const done = this.cursor >= order.length;
    if (done) {
      ctx.fillStyle = col.ink!;
      ctx.fillText(`Greedy value ${data['value']} · DP optimum ${data['optimum']}`, 16, h - 24);
    }
    void w;
  }

  private drawRefuel(ctx: CanvasRenderingContext2D, w: number, h: number, col: Record<string, string>, data: Record<string, unknown>): void {
    const legFuel = data['legFuel'] as number[];
    const stations = data['stations'] as boolean[];
    const result = data['result'] as { feasible: boolean; purchases: number[] };
    const cap = data['capacity'] as number;
    const pad = 36;
    const bw = (w - pad * 2) / legFuel.length;
    let level = data['startFuel'] as number;
    ctx.fillStyle = col.ink2!;
    ctx.fillText(`Tank capacity ${cap / 10} · stations marked ▲ · lime = fuel bought`, pad, 22);
    legFuel.forEach((need, i) => {
      const x = pad + i * bw;
      const revealed = i < this.cursor;
      const buy = result.feasible && revealed ? result.purchases[i] ?? 0 : 0;
      if (revealed) level += buy;
      const sc = (v: number): number => (v / cap) * (h - pad * 2 - 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeRect(x + 4, h - pad - sc(cap), bw - 8, sc(cap));
      if (revealed) {
        ctx.fillStyle = col.cyan!;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x + 4, h - pad - sc(Math.min(cap, level)), bw - 8, sc(Math.min(cap, level)));
        ctx.globalAlpha = 1;
        if (buy > 0) {
          ctx.fillStyle = col.lime!;
          ctx.fillRect(x + 4, h - pad - sc(Math.min(cap, level)), bw - 8, sc(buy));
        }
        ctx.fillStyle = col.warn!;
        ctx.fillRect(x + 4, h - pad - sc(need) - 2, bw - 8, 3);
        level -= need;
      }
      ctx.fillStyle = stations[i] ? col.lime! : col.ink2!;
      ctx.fillText(stations[i] ? `▲ stop ${i}` : `stop ${i}`, x + 6, h - pad + 18);
    });
    ctx.fillStyle = col.warn!;
    ctx.fillText('amber line = fuel needed for the next leg', pad, h - 8);
  }

  private drawBacktrack(ctx: CanvasRenderingContext2D, w: number, h: number, col: Record<string, string>, run: Run, data: Record<string, unknown>, done: boolean): void {
    const n = data['n'] as number;
    const k = data['k'] as number;
    const chosen = new Set(data['chosen'] as number[]);
    const placed = new Set<number>();
    let flash: { idx: number; kind: string } | null = null;
    for (let i = 0; i < this.cursor; i++) {
      const s = run.steps[i]!;
      flash = null;
      if (s.kind === 'place') placed.add(s.index);
      else if (s.kind === 'unplace') {
        placed.delete(s.index);
        flash = { idx: s.index, kind: 'undo' };
      } else if (s.kind === 'prune') flash = { idx: s.index, kind: 'prune' };
    }
    const size = Math.min(52, (w - 40) / n);
    const x0 = (w - size * n) / 2;
    const y0 = h / 2 - size / 2;
    ctx.fillStyle = col.ink2!;
    ctx.fillText(`Place ${k} obstacles on ${n} ring roads, none adjacent (wraps around)`, 20, 24);
    for (let i = 0; i < n; i++) {
      const on = done ? chosen.has(i) : placed.has(i);
      ctx.fillStyle = on ? col.lime! : flash?.idx === i ? (flash.kind === 'undo' ? col.warn! : col.danger!) : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x0 + i * size + 2, y0, size - 4, size);
      ctx.fillStyle = on ? col.bg! : col.ink!;
      ctx.fillText(String(i), x0 + i * size + size / 2 - 6, y0 + size / 2 + 5);
    }
    ctx.fillStyle = col.ink2!;
    ctx.fillText(`placed ${done ? chosen.size : placed.size}/${k} · lime = obstacle · red = pruned (adjacent) · amber = undone`, 20, h - 24);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    (this as unknown as { controls?: { dispose(): void } }).controls?.dispose();
    this.stage?.stop();
    this.stage?.dispose();
    this.el.remove();
  }
}
