import type { AppStateMachine } from '../../state/AppState.ts';
import { CanvasWrapper } from '../../render/Canvas.ts';
import { RaceRenderer, tickStartLights, type StartLightsState } from '../../render/RaceRenderer.ts';
import { tok } from '../../render/tokens.ts';
import { RaceEngine, type RaceConfig, type RaceState } from '../../engine/RaceEngine.ts';
import { CIRCUITS } from '../../data/circuits/index.ts';
import { CIRCUIT1_META } from '../../data/circuits/circuit1.ts';
import { costFn, PRESETS, REFS } from '../../core/cost.ts';
import { planCheckpointRoute } from '../../algorithms/route.ts';
import { Button } from '../components/Button.ts';
import { Gauge } from '../components/Gauge.ts';
import { EventIcon } from '../components/EventIcon.ts';
import type { Racer, EventType } from '../../core/types.ts';
import type { Graph } from '../../core/Graph.ts';
import type { GraphRenderOpts } from '../../render/GraphRenderer.ts';
import { RULES } from '../../engine/rules.ts';

/** Build 3 deterministic AI racers to fill the grid. */
function buildRacers(startVertex: number): Racer[] {
  return [
    { id: 1, name: 'Player', isHuman: true, strategyType: 'Human', currentVertex: startVertex, fuel: RULES.MAX_FUEL_TENTHS, nitroCharges: 1, lap: 0, nextCheckpoint: 0, totalTime: 0 },
    { id: 2, name: 'Speeder', isHuman: false, strategyType: 'ShortcutSeeker', currentVertex: startVertex, fuel: RULES.MAX_FUEL_TENTHS, nitroCharges: 1, lap: 0, nextCheckpoint: 0, totalTime: 0 },
    { id: 3, name: 'Eco', isHuman: false, strategyType: 'MinDistance', currentVertex: startVertex, fuel: RULES.MAX_FUEL_TENTHS, nitroCharges: 0, lap: 0, nextCheckpoint: 0, totalTime: 0 },
    { id: 4, name: 'Safe', isHuman: false, strategyType: 'FixedMainRoute', currentVertex: startVertex, fuel: RULES.MAX_FUEL_TENTHS, nitroCharges: 0, lap: 0, nextCheckpoint: 0, totalTime: 0 },
  ];
}

