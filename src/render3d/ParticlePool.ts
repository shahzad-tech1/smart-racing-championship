import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';

export interface EmitSpec {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size0: number; size1: number;
  /** start / end colour (linear) */
  c0: Color; c1?: Color;
  alpha: number;
  drag?: number; // 1/s velocity damping
  gravity?: number; // world units / s^2 (negative = falls)
  spin?: number;
}

/**
 * Fixed-capacity CPU particle pool rendered as one Points draw call.
 * Used for tyre smoke, nitro flame, sparks, garage smoke, confetti.
 */
export class ParticlePool {
  readonly points: Points;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly rot: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly spin: Float32Array;
  private head = 0;
  private readonly geo: BufferGeometry;
  private readonly mat: ShaderMaterial;
  alive = 0;

  constructor(max: number, texture: Texture, additive: boolean) {
    this.max = max;
    const f = (n: number): Float32Array => new Float32Array(max * n);
    this.pos = f(3); this.vel = f(3); this.col = f(3); this.size = f(1); this.alpha = f(1); this.rot = f(1);
    this.age = f(1).fill(1); this.life = f(1).fill(1); this.size0 = f(1); this.size1 = f(1);
    this.c0 = f(3); this.c1 = f(3); this.a0 = f(1); this.drag = f(1); this.grav = f(1); this.spin = f(1);

    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    this.geo.setAttribute('aColor', new BufferAttribute(this.col, 3).setUsage(35048));
    this.geo.setAttribute('aSize', new BufferAttribute(this.size, 1).setUsage(35048));
    this.geo.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1).setUsage(35048));
    this.geo.setAttribute('aRot', new BufferAttribute(this.rot, 1).setUsage(35048));

    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      uniforms: { uTex: { value: texture }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
        uniform float uScale;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        void main() {
          vColor = aColor; vAlpha = aAlpha; vRot = aRot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 700.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
          vec4 t = texture2D(uTex, uv);
          float a = t.a * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * t.rgb, a);
        }
      `,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  /** Keep point sizes in world-space proportion to the viewport. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.mat.uniforms['uScale']!.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(s: EmitSpec): void {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = s.x; this.pos[i3 + 1] = s.y; this.pos[i3 + 2] = s.z;
    this.vel[i3] = s.vx ?? 0; this.vel[i3 + 1] = s.vy ?? 0; this.vel[i3 + 2] = s.vz ?? 0;
    this.age[i] = 0; this.life[i] = s.life;
    this.size0[i] = s.size0; this.size1[i] = s.size1;
    const c1 = s.c1 ?? s.c0;
    this.c0[i3] = s.c0.r; this.c0[i3 + 1] = s.c0.g; this.c0[i3 + 2] = s.c0.b;
    this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
    this.a0[i] = s.alpha;
    this.drag[i] = s.drag ?? 0; this.grav[i] = s.gravity ?? 0;
    this.spin[i] = s.spin ?? 0;
    this.rot[i] = Math.random() * 6.28; // visual only — never feeds the simulation
  }

  update(dt: number): void {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const age = this.age[i]!;
      const life = this.life[i]!;
      if (age >= life) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      const na = age + dt;
      this.age[i] = na;
      const t = Math.min(1, na / life);
      const i3 = i * 3;
      const damp = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[i3] = this.vel[i3]! * damp;
      this.vel[i3 + 1] = this.vel[i3 + 1]! * damp + this.grav[i]! * dt;
      this.vel[i3 + 2] = this.vel[i3 + 2]! * damp;
      this.pos[i3] = this.pos[i3]! + this.vel[i3]! * dt;
      this.pos[i3 + 1] = this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt;
      this.pos[i3 + 2] = this.pos[i3 + 2]! + this.vel[i3 + 2]! * dt;
      this.rot[i] = this.rot[i]! + this.spin[i]! * dt;
      this.size[i] = this.size0[i]! + (this.size1[i]! - this.size0[i]!) * t;
      this.col[i3] = this.c0[i3]! + (this.c1[i3]! - this.c0[i3]!) * t;
      this.col[i3 + 1] = this.c0[i3 + 1]! + (this.c1[i3 + 1]! - this.c0[i3 + 1]!) * t;
      this.col[i3 + 2] = this.c0[i3 + 2]! + (this.c1[i3 + 2]! - this.c0[i3 + 2]!) * t;
      const fadeIn = Math.min(1, t / 0.08);
      this.alpha[i] = this.a0[i]! * fadeIn * (1 - t) * (1 - t * 0.2);
    }
    this.alive = alive;
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aRot') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Streaking rain that follows the camera: one LineSegments draw call, animated entirely in the vertex shader. */
export class RainField {
  readonly lines: LineSegments;
  private readonly mat: ShaderMaterial;
  private readonly geo = new BufferGeometry();

  constructor(count = 3500, color = new Color(0x9fb4c6)) {
    const off = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    const W = 140;
    const H = 90;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const z = Math.random() * W;
      for (let k = 0; k < 2; k++) {
        const j = (i * 2 + k) * 3;
        off[j] = x; off[j + 1] = y; off[j + 2] = z;
        end[i * 2 + k] = k;
      }
    }
    this.geo.setAttribute('position', new BufferAttribute(off, 3));
    this.geo.setAttribute('aEnd', new BufferAttribute(end, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new Vector3() }, uColor: { value: color }, uW: { value: W }, uH: { value: H } },
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform float uTime; uniform vec3 uCam; uniform float uW; uniform float uH;
        varying float vA;
        void main() {
          vec3 p = position;
          float x = uCam.x + mod(p.x - uCam.x + uW * 0.5, uW) - uW * 0.5;
          float z = uCam.z + mod(p.z - uCam.z + uW * 0.5, uW) - uW * 0.5;
          float y = uCam.y + uH * 0.5 - mod(p.y + uTime * 42.0, uH);
          vec3 w = vec3(x, y, z) + aEnd * vec3(1.6, 3.4, 0.4);
          vA = (1.0 - aEnd) * 0.55 + aEnd * 0.05;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA * 0.5); }
      `,
    });
    this.lines = new LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
  }

  update(t: number, camPos: Vector3): void {
    this.mat.uniforms['uTime']!.value = t;
    (this.mat.uniforms['uCam']!.value as Vector3).copy(camPos);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
