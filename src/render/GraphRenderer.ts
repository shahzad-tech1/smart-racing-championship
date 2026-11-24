import type { Graph } from '../core/Graph.ts';
import type { Vertex, Edge, EdgeStatus } from '../core/types.ts';
import type { CanvasWrapper } from './Canvas.ts';
import { tok } from './tokens.ts';

export interface GraphRenderOpts {
  /** Edge ids to highlight in the signal colour. */
  highlightEdges?: Set<number>;
  /** Edge ids for the secondary route (shown in ink-2). */
  secondaryEdges?: Set<number>;
  /** Vertex ids to mark as selected. */
  selectedVertices?: Set<number>;
  /** Vertex ids reachable from selection (BFS result). */
  reachableVertices?: Set<number>;
  /** Vertex ids that are frontier (animating BFS wave). */
  frontierVertices?: Set<number>;
  /** Edge ids to mark as blocked (danger stripe). */
  blockedEdgeOverride?: Set<number>;
  /** Show the faint grid. */
  showGrid?: boolean;
}

/** Edge width based on status/difficulty. */
function edgeWidth(e: Edge): number {
  if (e.isShortcut) return 2;
  if (e.status === 'Blocked') return 2;
  return 4 - Math.floor(e.difficulty / 3); // 4 or 3
}

/** Edge colour: blocked = danger, restricted = warn, shortcut = dimmed, else ink. */
function edgeColour(e: Edge, opts: GraphRenderOpts): string {
  if (opts.blockedEdgeOverride?.has(e.id) || e.status === 'Blocked') return tok('--danger');
  if (e.status === 'Restricted') return tok('--sector-slow');
  if (opts.highlightEdges?.has(e.id)) return tok('--signal');
  if (opts.secondaryEdges?.has(e.id)) return tok('--ink-2');
  if (e.isShortcut) return tok('--ink-2');
  return tok('--ink');
}

