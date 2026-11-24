import type { AppStateMachine } from '../../state/AppState.ts';
import { CanvasWrapper } from '../../render/Canvas.ts';
import { GraphRenderer } from '../../render/GraphRenderer.ts';
import { tok } from '../../render/tokens.ts';
import { buildCircuit1, CIRCUIT1_VERTICES } from '../../data/circuits/circuit1.ts';
import { bfs } from '../../algorithms/bfs.ts';
import { dfs } from '../../algorithms/dfs.ts';
import { dijkstra } from '../../algorithms/dijkstra.ts';
import { PRESETS, REFS, costFn, type PresetName } from '../../core/cost.ts';
import { recordingTrace, type AlgoStep } from '../../core/instrumentation.ts';
import type { Graph } from '../../core/Graph.ts';
import type { Vertex } from '../../core/types.ts';
import { TimingRow } from '../components/TimingRow.ts';
import { Button } from '../components/Button.ts';

type Mode = 'explore' | 'plan';

/** Build an admissible Euclidean heuristic for the weighted scalar cost. */
export function makeHeuristic(graph: Graph, preset: PresetName): (vId: number, goalId: number) => number {
  const minRatio = (() => {
    let best = Infinity;
    for (const e of graph.allEdges()) {
      if (e.distance > 0) {
        const c = costFn(PRESETS[preset], REFS)(e);
        const r = c / e.distance;
        if (r < best) best = r;
      }
    }
    return isFinite(best) ? best : 0;
  })();

  return (vId: number, goalId: number): number => {
    let vx = 0, vy = 0, gx = 0, gy = 0;
    try {
      const v = graph.getVertex(vId);
      const g = graph.getVertex(goalId);
      vx = v.x; vy = v.y; gx = g.x; gy = g.y;
    } catch { return 0; }
    const dist = Math.hypot(gx - vx, gy - vy);
    return dist * minRatio;
  };
}

