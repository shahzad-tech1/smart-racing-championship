import type { AppStateMachine } from '../../state/AppState.ts';
import { CanvasWrapper } from '../../render/Canvas.ts';
import { GraphRenderer } from '../../render/GraphRenderer.ts';
import { tok } from '../../render/tokens.ts';
import { Button } from '../components/Button.ts';
import { StatTile } from '../components/StatTile.ts';
import { buildCircuit1, CIRCUIT1_VERTICES, CIRCUIT1_META } from '../../data/circuits/circuit1.ts';
import { bfs } from '../../algorithms/bfs.ts';
import { dfs } from '../../algorithms/dfs.ts';
import { dijkstra } from '../../algorithms/dijkstra.ts';
import { aStar } from '../../algorithms/astar.ts';
import { knapsack01 } from '../../algorithms/knapsack.ts';
import { mergeSort } from '../../algorithms/sort.ts';
import { recordingTrace, type AlgoStep, type AlgoTrace } from '../../core/instrumentation.ts';
import { costFn, PRESETS, REFS } from '../../core/cost.ts';
import type { Graph } from '../../core/Graph.ts';

type AlgoName = 'BFS' | 'DFS' | 'Dijkstra' | 'A*' | 'Knapsack' | 'MergeSort';

interface AlgoRun {
  name: AlgoName;
  steps: AlgoStep[];
  counters: AlgoTrace['counters'];
  summary: string;
}

export class AlgorithmLab {
  readonly el: HTMLElement;
  private _canvas: CanvasWrapper | null = null;
  private _stopLoop: (() => void) | null = null;
  private _graph: Graph;
  private _run: AlgoRun | null = null;
  private _stepIdx = 0;
  private _playing = false;
  private _playTimer: ReturnType<typeof setInterval> | null = null;
  private _speed = 200; // ms per step

  // Highlighted vertices/edges from current step
  private _frontier = new Set<number>();
  private _visited = new Set<number>();
  private _highlight = new Set<number>();

