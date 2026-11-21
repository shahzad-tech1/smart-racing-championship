/**
 * src/main.ts — PLACEHOLDER entry point (Person A, Phase 0).
 *
 * This draws circuit1 to a canvas so the project boots and renders a graph at the
 * Phase-0 gate. Person B REPLACES this in their Phase 0 with the real app shell,
 * state machine, design system and GraphRenderer. Keep it tiny; do not build
 * features here.
 */

import { buildCircuit1, CIRCUIT1_VERTICES, CIRCUIT1_EDGES } from "./data/circuits/circuit1";
import type { Vertex } from "./core/types";

const TYPE_COLOR: Record<string, string> = {
  Start: "#39ff14",
  Finish: "#ff2d95",
  Checkpoint: "#00e5ff",
  Intersection: "#8a8f98",
  FuelStation: "#ffc400",
  NitroPickup: "#b14bff",
  DeadEnd: "#ff5252",
};

function boot() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <main style="min-height:100vh;background:#0b0e14;color:#e6edf3;font-family:system-ui,sans-serif;
                 display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;box-sizing:border-box">
      <h1 style="margin:8px 0 0;font-size:22px;letter-spacing:.5px">SMART RACING CHAMPIONSHIP</h1>
      <p style="margin:0;color:#8a8f98;font-size:13px">Phase 0 placeholder — circuit1 "Neon Ring" renders below. (Person B replaces this shell.)</p>
      <canvas id="track" width="760" height="620"
              style="max-width:100%;height:auto;border:1px solid #1b2230;border-radius:12px;background:
              radial-gradient(1200px 600px at 50% -10%, #11182400, #0b0e14)"></canvas>
      <div id="legend" style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#c9d1d9"></div>
    </main>`;

  const g = buildCircuit1();
  const canvas = document.getElementById("track") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const vById = new Map<number, Vertex>(CIRCUIT1_VERTICES.map((v) => [v.id, v]));

  // edges
  for (const e of CIRCUIT1_EDGES) {
    const a = vById.get(e.from)!;
    const b = vById.get(e.to)!;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = e.isShortcut ? 3 : 2;
    ctx.strokeStyle = e.isShortcut ? "#b14bff" : `rgba(120,140,170,${0.35 + e.difficulty * 0.1})`;
    if (e.isShortcut) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#b14bff";
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // vertices
  for (const v of CIRCUIT1_VERTICES) {
    const color = TYPE_COLOR[v.type] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(v.x, v.y, v.type === "Checkpoint" ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (v.checkpointOrder != null) {
      ctx.fillStyle = "#001018";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(v.checkpointOrder), v.x, v.y);
    }
  }

  // legend
  const legend = document.getElementById("legend")!;
  legend.innerHTML = Object.entries(TYPE_COLOR)
    .map(
      ([name, c]) =>
        `<span style="display:inline-flex;align-items:center;gap:6px">
           <span style="width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c}"></span>${name}
         </span>`,
    )
    .join("");

  // eslint-disable-next-line no-console
  console.log(`circuit1 loaded: ${g.vertexCount} vertices, ${g.edgeCount} edges`);
}

boot();
