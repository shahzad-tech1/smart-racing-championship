import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type Camera,
} from 'three';
import type { Graph } from '../core/Graph.ts';
import type { TrackWorld } from './TrackWorld.ts';
import type { Theme } from './theme.ts';
import { ribbon } from './ribbon.ts';
import { labelTexture } from './procedural.ts';

export type NodeState = 'idle' | 'visited' | 'frontier' | 'start' | 'goal' | 'path';
export type EdgeState = 'none' | 'considered' | 'primary' | 'secondary';

interface Node {
  id: number;
  pillar: Mesh;
  mat: MeshStandardMaterial;
  pick: Mesh;
  label: Sprite;
  k: number;
  target: number;
}

interface EdgeViz {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  state: EdgeState;
  alpha: number;
}

/** Algorithm visualisation drawn on top of the 3D circuit: node beacons, route ribbons, pick targets. */
export class GraphOverlay {
  readonly group = new Group();
  private readonly nodes = new Map<number, Node>();
  private readonly edges = new Map<number, EdgeViz>();
  private readonly ray = new Raycaster();
  private readonly colors: Record<NodeState, Color>;
  private readonly edgeColors: Record<EdgeState, Color>;

  constructor(graph: Graph, world: TrackWorld, theme: Theme) {
    this.colors = {
      idle: new Color(0x6b7680),
      visited: theme.cyan.clone(),
      frontier: theme.warning.clone(),
      start: theme.lime.clone(),
      goal: theme.danger.clone(),
      path: theme.lime.clone(),
    };
    this.edgeColors = { none: new Color(0), considered: theme.cyan.clone(), primary: theme.lime.clone(), secondary: theme.warning.clone() };
    const k = Math.min(3, Math.max(1, world.bounds.size / 200));
    const pillarGeo = new CylinderGeometry(1.1 * k, 1.1 * k, 1, 14, 1, true);
    const pickGeo = new SphereGeometry(7 * k, 12, 8);
    const pos = new Vector3();
    for (const v of graph.allVertices()) {
      world.vertexPos(v.id, pos);
      const mat = new MeshStandardMaterial({ color: 0x0a0c0e, emissive: this.colors.idle, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 });
      const pillar = new Mesh(pillarGeo, mat);
      const h = 13 * k;
      pillar.scale.set(1, h, 1);
      pillar.position.set(pos.x, pos.y + h / 2, pos.z);
      const pick = new Mesh(pickGeo, new MeshBasicMaterial({ visible: false }));
      pick.position.set(pos.x, pos.y + 3 * k, pos.z);
      pick.userData['vertexId'] = v.id;
      const l = labelTexture(String(v.id), { color: '#ffffff', bg: 'rgba(9,11,13,0.78)', size: 54, padding: 12 });
      const label = new Sprite(new SpriteMaterial({ map: l.texture, transparent: true, depthWrite: false, depthTest: false }));
      label.scale.set(6.4 * k * l.aspect, 6.4 * k, 1);
      label.position.set(pos.x, pos.y + h + 3.4 * k, pos.z);
      label.renderOrder = 10;
      this.group.add(pillar, pick, label);
      this.nodes.set(v.id, { id: v.id, pillar, mat, pick, label, k: 1, target: 1 });
    }
    for (const e of graph.allEdges()) {
      const pl = world.edgePolyline(e.id);
      if (!pl) continue;
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, toneMapped: false });
      const mesh = new Mesh(ribbon(pl, -2.2, 2.2, 0.32, 0, pl.len, 4), mat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.edges.set(e.id, { mesh, mat, state: 'none', alpha: 0 });
    }
  }

  reset(): void {
    for (const id of this.nodes.keys()) this.setNode(id, 'idle');
    for (const id of this.edges.keys()) this.setEdge(id, 'none');
  }

  setNode(id: number, s: NodeState): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.mat.emissive.copy(this.colors[s]);
    n.mat.emissiveIntensity = s === 'idle' ? 0.7 : 2.2;
    n.target = s === 'idle' ? 1 : s === 'start' || s === 'goal' ? 1.9 : 1.35;
  }

  setEdge(id: number, s: EdgeState): void {
    const e = this.edges.get(id);
    if (!e) return;
    e.state = s;
    e.mat.color.copy(this.edgeColors[s]);
    e.mesh.visible = s !== 'none';
    e.alpha = s === 'primary' ? 0.95 : s === 'secondary' ? 0.7 : s === 'considered' ? 0.55 : 0;
    e.mat.opacity = e.alpha;
  }

  setLabelsVisible(on: boolean): void {
    for (const n of this.nodes.values()) n.label.visible = on;
  }

  /** Animate beacon growth and the route pulse. */
  update(dt: number, t: number): void {
    for (const n of this.nodes.values()) {
      n.k += (n.target - n.k) * Math.min(1, dt * 9);
      n.pillar.scale.x = n.pillar.scale.z = n.k;
    }
    const pulse = 0.82 + 0.18 * Math.sin(t * 5);
    for (const e of this.edges.values()) {
      if (e.state === 'primary') e.mat.opacity = e.alpha * pulse;
    }
  }

  /** Returns the vertex under a pointer (NDC), or null. */
  pick(ndc: Vector2, camera: Camera): number | null {
    this.ray.setFromCamera(ndc, camera);
    const hit = this.ray.intersectObjects([...this.nodes.values()].map((n) => n.pick), false)[0];
    return hit ? (hit.object.userData['vertexId'] as number) : null;
  }
}