  // UI refs
  private _stepLog!: HTMLElement;
  private _countersEl!: HTMLElement;
  private _summaryEl!: HTMLElement;
  private _playBtn!: Button;
  private _stepBtn!: Button;
  private _tiles: StatTile[] = [];

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this._graph = buildCircuit1();
    this.el = document.createElement('div');
    this.el.className = 'screen screen--lab plane--dark';
    this.el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--asphalt);color:var(--kerb);';
    container.appendChild(this.el);
    this._build();
  }

  private _build(): void {
    // Header
    const header = this._buildHeader();
    this.el.appendChild(header);

    // 3-column layout: step log | canvas | counters
    const main = document.createElement('div');
    main.style.cssText = 'flex:1;display:flex;min-height:0;';
    this.el.appendChild(main);

    // Step log (left)
    const logWrap = document.createElement('div');
    logWrap.style.cssText = `
      width: 220px;
      border-right: 1px solid var(--asphalt-2);
      display: flex;
      flex-direction: column;
    `;
    const logHead = document.createElement('h3');
    logHead.style.cssText = 'font-size:var(--text-xs);padding:var(--gap) var(--gap-lg);color:var(--kerb);opacity:0.6;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid var(--asphalt-2);';
    logHead.textContent = 'Step log';
    this._stepLog = document.createElement('div');
    this._stepLog.style.cssText = 'flex:1;overflow-y:auto;padding:var(--gap);font-family:var(--font-mono);font-size:var(--text-xs);';
    logWrap.append(logHead, this._stepLog);
    main.appendChild(logWrap);

    // Canvas (centre)
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'flex:1;position:relative;min-width:0;';
    main.appendChild(canvasWrap);

    // Counters (right)
    const countersWrap = document.createElement('div');
    countersWrap.style.cssText = `
      width: 200px;
      border-left: 1px solid var(--asphalt-2);
      padding: var(--gutter);
      display: flex;
      flex-direction: column;
      gap: var(--gap-lg);
      overflow-y: auto;
    `;
    const countersHead = document.createElement('h3');
    countersHead.style.cssText = 'font-size:var(--text-xs);color:var(--kerb);opacity:0.6;text-transform:uppercase;letter-spacing:0.08em;';
    countersHead.textContent = 'Counters';
    this._countersEl = document.createElement('div');
    this._countersEl.style.cssText = 'display:flex;flex-direction:column;gap:var(--gap);';
    countersWrap.append(countersHead, this._countersEl);

    this._summaryEl = document.createElement('p');
    this._summaryEl.style.cssText = 'font-size:var(--text-xs);color:var(--kerb);opacity:0.7;margin-top:auto;';
    countersWrap.appendChild(this._summaryEl);

    main.appendChild(countersWrap);

    this._buildCounterTiles();

    // Control bar
    const controls = this._buildControls();
    this.el.appendChild(controls);

    requestAnimationFrame(() => {
      this._startCanvas(canvasWrap);
    });
  }

  private _buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--gap);
      padding: 0.5rem var(--gutter);
      border-bottom: 1px solid var(--asphalt-2);
      flex-wrap: wrap;
    `;

    const back = new Button({ label: '← Menu', onClick: () => this.app.navigate('MainMenu') });
    back.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);min-height:36px;';
    header.appendChild(back.el);

    const title = document.createElement('h1');
    title.style.cssText = 'font-size:var(--text-lg);font-family:var(--font-display);';
    title.textContent = 'Algorithm lab';
    header.appendChild(title);

    // Algorithm selector
    const algos: AlgoName[] = ['BFS', 'DFS', 'Dijkstra', 'A*', 'Knapsack', 'MergeSort'];
    const seg = document.createElement('div');
    seg.className = 'seg-control';
    seg.style.marginLeft = 'auto';

    for (const name of algos) {
      const btn = document.createElement('button');
      btn.className = 'seg-control__btn';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        this._runAlgo(name);
        for (const b of seg.querySelectorAll('.seg-control__btn')) b.classList.remove('seg-control__btn--active');
        btn.classList.add('seg-control__btn--active');
      });
      seg.appendChild(btn);
    }
    header.appendChild(seg);

    return header;
  }

  private _buildControls(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--gap);
      padding: 0.5rem var(--gutter);
      border-top: 1px solid var(--asphalt-2);
      background: var(--asphalt-2);
    `;

    this._playBtn = new Button({
      label: 'Play',
      onClick: () => this._togglePlay(),
    });
    this._playBtn.el.style.cssText += 'border-color:var(--signal);color:var(--signal);min-height:36px;';

    this._stepBtn = new Button({
      label: 'Step',
      onClick: () => this._stepOnce(),
    });
    this._stepBtn.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);min-height:36px;';

    const resetBtn = new Button({
      label: 'Reset',
      onClick: () => this._resetPlayback(),
    });
    resetBtn.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);min-height:36px;';

    // Speed control
    const speedLabel = document.createElement('span');
    speedLabel.style.cssText = 'font-size:var(--text-xs);color:var(--kerb);opacity:0.6;margin-left:auto;';
    speedLabel.textContent = 'Speed:';

    const speedSeg = document.createElement('div');
    speedSeg.className = 'seg-control';
    const speeds = [
      { label: 'Slow', value: 400 },
      { label: 'Normal', value: 200 },
      { label: 'Fast', value: 60 },
    ];
    for (const s of speeds) {
      const btn = document.createElement('button');
      btn.className = 'seg-control__btn' + (s.value === this._speed ? ' seg-control__btn--active' : '');
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        this._speed = s.value;
        for (const b of speedSeg.querySelectorAll('.seg-control__btn')) b.classList.remove('seg-control__btn--active');
        btn.classList.add('seg-control__btn--active');
        if (this._playing) {
          this._stopPlay();
          this._startPlay();
        }
      });
      speedSeg.appendChild(btn);
    }

    bar.append(this._playBtn.el, this._stepBtn.el, resetBtn.el, speedLabel, speedSeg);
    return bar;
  }

  private _buildCounterTiles(): void {
    const counters = ['Visited', 'Examined', 'Relaxed', 'Heap pushes', 'Heap pops', 'Comparisons', 'DP states'];
    this._tiles = counters.map((name) => {
      const tile = new StatTile(name, '—');
      tile.el.style.cssText = `
        font-size: var(--text-xs);
        gap: 0.125rem;
      `;
      (tile.el.querySelector('.stat-tile__label') as HTMLElement | null)?.setAttribute('style', 'font-size:var(--text-xs);color:var(--kerb);opacity:0.6;');
      (tile.el.querySelector('.stat-tile__value') as HTMLElement | null)?.setAttribute('style', 'font-family:var(--font-mono);font-size:var(--text-md);color:var(--kerb);');
      this._countersEl.appendChild(tile.el);
      return tile;
    });
  }

  private _runAlgo(name: AlgoName): void {
    this._stopPlay();
    this._frontier.clear();
    this._visited.clear();
    this._highlight.clear();

    const trace = recordingTrace();
    let summary = '';

    try {
      switch (name) {
        case 'BFS': {
          const result = bfs(this._graph, CIRCUIT1_META.startVertex, CIRCUIT1_META.finishVertex, trace);
          summary = result.found ? `Path found: ${result.path.length} vertices, ${result.edgeCount} edges` : 'No path found';
          break;
        }
        case 'DFS': {
          const result = dfs(this._graph, CIRCUIT1_META.startVertex, trace);
          summary = `${result.order.length} vertices visited, ${result.components.length} component(s), ${result.hasCycle ? 'cycle detected' : 'no cycle'}`;
          break;
        }
        case 'Dijkstra': {
          const cost = costFn(PRESETS.Balanced, REFS);
          const result = dijkstra(this._graph, CIRCUIT1_META.startVertex, CIRCUIT1_META.finishVertex, cost, trace);
          summary = result.found ? `Cost: ${result.cost.toFixed(3)}, path: ${result.path.length} vertices` : 'No path found';
          break;
        }
        case 'A*': {
          const cost = costFn(PRESETS.Balanced, REFS);
          const heuristic = (_vId: number, _goalId: number) => {
            try {
              const v = this._graph.getVertex(_vId);
              const g = this._graph.getVertex(_goalId);
              return Math.hypot(g.x - v.x, g.y - v.y) * 0.001;
            } catch { return 0; }
          };
          const result = aStar(this._graph, CIRCUIT1_META.startVertex, CIRCUIT1_META.finishVertex, cost, heuristic, trace);
          summary = result.found ? `Cost: ${result.cost.toFixed(3)}, expanded: ${trace.counters.visitedVertices} vertices` : 'No path found';
          break;
        }
        case 'Knapsack': {
          const items = CIRCUIT1_VERTICES.filter((v) => v.type === 'Checkpoint').map((v) => ({
            id: v.id,
            cost: v.checkpointOrder ?? 1,
            benefit: 10 - (v.checkpointOrder ?? 5),
          }));
          const result = knapsack01(items, 20, trace);
          summary = `Budget 20, selected ${result.selected.length} items, benefit ${result.value}`;
          break;
        }
        case 'MergeSort': {
          const data = [...CIRCUIT1_VERTICES].map((v) => v.id);
          mergeSort(data, (a, b) => a - b, trace);
          summary = `Sorted ${data.length} elements`;
          break;
        }
        default:
          name satisfies never;
      }
    } catch (err) {
      summary = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    this._run = { name, steps: trace.steps ?? [], counters: trace.counters, summary };
    this._stepIdx = 0;
    this._summaryEl.textContent = summary;
    this._updateCounters(trace.counters);
    this._stepLog.innerHTML = '';
    this._renderStepLog();
  }

  private _resetPlayback(): void {
    this._stopPlay();
    if (!this._run) return;
    this._stepIdx = 0;
    this._frontier.clear();
    this._visited.clear();
    this._highlight.clear();
    this._stepLog.innerHTML = '';
    this._updateCounters(this._run.counters);
  }

  private _stepOnce(): void {
    if (!this._run) return;
    if (this._stepIdx >= this._run.steps.length) return;
    this._applyStep(this._run.steps[this._stepIdx++]!);
    this._scrollStepLog();
  }

  private _togglePlay(): void {
    if (this._playing) {
      this._stopPlay();
    } else {
      this._startPlay();
    }
  }

  private _startPlay(): void {
    if (!this._run || this._stepIdx >= this._run.steps.length) return;
    this._playing = true;
    this._playBtn.setLabel('Pause');
    this._playTimer = setInterval(() => {
      if (!this._run || this._stepIdx >= this._run.steps.length) {
        this._stopPlay();
        return;
      }
      this._applyStep(this._run.steps[this._stepIdx++]!);
      this._scrollStepLog();
    }, this._speed);
  }

  private _stopPlay(): void {
    this._playing = false;
    this._playBtn.setLabel('Play');
    if (this._playTimer !== null) {
      clearInterval(this._playTimer);
      this._playTimer = null;
    }
  }

  private _applyStep(step: AlgoStep): void {
    // Update visualisation state
    switch (step.kind) {
      case 'visit':
        this._visited.add(step.vertex);
        this._frontier.delete(step.vertex);
        break;
      case 'enqueue':
        this._frontier.add(step.vertex);
        break;
      case 'relax':
        this._highlight.add(step.edge);
        break;
      default:
        break;
    }

    // Add log entry
    const entry = document.createElement('div');
    entry.style.cssText = `
      padding: 0.125rem 0.25rem;
      font-size: 0.75rem;
      border-left: 2px solid transparent;
      color: var(--kerb);
      opacity: 0.7;
    `;
    entry.style.borderLeftColor = 'var(--signal)';
    entry.style.opacity = '1';

    const stepDesc = this._describeStep(step);
    entry.textContent = `${this._stepIdx}. ${stepDesc}`;
    entry.dataset['step'] = String(this._stepIdx - 1);
    this._stepLog.appendChild(entry);

    // Fade all but current
    for (const el of this._stepLog.children) {
      (el as HTMLElement).style.opacity = '0.5';
      (el as HTMLElement).style.borderLeftColor = 'transparent';
    }
    entry.style.opacity = '1';
    entry.style.borderLeftColor = 'var(--signal)';
  }

  private _describeStep(step: AlgoStep): string {
    switch (step.kind) {
      case 'visit': return `Visit v${step.vertex}`;
      case 'enqueue': return `Enqueue v${step.vertex}`;
      case 'relax': return `Relax e${step.edge} (${step.improved ? 'improved' : 'no change'})`;
      case 'frontier': return `Frontier: [${step.vertices.join(',')}]`;
      case 'pathFound': return `Path found (cost ${step.cost.toFixed(3)})`;
      case 'compare': return `Compare [${step.i}] vs [${step.j}]`;
      case 'swap': return `Swap [${step.i}] ↔ [${step.j}]`;
      case 'dpCell': return `dp[${step.i}][${step.b}] = ${step.value}`;
    }
  }

  private _renderStepLog(): void {
    if (!this._run) {
      this._stepLog.textContent = 'Select an algorithm above to begin.';
    }
  }

  private _scrollStepLog(): void {
    this._stepLog.scrollTop = this._stepLog.scrollHeight;
  }

  private _updateCounters(counters: AlgoTrace['counters']): void {
    const vals = [
      counters.visitedVertices,
      counters.examinedEdges,
      counters.relaxedEdges,
      counters.heapPushes,
      counters.heapPops,
      counters.comparisons,
      counters.dpStatesComputed,
    ];
    this._tiles.forEach((tile, i) => {
      tile.setValue(String(vals[i] ?? 0));
    });
  }

  private _startCanvas(container: HTMLElement): void {
    this._canvas = new CanvasWrapper(container);
    const renderer = new GraphRenderer(this._canvas);

    const xs = CIRCUIT1_VERTICES.map((v) => v.x);
    const ys = CIRCUIT1_VERTICES.map((v) => v.y);
    this._canvas.camera.fitBounds(
      Math.min(...xs) - 20, Math.min(...ys) - 20,
      Math.max(...xs) + 20, Math.max(...ys) + 20,
      this._canvas.logicalWidth,
      this._canvas.logicalHeight,
    );

    this._stopLoop = this._canvas.startLoop((cv) => {
      cv.clear(tok('--asphalt'));
      renderer.render(this._graph, {
        highlightEdges: this._highlight,
        reachableVertices: this._visited,
        frontierVertices: this._frontier,
        showGrid: true,
      });
    });

    this._canvas.enablePanZoom();

    // Initial prompt
    this._stepLog.textContent = 'Select an algorithm above to begin.';
  }

  dispose(): void {
    this._stopPlay();
    this._stopLoop?.();
    this._canvas?.dispose();
    this.el.remove();
  }
}