export class TrackExplorerClassic {
  readonly el: HTMLElement;
  private _canvas: CanvasWrapper | null = null;
  private _stopLoop: (() => void) | null = null;
  private _graph: Graph;
  private _mode: Mode = 'explore';
  private _preset: PresetName = 'Balanced';
  private _selectedVertices = new Set<number>();
  private _reachableVertices = new Set<number>();
  private _frontierVertices = new Set<number>();
  private _highlightEdges = new Set<number>();
  private _secondaryEdges = new Set<number>();
  private _sidePanel!: HTMLElement;
  private _countersEl!: HTMLElement;
  private _explainSteps: AlgoStep[] = [];
  private _explainIdx = 0;
  private _explainPlaying = false;
  private _explainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this._graph = buildCircuit1();
    this.el = document.createElement('div');
    this.el.className = 'screen screen--menu';
    this.el.style.cssText = 'display:flex;height:100%;overflow:hidden;flex-direction:column;';
    container.appendChild(this.el);
    this._build();
  }

  private _build(): void {
    // Toolbar
    const toolbar = this._buildToolbar();
    this.el.appendChild(toolbar);

    // Main area: canvas + side panel
    const main = document.createElement('div');
    main.style.cssText = 'flex:1;display:flex;min-height:0;';
    this.el.appendChild(main);

    // Canvas area
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'flex:1;position:relative;min-width:0;';
    main.appendChild(canvasWrap);

    // Side panel
    this._sidePanel = document.createElement('aside');
    this._sidePanel.style.cssText = `
      width: 260px;
      min-width: 220px;
      border-left: 1px solid var(--ink-2);
      padding: var(--gutter);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--gap-lg);
    `;
    main.appendChild(this._sidePanel);

    // Counters strip
    this._countersEl = document.createElement('div');
    this._countersEl.style.cssText = `
      padding: 0.375rem var(--gutter);
      border-top: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-2);
      text-align: right;
    `;
    this.el.appendChild(this._countersEl);

    this._renderSidePanel();

    requestAnimationFrame(() => {
      this._startCanvas(canvasWrap);
    });
  }

  private _buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--gap);
      padding: 0.5rem var(--gutter);
      border-bottom: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
      flex-wrap: wrap;
    `;

    // Back
    const back = new Button({ label: '← Menu', onClick: () => this.app.navigate('MainMenu') });
    back.el.style.marginRight = 'auto';
    bar.appendChild(back.el);

    // Mode toggle
    const modeLabel = document.createElement('span');
    modeLabel.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
    modeLabel.textContent = 'Mode:';
    bar.appendChild(modeLabel);

    const seg = document.createElement('div');
    seg.className = 'seg-control';

    const modes: Array<{ label: string; value: Mode }> = [
      { label: 'Explore', value: 'explore' },
      { label: 'Plan route', value: 'plan' },
    ];

    for (const m of modes) {
      const btn = document.createElement('button');
      btn.className = 'seg-control__btn' + (this._mode === m.value ? ' seg-control__btn--active' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        this._mode = m.value;
        for (const b of seg.querySelectorAll('.seg-control__btn')) {
          b.classList.remove('seg-control__btn--active');
        }
        btn.classList.add('seg-control__btn--active');
        this._clearSelection();
        this._renderSidePanel();
      });
      seg.appendChild(btn);
    }
    bar.appendChild(seg);

    // Preset (only relevant in plan mode)
    const presetLabel = document.createElement('span');
    presetLabel.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
    presetLabel.textContent = 'Preset:';
    bar.appendChild(presetLabel);

    const presetSeg = document.createElement('div');
    presetSeg.className = 'seg-control';
    const presets: PresetName[] = ['Balanced', 'Speed', 'Economy', 'Safety'];
    for (const p of presets) {
      const btn = document.createElement('button');
      btn.className = 'seg-control__btn' + (this._preset === p ? ' seg-control__btn--active' : '');
      btn.textContent = p;
      btn.addEventListener('click', () => {
        this._preset = p;
        for (const b of presetSeg.querySelectorAll('.seg-control__btn')) b.classList.remove('seg-control__btn--active');
        btn.classList.add('seg-control__btn--active');
        if (this._mode === 'plan' && this._selectedVertices.size >= 2) {
          const [start, goal] = [...this._selectedVertices];
          if (start !== undefined && goal !== undefined) this._runPlan(start, goal);
        }
      });
      presetSeg.appendChild(btn);
    }
    bar.appendChild(presetSeg);

    return bar;
  }

  private _clearSelection(): void {
    this._selectedVertices.clear();
    this._reachableVertices.clear();
    this._frontierVertices.clear();
    this._highlightEdges.clear();
    this._secondaryEdges.clear();
    this._stopExplain();
    this._countersEl.textContent = '';
  }

  private _renderSidePanel(): void {
    this._sidePanel.innerHTML = '';

    if (this._mode === 'explore') {
      this._renderExploreSide();
    } else {
      this._renderPlanSide();
    }
  }

  private _renderExploreSide(): void {
    const h = document.createElement('h2');
    h.style.cssText = 'font-size:var(--text-md);margin-bottom:var(--gap);';
    h.textContent = 'Track explorer';
    this._sidePanel.appendChild(h);

    const instr = document.createElement('p');
    instr.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
    instr.textContent = 'Click a vertex to run BFS and show reachable vertices.';
    this._sidePanel.appendChild(instr);

    // Checkpoint rows
    const cpHead = document.createElement('h3');
    cpHead.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);margin-top:var(--gap-lg);text-transform:uppercase;letter-spacing:0.08em;';
    cpHead.textContent = 'Checkpoints';
    this._sidePanel.appendChild(cpHead);

    const cpList = document.createElement('div');
    cpList.setAttribute('role', 'list');
    this._sidePanel.appendChild(cpList);

    const checkpoints = CIRCUIT1_VERTICES.filter((v) => v.type === 'Checkpoint')
      .sort((a, b) => (a.checkpointOrder ?? 0) - (b.checkpointOrder ?? 0));

    for (const cp of checkpoints) {
      const isReach = this._reachableVertices.has(cp.id);
      const tr = new TimingRow({
        position: cp.checkpointOrder ?? 0,
        name: `Vertex ${cp.id}`,
        status: this._selectedVertices.size === 0 ? 'pending' : isReach ? 'reached' : 'unreachable',
      });
      cpList.appendChild(tr.el);
    }

    // DFS info
    if (this._selectedVertices.size > 0) {
      const start = [...this._selectedVertices][0]!;
      const dfsResult = dfs(this._graph, start);
      const cycleInfo = document.createElement('p');
      cycleInfo.style.cssText = 'font-size:var(--text-xs);margin-top:var(--gap);';
      cycleInfo.textContent = dfsResult.hasCycle
        ? '⚠ Cycle detected in graph'
        : 'No cycle from this vertex';
      this._sidePanel.appendChild(cycleInfo);

      const compInfo = document.createElement('p');
      compInfo.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
      compInfo.textContent = `Components: ${dfsResult.components.length}`;
      this._sidePanel.appendChild(compInfo);
    }

    // Explain button
    if (this._explainSteps.length > 0) {
      const explainBtn = new Button({
        label: this._explainPlaying ? 'Pause' : 'Explain BFS',
        onClick: () => this._toggleExplain(explainBtn),
      });
      explainBtn.el.style.marginTop = 'auto';
      this._sidePanel.appendChild(explainBtn.el);
    }
  }

  private _renderPlanSide(): void {
    const h = document.createElement('h2');
    h.style.cssText = 'font-size:var(--text-md);margin-bottom:var(--gap);';
    h.textContent = 'Route planner';
    this._sidePanel.appendChild(h);

    const instr = document.createElement('p');
    instr.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
    instr.textContent = 'Click two vertices to compare routes under different presets.';
    this._sidePanel.appendChild(instr);

    // Show route results if planned
    if (this._selectedVertices.size >= 2) {
      const [startId, goalId] = [...this._selectedVertices];
      if (startId !== undefined && goalId !== undefined) {
        this._renderRouteResults(startId, goalId);
      }
    } else {
      const selInfo = document.createElement('p');
      selInfo.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);margin-top:var(--gap);';
      selInfo.textContent = `${this._selectedVertices.size}/2 vertices selected`;
      this._sidePanel.appendChild(selInfo);
    }
  }

  private _renderRouteResults(startId: number, goalId: number): void {
    // Run Dijkstra for selected preset (primary route)
    const cost = costFn(PRESETS[this._preset], REFS);
    const trace = recordingTrace();
    const result = dijkstra(this._graph, startId, goalId, cost, trace);

    // Run with another preset for comparison (always Balanced as secondary unless that's selected)
    const altPreset: PresetName = this._preset === 'Balanced' ? 'Speed' : 'Balanced';
    const altResult = dijkstra(this._graph, startId, goalId, costFn(PRESETS[altPreset], REFS));

    // Update counters
    this._countersEl.textContent =
      `expanded ${trace.counters.visitedVertices} · relaxed ${trace.counters.relaxedEdges} · heap ops ${trace.counters.heapPushes + trace.counters.heapPops}`;

    if (result.found) {
      this._highlightEdges = new Set(result.edges);
    }
    if (altResult.found) {
      this._secondaryEdges = new Set(altResult.edges);
    }

    // Route comparison list
    const compHead = document.createElement('h3');
    compHead.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);text-transform:uppercase;letter-spacing:0.08em;margin-top:var(--gap);';
    compHead.textContent = 'Routes';
    this._sidePanel.appendChild(compHead);

    const routes: Array<{ label: string; res: typeof result }> = [
      { label: `${this._preset} (primary)`, res: result },
      { label: `${altPreset} (compare)`, res: altResult },
    ];

    for (const { label, res } of routes) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0.375rem 0;
        border-bottom: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
        font-size: var(--text-xs);
      `;
      const nameEl = document.createElement('span');
      nameEl.textContent = label;
      const valEl = document.createElement('span');
      valEl.className = 'mono';
      valEl.textContent = res.found ? res.cost.toFixed(3) : 'No path';
      if (!res.found) valEl.style.color = 'var(--danger)';
      row.append(nameEl, valEl);
      this._sidePanel.appendChild(row);
    }

    if (!result.found) {
      const errEl = document.createElement('p');
      errEl.style.cssText = 'color:var(--danger);font-size:var(--text-xs);margin-top:var(--gap);';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = `No route from vertex ${startId} to vertex ${goalId}. Try unblocking roads or selecting reachable vertices.`;
      this._sidePanel.appendChild(errEl);
    }
  }

  private _runExplore(startId: number): void {
    const trace = recordingTrace();
    const result = bfs(this._graph, startId, undefined, trace);
    this._reachableVertices = result.reachable;
    this._frontierVertices.clear();
    this._explainSteps = trace.steps ?? [];
    this._explainIdx = 0;

    this._countersEl.textContent =
      `visited ${trace.counters.visitedVertices} · examined edges ${trace.counters.examinedEdges}`;

    this._renderSidePanel();
  }

  private _runPlan(_startId: number, _goalId: number): void {
    this._highlightEdges.clear();
    this._secondaryEdges.clear();
    this._renderSidePanel();
  }

  private _onCanvasClick(sx: number, sy: number): void {
    if (!this._canvas) return;
    const { logicalWidth: w, logicalHeight: h, camera } = this._canvas;
    const [wx, wy] = camera.screenToWorld(sx, sy, w, h);

    // Find nearest vertex within snap radius
    let best: Vertex | null = null;
    let bestDist = Infinity;
    const snapWorld = 20 / camera.zoom;

    for (const v of this._graph.allVertices()) {
      const d = Math.hypot(v.x - wx, v.y - wy);
      if (d < snapWorld && d < bestDist) {
        bestDist = d;
        best = v;
      }
    }

    if (!best) return;

    if (this._mode === 'explore') {
      this._clearSelection();
      this._selectedVertices.add(best.id);
      this._runExplore(best.id);
    } else {
      if (this._selectedVertices.size >= 2) {
        this._clearSelection();
      }
      this._selectedVertices.add(best.id);
      if (this._selectedVertices.size === 2) {
        const [startId, goalId] = [...this._selectedVertices];
        if (startId !== undefined && goalId !== undefined) {
          this._runPlan(startId, goalId);
        }
      } else {
        this._renderSidePanel();
      }
    }
  }

  private _toggleExplain(btn: Button): void {
    if (this._explainPlaying) {
      this._stopExplain();
      btn.setLabel('Explain BFS');
    } else {
      this._explainPlaying = true;
      btn.setLabel('Pause');
      this._explainIdx = 0;
      this._frontierVertices.clear();
      this._explainTimer = setInterval(() => {
        if (this._explainIdx >= this._explainSteps.length) {
          this._stopExplain();
          btn.setLabel('Explain BFS');
          return;
        }
        const step = this._explainSteps[this._explainIdx++]!;
        if (step.kind === 'visit') {
          this._frontierVertices.add(step.vertex);
        } else if (step.kind === 'enqueue') {
          this._frontierVertices.add(step.vertex);
        }
      }, 80);
    }
  }

  private _stopExplain(): void {
    this._explainPlaying = false;
    if (this._explainTimer !== null) {
      clearInterval(this._explainTimer);
      this._explainTimer = null;
    }
  }

  private _startCanvas(container: HTMLElement): void {
    this._canvas = new CanvasWrapper(container);
    const renderer = new GraphRenderer(this._canvas);

    // Fit to circuit1 bounds
    const xs = CIRCUIT1_VERTICES.map((v) => v.x);
    const ys = CIRCUIT1_VERTICES.map((v) => v.y);
    this._canvas.camera.fitBounds(
      Math.min(...xs) - 20, Math.min(...ys) - 20,
      Math.max(...xs) + 20, Math.max(...ys) + 20,
      this._canvas.logicalWidth,
      this._canvas.logicalHeight,
    );

    this._stopLoop = this._canvas.startLoop((cv) => {
      cv.clear(tok('--paper'));
      renderer.render(this._graph, {
        highlightEdges: this._highlightEdges,
        secondaryEdges: this._secondaryEdges,
        selectedVertices: this._selectedVertices,
        reachableVertices: this._reachableVertices,
        frontierVertices: this._frontierVertices,
        showGrid: true,
      });
    });

    this._canvas.enablePanZoom();

    // Click handler (after canvas is attached)
    this._canvas.el.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      this._onCanvasClick(e.offsetX, e.offsetY);
    });
  }

  dispose(): void {
    this._stopExplain();
    this._stopLoop?.();
    this._canvas?.dispose();
    this.el.remove();
  }
}


