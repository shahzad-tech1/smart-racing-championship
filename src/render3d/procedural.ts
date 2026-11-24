import {
  BackSide,
  CanvasTexture,
  Color,
  Mesh,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeRng } from '../core/rng.ts';

/** All textures are generated in code (no external assets to license or load). */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  if (repeat) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, rng: () => number, light: string, dark: string): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    const s = 0.6 + rng() * 1.6;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** Road: u across (edge lines at the sides, dashed centre), v along. One repeat = 16 world units. */
export function roadTexture(opts: { dashed?: boolean; wet?: boolean } = {}): CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const rng = makeRng(11);
  ctx.fillStyle = opts.wet ? '#20252a' : '#353a41';
  ctx.fillRect(0, 0, 256, 512);
  speckle(ctx, 256, 512, 5200, rng, '#8b949c', '#000000');
  // tyre rubber-in: darker racing line bands
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.28, 'rgba(0,0,0,0.28)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.06)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  // edge lines
  ctx.fillStyle = 'rgba(230,234,238,0.82)';
  ctx.fillRect(12, 0, 5, 512);
  ctx.fillRect(239, 0, 5, 512);
  // centre dashes
  if (opts.dashed !== false) {
    ctx.fillStyle = 'rgba(230,234,238,0.55)';
    for (let y = 0; y < 512; y += 128) ctx.fillRect(125, y + 16, 6, 64);
  }
  speckle(ctx, 256, 512, 1400, rng, '#ffffff', '#000000');
  return tex(c);
}

export function curbTexture(): CanvasTexture {
  const [c, ctx] = canvas(64, 128);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#c42b2b' : '#e8ebee';
    ctx.fillRect(0, i * 32, 64, 32);
  }
  return tex(c);
}

export function grassTexture(a: string, b: string): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rng = makeRng(5);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = rng() > 0.5 ? b : '#0e2414';
    ctx.globalAlpha = 0.18 + rng() * 0.3;
    ctx.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 2 + rng() * 4);
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

export function glowTexture(): CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return tex(c, false, false);
}

export function smokeTexture(): CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rng = makeRng(77);
  for (let i = 0; i < 26; i++) {
    const x = 34 + rng() * 60;
    const y = 34 + rng() * 60;
    const r = 18 + rng() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  // fade to nothing at the border so quads never show edges
  const m = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = m;
  ctx.fillRect(0, 0, 128, 128);
  return tex(c, false, false);
}

export function checkerTexture(cols = 8, rows = 2): CanvasTexture {
  const [c, ctx] = canvas(cols * 32, rows * 32);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f4f5' : '#0b0c0d';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  return tex(c);
}

export function windowTexture(lit: string, seed = 3): CanvasTexture {
  const [c, ctx] = canvas(128, 256);
  const rng = makeRng(seed);
  ctx.fillStyle = '#0a0d11';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 256; y += 14)
    for (let x = 6; x < 128; x += 12) {
      if (rng() > 0.45) {
        ctx.fillStyle = lit;
        ctx.globalAlpha = 0.35 + rng() * 0.6;
        ctx.fillRect(x, y, 7, 8);
      }
    }
  ctx.globalAlpha = 1;
  return tex(c);
}

export function crowdTexture(colors: string[]): CanvasTexture {
  const [c, ctx] = canvas(256, 64);
  const rng = makeRng(9);
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? '#888';
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.fillRect(rng() * 256, rng() * 64, 2.5, 3);
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

export interface Label {
  texture: CanvasTexture;
  aspect: number;
}

/** Crisp text label on a transparent (or panel) background — used for 3D signage and graph node tags. */
export function labelTexture(
  text: string,
  o: { color: string; bg?: string; font?: string; size?: number; padding?: number; border?: string } = { color: '#ffffff' },
): Label {
  const size = o.size ?? 64;
  const pad = o.padding ?? 14;
  const font = `700 ${size}px ${o.font ?? "'Big Shoulders Display', 'IBM Plex Mono', system-ui, sans-serif"}`;
  const [measure, mctx] = canvas(8, 8);
  mctx.font = font;
  const w = Math.ceil(mctx.measureText(text).width) + pad * 2;
  const h = size + pad * 2;
  void measure;
  const [c, ctx] = canvas(w, h);
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, w, h);
  }
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }
  ctx.font = font;
  ctx.fillStyle = o.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  const t = tex(c, false);
  t.anisotropy = 4;
  return { texture: t, aspect: w / h };
}

/** Night sky dome: gradient + stars + a warm city-glow band at the horizon. */
export function createSky(top: Color, horizon: Color, glow: Color, radius = 3200): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: top }, uHorizon: { value: horizon }, uGlow: { value: glow } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
        col += uGlow * 0.55 * exp(-abs(vDir.y) * 9.0);
        // stars
        vec3 g = floor(vDir * 420.0);
        float s = step(0.9965, hash(g)) * smoothstep(0.1, 0.5, h);
        col += vec3(s) * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const m = new Mesh(new SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** Neutral studio-style reflection probe (RoomEnvironment through PMREM). */
export function makeEnvironment(renderer: WebGLRenderer, sigma = 0.04): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), sigma).texture;
  pmrem.dispose();
  return env;
}