function fmt(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

export class Racing {
  readonly el: HTMLElement;
  private _canvas: CanvasWrapper | null = null;
  private _stopLoop: (() => void) | null = null;
  private _engine: RaceEngine | null = null;
  private _graph: Graph | null = null;
  private _lastState: RaceState | null = null;
  private _accum = 0;
  private readonly _dt = 1 / 60;
  private _raceStarted = false;
  private _startLights: StartLightsState = { phase: 'lights', lightsOn: 0, elapsed: 0 };

  /** Human input façade — methods pending Person A implementation; safe to call regardless. */
  private get _humanEngine(): RaceEngine & { humanActivateNitro?: () => void; humanRefuel?: (a: number) => void; humanSetTargetRoute?: (p: number[]) => void } {
    return this._engine as typeof this._humanEngine;
  }

  // HUD elements
  private _fuelGauge!: Gauge;
  private _lapEl!: HTMLElement;
  private _cpEl!: HTMLElement;
  private _clockEl!: HTMLElement;
  private _nitroEl!: HTMLElement;
  private _positionEl!: HTMLElement;
  private _eventLog!: HTMLElement;
  private _finishedOverlay!: HTMLElement | null;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = document.createElement('div');
    this.el.className = 'screen screen--race plane--dark';
    this.el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    container.appendChild(this.el);
    this._build();
  }

  private _build(): void {
    // Top bar
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--gap);
      padding: 0.375rem var(--gutter);
      border-bottom: 1px solid var(--asphalt-2);
      flex-wrap: wrap;
    `;

    const back = new Button({ label: '← Menu', onClick: () => this.app.navigate('MainMenu') });
    back.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);min-height:36px;';
    topBar.appendChild(back.el);

    // Circuit selector
    const circuitSeg = document.createElement('div');
    circuitSeg.className = 'seg-control';
    for (const circuit of CIRCUITS) {
      const btn = document.createElement('button');
      btn.className = 'seg-control__btn';
      btn.textContent = circuit.meta.name;
      btn.addEventListener('click', () => {
        this._stopRace();
        this._setupRace(circuit.meta.id);
      });
      circuitSeg.appendChild(btn);
    }
    // Mark first active
    const firstBtn = circuitSeg.querySelector('.seg-control__btn');
    firstBtn?.classList.add('seg-control__btn--active');
    topBar.appendChild(circuitSeg);

    // Position indicator
    this._positionEl = document.createElement('span');
    this._positionEl.style.cssText = 'font-family:var(--font-display);font-size:var(--text-md);font-weight:700;color:var(--kerb);margin-left:auto;';
    this._positionEl.textContent = 'P1';
    topBar.appendChild(this._positionEl);

    this.el.appendChild(topBar);

    // Canvas area + side event log
    const main = document.createElement('div');
    main.style.cssText = 'flex:1;display:flex;min-height:0;';
    this.el.appendChild(main);

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'flex:1;position:relative;min-width:0;';
    main.appendChild(canvasWrap);

    this._eventLog = document.createElement('div');
    this._eventLog.style.cssText = `
      width: 200px;
      border-left: 1px solid var(--asphalt-2);
      padding: var(--gap);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--gap-sm);
      font-size: var(--text-xs);
    `;
    const evHead = document.createElement('h3');
    evHead.style.cssText = 'font-size:var(--text-xs);color:var(--kerb);opacity:0.6;text-transform:uppercase;letter-spacing:0.08em;';
    evHead.textContent = 'Events';
    this._eventLog.appendChild(evHead);
    main.appendChild(this._eventLog);

    // HUD strip
    const hud = this._buildHUD();
    this.el.appendChild(hud);

    this._finishedOverlay = null;

    requestAnimationFrame(() => {
      this._canvas = new CanvasWrapper(canvasWrap);
      this._setupRace('circuit1');
      this._startLoop();
    });
  }

  private _buildHUD(): HTMLElement {
    const hud = document.createElement('div');
    hud.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--gap-lg);
      padding: 0.5rem var(--gutter);
      border-top: 1px solid var(--asphalt-2);
      background: var(--asphalt-2);
      flex-wrap: wrap;
      min-height: 52px;
    `;

    // Fuel gauge
    this._fuelGauge = new Gauge('Fuel', 1000, 1000);
    this._fuelGauge.el.style.flex = '1';
    hud.appendChild(this._fuelGauge.el);

    // Nitro
    this._nitroEl = document.createElement('div');
    this._nitroEl.style.cssText = 'display:flex;align-items:center;gap:var(--gap-sm);font-size:var(--text-xs);';
    this._nitroEl.innerHTML = '<span style="color:var(--kerb);opacity:0.6">Nitro</span>';
    hud.appendChild(this._nitroEl);

    // Lap
    this._lapEl = document.createElement('span');
    this._lapEl.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);';
    hud.appendChild(this._lapEl);

    // Checkpoint
    this._cpEl = document.createElement('span');
    this._cpEl.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);';
    hud.appendChild(this._cpEl);

    // Race clock
    this._clockEl = document.createElement('span');
    this._clockEl.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-md);font-weight:700;color:var(--kerb);';
    this._clockEl.textContent = '0:00.00';
    hud.appendChild(this._clockEl);

    // Input controls
    const nitroBtn = new Button({
      label: 'Nitro',
      onClick: () => this._humanEngine.humanActivateNitro?.(),
      ariaLabel: 'Activate nitro',
    });
    nitroBtn.el.style.cssText += 'border-color:var(--signal);color:var(--signal);min-height:36px;padding:0.25rem 0.75rem;';
    hud.appendChild(nitroBtn.el);

    const refuelBtn = new Button({
      label: 'Refuel',
      onClick: () => this._humanEngine.humanRefuel?.(RULES.FUEL_STATION_MAX_PURCHASE_TENTHS),
    });
    refuelBtn.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);min-height:36px;padding:0.25rem 0.75rem;';
    hud.appendChild(refuelBtn.el);

    return hud;
  }

  private _setupRace(circuitId: string): void {
    const circuitDef = CIRCUITS.find((c) => c.meta.id === circuitId);
    if (!circuitDef) return;

    this._graph = circuitDef.build();
    const meta = circuitDef.meta;

    const racers = buildRacers(meta.startVertex);

    const cost = costFn(PRESETS.Balanced, REFS);
    const humanRoute = planCheckpointRoute(
      this._graph,
      meta.startVertex,
      [...meta.checkpointOrder],
      meta.finishVertex,
      cost,
    );

    const config: RaceConfig = {
      startVertex: meta.startVertex,
      finishVertex: meta.finishVertex,
      checkpointOrder: [...meta.checkpointOrder],
      laps: meta.laps,
    };

    this._engine = new RaceEngine(this._graph, racers, config);

    if (humanRoute.found) {
      this._humanEngine.humanSetTargetRoute?.(humanRoute.path);
    }

    this._raceStarted = false;
    this._lastState = null;
    this._accum = 0;
    this._startLights = { phase: 'lights', lightsOn: 0, elapsed: 0 };

    // Fit camera to circuit
    if (this._canvas) {
      const verts = this._graph.allVertices();
      const xs = verts.map((v) => v.x);
      const ys = verts.map((v) => v.y);
      this._canvas.camera.fitBounds(
        Math.min(...xs) - 30, Math.min(...ys) - 30,
        Math.max(...xs) + 30, Math.max(...ys) + 30,
        this._canvas.logicalWidth,
        this._canvas.logicalHeight,
        0.7,
      );
    }

    this._finishedOverlay?.remove();
    this._finishedOverlay = null;
  }

  private _stopRace(): void {
    this._engine = null;
    this._graph = null;
  }

  private _startLoop(): void {
    if (!this._canvas) return;
    let lastTime = performance.now();

    const renderer = new RaceRenderer(this._canvas);

    this._stopLoop = this._canvas.startLoop((_cv) => {
      const now = performance.now();
      const rawDt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
      lastTime = now;

      if (!this._engine || !this._graph) {
        this._canvas?.clear(tok('--asphalt'));
        return;
      }

      // Start lights countdown before engine ticks
      if (!this._raceStarted) {
        this._startLights = tickStartLights(this._startLights, rawDt);
        if (this._startLights.phase === 'go') this._raceStarted = true;
      } else {
        // Fixed-step engine tick
        this._accum += rawDt;
        while (this._accum >= this._dt && !this._engine.finished) {
          this._engine.tick(this._dt);
          this._accum -= this._dt;
        }
        this._lastState = this._engine.state;
      }

      const state = this._lastState ?? this._engine.state;
      const interpolation = this._accum / this._dt;

      // Build graph render opts
      const opts: GraphRenderOpts = { showGrid: false };

      renderer.render(state, this._graph, opts, interpolation,
        this._raceStarted ? undefined : this._startLights);

      this._updateHUD(state);

      if (this._engine.finished && !this._finishedOverlay) {
        this._showFinished();
      }
    });
  }

  private _updateHUD(state: RaceState): void {
    const human = state.racers.find((r) => r.isHuman);
    if (!human) return;

    this._fuelGauge.setValue(human.fuelTenths, RULES.MAX_FUEL_TENTHS);
    this._clockEl.textContent = fmt(state.clock);

    const totalLaps = this._engine?.state ? 2 : 2; // engine config not publicly exposed; default 2
    this._lapEl.textContent = `Lap ${human.lap + 1}/${totalLaps}`;

    const totalCp = CIRCUIT1_META.checkpointOrder.length;
    this._cpEl.textContent = `CP ${human.checkpointProgress}/${totalCp}`;

    // Nitro charges (dots)
    this._nitroEl.innerHTML = `<span style="color:var(--kerb);opacity:0.6;font-size:var(--text-xs)">Nitro</span>`;
    for (let i = 0; i < RULES.MAX_NITRO; i++) {
      const dot = document.createElement('span');
      dot.style.cssText = `
        display:inline-block;width:10px;height:10px;border-radius:1px;
        background:${i < human.nitro ? 'var(--signal)' : 'var(--asphalt-2)'};
        border:1px solid var(--kerb);
      `;
      this._nitroEl.appendChild(dot);
    }

    // Position
    const sorted = [...state.racers].sort((a, b) => b.checkpointProgress - a.checkpointProgress || a.totalTime - b.totalTime);
    const pos = sorted.findIndex((r) => r.isHuman) + 1;
    this._positionEl.textContent = `P${pos}`;
    this._positionEl.style.color = pos === 1 ? 'var(--sector-pb)' : 'var(--kerb)';
  }

  /** Add an event to the scrolling event log — called when the engine fires an event. */
  logEvent(type: EventType, description: string): void {
    const icon = new EventIcon(type, description);
    icon.el.style.cssText += 'flex-shrink:0;';
    this._eventLog.appendChild(icon.el);
    // Keep last 20
    const kids = this._eventLog.children;
    while (kids.length > 21) kids[1]?.remove();
    this._eventLog.scrollTop = this._eventLog.scrollHeight;
  }

  private _showFinished(): void {
    if (!this._engine || !this._canvas) return;
    const results = this._engine.results();
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--asphalt) 90%, transparent);
    `;

    const title = document.createElement('h2');
    title.style.cssText = 'font-family:var(--font-display);font-size:var(--text-2xl);color:var(--kerb);margin-bottom:1rem;';
    title.textContent = 'Race finished';
    overlay.appendChild(title);

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;min-width:280px;';
    const head = document.createElement('tr');
    head.innerHTML = `<th style="text-align:left;padding:0.25rem 0.5rem;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--kerb);opacity:0.6;">Pos</th>
      <th style="text-align:left;padding:0.25rem 0.5rem;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--kerb);opacity:0.6;">Name</th>
      <th style="text-align:right;padding:0.25rem 0.5rem;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--kerb);opacity:0.6;">Time</th>`;
    table.appendChild(head);

    const racerNames: Record<number, string> = { 1: 'Player', 2: 'Speeder', 3: 'Eco', 4: 'Safe' };
    for (const r of results) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:0.375rem 0.5rem;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--kerb);">${r.finishPosition}</td>
        <td style="padding:0.375rem 0.5rem;font-size:var(--text-sm);color:var(--kerb);">${racerNames[r.racerId] ?? `Racer ${r.racerId}`}</td>
        <td style="padding:0.375rem 0.5rem;font-family:var(--font-mono);font-size:var(--text-xs);text-align:right;color:var(--kerb);">${fmt(r.finishTime)}</td>`;
      table.appendChild(tr);
    }
    overlay.appendChild(table);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:var(--gap);margin-top:1.5rem;';

    const retryBtn = new Button({ label: 'Race again', onClick: () => { overlay.remove(); this._setupRace('circuit1'); }, variant: 'primary' });
    const menuBtn = new Button({ label: 'Menu', onClick: () => this.app.navigate('MainMenu') });
    menuBtn.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);';
    const dashBtn = new Button({ label: 'Dashboard', onClick: () => this.app.navigate('Dashboard') });
    dashBtn.el.style.cssText += 'border-color:var(--kerb);color:var(--kerb);';

    actions.append(retryBtn.el, menuBtn.el, dashBtn.el);
    overlay.appendChild(actions);

    this._canvas.el.parentElement?.appendChild(overlay);
    this._finishedOverlay = overlay;
  }

  dispose(): void {
    this._stopLoop?.();
    this._canvas?.dispose();
    this.el.remove();
  }
}
