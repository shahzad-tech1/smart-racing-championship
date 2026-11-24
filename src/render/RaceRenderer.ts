import type { RaceState, RacerSnapshot } from '../engine/RaceEngine.ts';
import type { Graph } from '../core/Graph.ts';
import type { Vertex } from '../core/types.ts';
import type { CanvasWrapper } from './Canvas.ts';
import { GraphRenderer, type GraphRenderOpts } from './GraphRenderer.ts';
import { tok } from './tokens.ts';

/** Categorical palette for opponent cars — read CSS token at render time (no raw hex). */
function opponentColour(idx: number): string {
  const vars = ['--chart-1', '--chart-3', '--chart-4', '--chart-5'] as const;
  return tok(vars[idx % vars.length] ?? '--chart-1');
}

/** Interpolate between two snapshots by progress fraction [0,1]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface CarPosition {
  id: number;
  name: string;
  isHuman: boolean;
  x: number;
  y: number;
}

/** Compute world-space (x,y) for a racer from the engine state and graph geometry. */
function racerWorldPos(snap: RacerSnapshot, graph: Graph): { x: number; y: number } {
  if (snap.edgeId === null) {
    try {
      const v = graph.getVertex(snap.currentVertex);
      return { x: v.x, y: v.y };
    } catch { return { x: 0, y: 0 }; }
  }

  let edge;
  try { edge = graph.getEdge(snap.edgeId); } catch { return { x: 0, y: 0 }; }

  let fromV: Vertex, toV: Vertex;
  try {
    fromV = graph.getVertex(edge.from);
    toV = graph.getVertex(edge.to);
  } catch { return { x: 0, y: 0 }; }

  return {
    x: lerp(fromV.x, toV.x, snap.progress),
    y: lerp(fromV.y, toV.y, snap.progress),
  };
}

/** Start-lights data for the race intro sequence. */
export interface StartLightsState {
  phase: 'lights' | 'go' | 'done';
  lightsOn: number; // 0-5
  elapsed: number;
}

export function tickStartLights(state: StartLightsState, dt: number): StartLightsState {
  const next = { ...state, elapsed: state.elapsed + dt };
  if (next.phase === 'lights') {
    // One light per 0.6s, then GO at 3s, done after 4s
    next.lightsOn = Math.min(5, Math.floor(next.elapsed / 0.6));
    if (next.elapsed >= 3) next.phase = 'go';
  } else if (next.phase === 'go') {
    if (next.elapsed >= 4) next.phase = 'done';
  }
  return next;
}

export class RaceRenderer {
  private readonly _graphRenderer: GraphRenderer;
  private _prevPositions: Map<number, { x: number; y: number }> = new Map();
  private _trails: Map<number, Array<{ x: number; y: number }>> = new Map();

  constructor(private readonly canvas: CanvasWrapper) {
    this._graphRenderer = new GraphRenderer(canvas);
  }