/** Vertex icon: a shape encoding the type. */
function drawVertexIcon(
  ctx: CanvasRenderingContext2D,
  v: Vertex,
  sx: number,
  sy: number,
  selected: boolean,
  reachable: boolean,
  frontier: boolean,
): void {
  const r = 8;
  ctx.save();
  ctx.translate(sx, sy);

  // Fill colour by type
  if (selected) {
    ctx.fillStyle = tok('--signal');
  } else if (frontier) {
    ctx.fillStyle = tok('--signal');
    ctx.globalAlpha = 0.6;
  } else if (reachable) {
    ctx.fillStyle = tok('--sector-pb');
    ctx.globalAlpha = 0.7;
  } else {
    ctx.fillStyle = tok('--paper');
  }

  ctx.strokeStyle = tok('--ink');
  ctx.lineWidth = 1.5;

  switch (v.type) {
    case 'Start':
    case 'Finish': {
      // Rounded square
      ctx.beginPath();
      ctx.roundRect(-r, -r, r * 2, r * 2, 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'Checkpoint': {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'FuelStation': {
      // Hexagon
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'NitroPickup': {
      // Triangle (upward)
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.87, r * 0.5);
      ctx.lineTo(-r * 0.87, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'DeadEnd': {
      // X mark
      ctx.fillStyle = tok('--ink-2');
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tok('--danger');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.4);
      ctx.lineTo(r * 0.4, r * 0.4);
      ctx.moveTo(r * 0.4, -r * 0.4);
      ctx.lineTo(-r * 0.4, r * 0.4);
      ctx.stroke();
      break;
    }
    default: {
      // Circle for Intersection and fallback
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  v: Vertex,
  sx: number,
  sy: number,
): void {
  const labels: Record<string, string> = {
    Start: 'S',
    Finish: 'F',
    FuelStation: '⛽',
    NitroPickup: 'N',
    DeadEnd: '—',
  };

  const text = v.type === 'Checkpoint' && v.checkpointOrder !== null
    ? String(v.checkpointOrder)
    : (labels[v.type] ?? '');

  if (!text) return;

  ctx.save();
  ctx.font = `600 9px ${tok('--font-display')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tok('--ink');
  ctx.fillText(text, sx, sy);
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: { worldToScreen: (wx: number, wy: number, sw: number, sh: number) => [number, number] },
): void {
  const gridSize = 40;
  const inkBase = tok('--ink');

  ctx.save();
  ctx.strokeStyle = inkBase;
  ctx.globalAlpha = 0.06;
  ctx.lineWidth = 0.5;

  // Horizontal lines (only draw visible ones — transform origin to find range)
  for (let y = 0; y < 2000; y += gridSize) {
    const [sx0, sy0] = camera.worldToScreen(0, y, w, h);
    const [sx1] = camera.worldToScreen(2000, y, w, h);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.lineTo(sx1, sy0);
    ctx.stroke();
  }

  for (let x = 0; x < 2000; x += gridSize) {
    const [sx, sy0] = camera.worldToScreen(x, 0, w, h);
    const [, sy1] = camera.worldToScreen(x, 2000, w, h);
    ctx.beginPath();
    ctx.moveTo(sx, sy0);
    ctx.lineTo(sx, sy1);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBlockedStripes(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
): void {
  ctx.save();
  ctx.strokeStyle = tok('--danger');
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Draw a graph (vertices + edges) onto the given canvas using the camera. */
export class GraphRenderer {
  constructor(private readonly canvas: CanvasWrapper) {}

  render(graph: Graph, opts: GraphRenderOpts = {}): void {
    const { ctx, logicalWidth: w, logicalHeight: h, camera } = this.canvas;

    if (opts.showGrid !== false) drawGrid(ctx, w, h, camera);

    // Draw edges
    for (const edge of graph.allEdges()) {
      this.drawEdge(ctx, edge, graph, w, h, opts);
    }

    // Draw vertices on top
    for (const v of graph.allVertices()) {
      const [sx, sy] = camera.worldToScreen(v.x, v.y, w, h);
      const sel = opts.selectedVertices?.has(v.id) ?? false;
      const reach = opts.reachableVertices?.has(v.id) ?? false;
      const front = opts.frontierVertices?.has(v.id) ?? false;
      drawVertexIcon(ctx, v, sx, sy, sel, reach, front);
      drawLabel(ctx, v, sx, sy);
    }
  }

  private drawEdge(
    ctx: CanvasRenderingContext2D,
    edge: Edge,
    graph: Graph,
    w: number,
    h: number,
    opts: GraphRenderOpts,
  ): void {
    const { camera } = this.canvas;
    let vFrom: Vertex;
    let vTo: Vertex;
    try {
      vFrom = graph.getVertex(edge.from);
      vTo = graph.getVertex(edge.to);
    } catch {
      return;
    }

    const [x1, y1] = camera.worldToScreen(vFrom.x, vFrom.y, w, h);
    const [x2, y2] = camera.worldToScreen(vTo.x, vTo.y, w, h);

    if (opts.blockedEdgeOverride?.has(edge.id) || edge.status === 'Blocked') {
      drawBlockedStripes(ctx, x1, y1, x2, y2);
      return;
    }

    const color = edgeColour(edge, opts);
    const lw = edgeWidth(edge) * (this.canvas.camera.zoom > 1 ? 1 : this.canvas.camera.zoom);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, lw);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (edge.isShortcut) {
      ctx.setLineDash([6, 3]);
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (edge.directed) {
      // Draw arrow at midpoint
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const aLen = 6;
      ctx.beginPath();
      ctx.moveTo(mx + aLen * Math.cos(angle - 2.5), my + aLen * Math.sin(angle - 2.5));
      ctx.lineTo(mx, my);
      ctx.lineTo(mx + aLen * Math.cos(angle + 2.5), my + aLen * Math.sin(angle + 2.5));
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();

    // Checkpoint bar across track
    if (this.isCheckpointEdge(edge, graph)) {
      this.drawCheckpointBar(ctx, x1, y1, x2, y2);
    }
  }

  private isCheckpointEdge(edge: Edge, graph: Graph): boolean {
    try {
      const to = graph.getVertex(edge.to);
      return to.type === 'Checkpoint';
    } catch {
      return false;
    }
  }

  private drawCheckpointBar(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const perp = angle + Math.PI / 2;
    const len = 10;
    ctx.save();
    ctx.strokeStyle = tok('--ink-2');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx + len * Math.cos(perp), my + len * Math.sin(perp));
    ctx.lineTo(mx - len * Math.cos(perp), my - len * Math.sin(perp));
    ctx.stroke();
    ctx.restore();
  }

  /** Draw a legend overlay in the bottom-left corner. */
  drawLegend(): void {
    const { ctx, logicalHeight: h } = this.canvas;
    const items: Array<{ label: string; color: string; dash?: boolean }> = [
      { label: 'Main route', color: tok('--ink') },
      { label: 'Shortcut', color: tok('--ink-2'), dash: true },
      { label: 'Blocked', color: tok('--danger'), dash: true },
    ];

    const pad = 12;
    const lineH = 20;
    const boxH = items.length * lineH + pad * 2;
    const boxW = 130;
    const bx = pad;
    const by = h - boxH - pad;

    ctx.save();
    ctx.fillStyle = tok('--paper');
    ctx.globalAlpha = 0.9;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tok('--ink-2');
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, boxH);

    items.forEach((item, i) => {
      const lx = bx + pad;
      const ly = by + pad + i * lineH + lineH / 2;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      if (item.dash) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 24, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tok('--ink');
      ctx.font = `12px ${tok('--font-ui')}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, lx + 32, ly);
    });

    ctx.restore();
  }
}

export type { EdgeStatus };