  render(
    state: RaceState,
    graph: Graph,
    graphOpts: GraphRenderOpts,
    interpolation: number,
    startLights?: StartLightsState,
  ): void {
    const { ctx, logicalWidth: w, logicalHeight: h, camera } = this.canvas;
    this.canvas.clear(tok('--asphalt'));

    this._graphRenderer.render(graph, graphOpts);

    const positions: CarPosition[] = [];
    let humanPos: { x: number; y: number } | null = null;
    let opponentIdx = 0;

    for (const snap of state.racers) {
      const cur = racerWorldPos(snap, graph);
      const prev = this._prevPositions.get(snap.id) ?? cur;
      const ix = lerp(prev.x, cur.x, interpolation);
      const iy = lerp(prev.y, cur.y, interpolation);

      positions.push({ id: snap.id, name: snap.name, isHuman: snap.isHuman, x: ix, y: iy });

      // Update trails
      let trail = this._trails.get(snap.id);
      if (!trail) { trail = []; this._trails.set(snap.id, trail); }
      trail.push({ x: ix, y: iy });
      const maxTrail = 90; // ~1.5s at 60fps
      if (trail.length > maxTrail) trail.splice(0, trail.length - maxTrail);

      if (snap.isHuman) humanPos = { x: ix, y: iy };
      else opponentIdx++;
    }

    this._prevPositions.clear();
    for (const snap of state.racers) {
      this._prevPositions.set(snap.id, racerWorldPos(snap, graph));
    }

    // Follow human car
    if (humanPos) {
      camera.cx = lerp(camera.cx, humanPos.x, 0.05);
      camera.cy = lerp(camera.cy, humanPos.y, 0.05);
    }

    // Draw trails
    opponentIdx = 0;
    for (const snap of state.racers) {
      const trail = this._trails.get(snap.id);
      if (!trail || trail.length < 2) { if (!snap.isHuman) opponentIdx++; continue; }
      const color = snap.isHuman ? tok('--signal') : opponentColour(opponentIdx);
      this._drawTrail(ctx, trail, color, w, h);
      if (!snap.isHuman) opponentIdx++;
    }

    // Draw cars
    opponentIdx = 0;
    for (const pos of positions) {
      const color = pos.isHuman ? tok('--signal') : opponentColour(opponentIdx);
      this._drawCar(ctx, pos, color, w, h);
      if (!pos.isHuman) opponentIdx++;
    }

    // Start lights overlay
    if (startLights && startLights.phase !== 'done') {
      this._drawStartLights(ctx, startLights, w, h);
    }
  }

  private _drawTrail(
    ctx: CanvasRenderingContext2D,
    trail: Array<{ x: number; y: number }>,
    color: string,
    w: number,
    h: number,
  ): void {
    const { camera } = this.canvas;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const pt = trail[i]!;
      const [sx, sy] = camera.worldToScreen(pt.x, pt.y, w, h);
      const alpha = i / trail.length;
      if (i === 0) {
        ctx.globalAlpha = 0;
        ctx.moveTo(sx, sy);
      } else {
        ctx.globalAlpha = alpha * 0.5;
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private _drawCar(
    ctx: CanvasRenderingContext2D,
    pos: CarPosition,
    color: string,
    w: number,
    h: number,
  ): void {
    const { camera } = this.canvas;
    const [sx, sy] = camera.worldToScreen(pos.x, pos.y, w, h);

    ctx.save();
    ctx.translate(sx, sy);

    // Car body (small solid rectangle)
    ctx.fillStyle = color;
    ctx.strokeStyle = tok('--asphalt');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-6, -4, 12, 8, 1);
    ctx.fill();
    ctx.stroke();

    // Number plate
    ctx.fillStyle = tok('--asphalt');
    ctx.font = `bold 7px ${tok('--font-mono')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(pos.id), 0, 0);

    ctx.restore();
  }

  private _drawStartLights(
    ctx: CanvasRenderingContext2D,
    lights: StartLightsState,
    w: number,
    _h: number,
  ): void {
    const preferReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    ctx.save();
    const panelW = 180;
    const panelH = 60;
    const px = (w - panelW) / 2;
    const py = 24;

    ctx.fillStyle = tok('--asphalt-2');
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = tok('--kerb');
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, panelW, panelH);

    if (lights.phase === 'go' || preferReduced) {
      ctx.fillStyle = tok('--sector-pb');
      ctx.font = `700 28px ${tok('--font-display')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(preferReduced ? 'Go' : 'Go!', w / 2, py + panelH / 2);
    } else {
      const r = 10;
      const spacing = (panelW - 20) / 5;
      for (let i = 0; i < 5; i++) {
        const lx = px + 10 + spacing * i + spacing / 2;
        const ly = py + panelH / 2;
        ctx.beginPath();
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
        if (i < lights.lightsOn) {
          ctx.fillStyle = tok('--danger');
        } else {
          ctx.fillStyle = tok('--asphalt');
          ctx.strokeStyle = tok('--kerb');
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
