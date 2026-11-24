import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  TorusGeometry,
  CanvasTexture,
  type Material,
} from 'three';
import { ART } from './palette.ts';
import { checkerTexture, crowdTexture, glowTexture, labelTexture, windowTexture } from './procedural.ts';
import type { Theme } from './theme.ts';

/** Reusable scenery builders. Every prop is code-generated (no external assets). */
export class PropKit {
  readonly glow: CanvasTexture = glowTexture();
  private readonly cache = new Map<string, Material>();

  constructor(readonly theme: Theme) {}

  mat(key: string, make: () => Material): Material {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  concrete(): MeshStandardMaterial {
    return this.mat('concrete', () => new MeshStandardMaterial({ color: ART.concrete, roughness: 0.85, metalness: 0.05 })) as MeshStandardMaterial;
  }
  dark(): MeshStandardMaterial {
    return this.mat('dark', () => new MeshStandardMaterial({ color: ART.concreteDark, roughness: 0.7, metalness: 0.4 })) as MeshStandardMaterial;
  }
  emissive(color: Color, intensity: number): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: 0x050607, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  }

  glowSprite(color: Color, size: number, opacity = 0.9): Sprite {
    const s = new Sprite(new SpriteMaterial({ map: this.glow, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  }

  sign(text: string, w: number, color: string, bg: string, border?: string): Mesh {
    const l = labelTexture(text, { color, bg, size: 80, padding: 16, border });
    const m = new Mesh(new PlaneGeometry(w, w / l.aspect), new MeshBasicMaterial({ map: l.texture, toneMapped: false, side: DoubleSide }));
    return m;
  }

  // ---------------------------------------------------------------- gates
  /** Arch spanning the road. Local X spans the road, local Z is the travel direction. */
  gate(roadW: number, kind: 'checkpoint' | 'start' | 'finish', label: string): { group: Group; led: MeshStandardMaterial; lights: MeshStandardMaterial[] } {
    const g = new Group();
    const half = roadW / 2 + 1.4;
    const post = new BoxGeometry(0.55, 7, 0.55);
    for (const sx of [-1, 1]) {
      const p = new Mesh(post, this.dark());
      p.position.set(sx * half, 3.5, 0);
      p.castShadow = true;
      g.add(p);
      const foot = new Mesh(new BoxGeometry(1.1, 0.4, 1.1), this.concrete());
      foot.position.set(sx * half, 0.2, 0);
      g.add(foot);
    }
    const beam = new Mesh(new BoxGeometry(half * 2 + 0.8, 0.9, 0.8), this.dark());
    beam.position.set(0, 7.1, 0);
    beam.castShadow = true;
    g.add(beam);
    const led = this.emissive(this.theme.cyan, 1.4);
    const bar = new Mesh(new BoxGeometry(half * 2 - 0.4, 0.14, 0.12), led);
    bar.position.set(0, 6.6, 0.42);
    g.add(bar);
    const bar2 = bar.clone();
    bar2.position.z = -0.42;
    g.add(bar2);
    for (const sx of [-1, 1]) {
      const strip = new Mesh(new BoxGeometry(0.1, 6.2, 0.1), led);
      strip.position.set(sx * (half - 0.33), 3.4, 0.3);
      g.add(strip);
    }
    const lights: MeshStandardMaterial[] = [];
    if (kind === 'start') {
      const housing = new Mesh(new BoxGeometry(5.2, 1.5, 0.6), new MeshStandardMaterial({ color: 0x08090a, roughness: 0.5 }));
      housing.position.set(0, 5.9, -0.5);
      g.add(housing);
      for (let i = 0; i < 5; i++) {
        const lm = new MeshStandardMaterial({ color: 0x1a0505, emissive: new Color(0xff2a1a), emissiveIntensity: 0, roughness: 0.3 });
        lights.push(lm);
        const lamp = new Mesh(new SphereGeometry(0.4, 16, 12), lm);
        lamp.position.set((i - 2) * 0.95, 5.9, -0.85);
        g.add(lamp);
      }
    } else if (kind === 'finish') {
      const banner = new Mesh(
        new PlaneGeometry(half * 2 - 0.6, 1.6),
        new MeshBasicMaterial({ map: checkerTexture(24, 2), toneMapped: false, side: DoubleSide }),
      );
      banner.position.set(0, 5.6, 0);
      g.add(banner);
    }
    const sign = this.sign(label, 4.2, '#0a0c0e', '#' + this.theme.lime.getHexString());
    sign.position.set(0, 8.4, 0);
    g.add(sign);
    const back = sign.clone();
    back.rotation.y = Math.PI;
    g.add(back);
    return { group: g, led, lights };
  }

  // ---------------------------------------------------------------- services
  fuelStation(): { group: Group; setActive(on: boolean): void } {
    const g = new Group();
    const cyan = this.theme.cyan;
    const pad = new Mesh(new PlaneGeometry(26, 15), new MeshStandardMaterial({ color: 0x1b1f23, roughness: 0.5, metalness: 0.2 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.09;
    pad.receiveShadow = true;
    g.add(pad);
    const roof = new Mesh(new BoxGeometry(22, 0.6, 11), this.dark());
    roof.position.y = 6.6;
    roof.castShadow = true;
    g.add(roof);
    const underglow = this.emissive(cyan, 1.8);
    const strip = new Mesh(new BoxGeometry(21.4, 0.12, 0.3), underglow);
    strip.position.set(0, 6.28, 5.3);
    g.add(strip);
    const strip2 = strip.clone();
    strip2.position.z = -5.3;
    g.add(strip2);
    for (const [x, z] of [[-9.5, -4.4], [9.5, -4.4], [-9.5, 4.4], [9.5, 4.4]] as const) {
      const c = new Mesh(new CylinderGeometry(0.3, 0.3, 6.4, 10), this.concrete());
      c.position.set(x, 3.2, z);
      c.castShadow = true;
      g.add(c);
    }
    const screens: MeshStandardMaterial[] = [];
    for (const x of [-6, 0, 6]) {
      const pump = new Mesh(new BoxGeometry(1.1, 2.4, 0.9), new MeshStandardMaterial({ color: 0x1a1e22, metalness: 0.5, roughness: 0.4 }));
      pump.position.set(x, 1.3, 0);
      pump.castShadow = true;
      g.add(pump);
      const sm = this.emissive(cyan, 2);
      screens.push(sm);
      const scr = new Mesh(new BoxGeometry(0.7, 0.5, 0.05), sm);
      scr.position.set(x, 1.9, 0.48);
      g.add(scr);
    }
    const tower = new Mesh(new BoxGeometry(1.4, 12, 1.4), this.dark());
    tower.position.set(-13.5, 6, 0);
    tower.castShadow = true;
    g.add(tower);
    const fuelSign = this.sign('FUEL', 5.4, '#' + cyan.getHexString(), '#090b0d', '#' + cyan.getHexString());
    fuelSign.position.set(-13.5, 12.6, 0);
    g.add(fuelSign);
    const closed = this.sign('OFFLINE', 5.4, '#' + this.theme.danger.getHexString(), '#090b0d', '#' + this.theme.danger.getHexString());
    closed.position.set(-13.5, 12.6, 0.05);
    closed.visible = false;
    g.add(closed);
    const halo = this.glowSprite(cyan, 18, 0.35);
    halo.position.set(0, 5.4, 0);
    g.add(halo);
    return {
      group: g,
      setActive: (on) => {
        for (const s of [underglow, ...screens]) s.emissiveIntensity = on ? 2 : 0.04;
        halo.visible = on;
        fuelSign.visible = on;
        closed.visible = !on;
      },
    };
  }

  nitroPickup(): { group: Group; update(t: number): void; setActive(on: boolean): void } {
    const g = new Group();
    const nitro = this.theme.nitro;
    const crystalMat = new MeshStandardMaterial({ color: 0x1a0b2e, emissive: nitro, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.4 });
    const crystal = new Mesh(new OctahedronGeometry(1.5, 0), crystalMat);
    crystal.scale.set(0.8, 1.5, 0.8);
    crystal.position.y = 3.6;
    crystal.castShadow = true;
    g.add(crystal);
    const ringMat = new MeshBasicMaterial({ color: nitro, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    const ring = new Mesh(new TorusGeometry(4.2, 0.18, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    g.add(ring);
    const ring2 = new Mesh(new TorusGeometry(2.8, 0.1, 8, 40), ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.2;
    g.add(ring2);
    const beamMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uColor: { value: nitro }, uTime: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y / 24.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying float vY; void main(){ float a = pow(1.0 - vY, 1.8) * 0.5 * (0.8 + 0.2*sin(uTime*3.0 + vY*14.0)); gl_FragColor = vec4(uColor, a); }',
    });
    const beam = new Mesh(new CylinderGeometry(2.6, 3.4, 24, 20, 1, true), beamMat);
    beam.position.y = 12;
    g.add(beam);
    const halo = this.glowSprite(nitro, 14, 0.6);
    halo.position.y = 3.6;
    g.add(halo);
    return {
      group: g,
      update: (t) => {
        crystal.rotation.y = t * 1.6;
        crystal.position.y = 3.6 + Math.sin(t * 2.2) * 0.45;
        ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
        beamMat.uniforms['uTime']!.value = t;
      },
      setActive: (on) => {
        crystal.visible = on;
        beam.visible = on;
        halo.visible = on;
        ringMat.opacity = on ? 0.85 : 0.15;
      },
    };
  }

  // ---------------------------------------------------------------- hazards & signage
  barricade(roadW: number): Group {
    const g = new Group();
    const stripeTex = (() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 32;
      const x = c.getContext('2d')!;
      for (let i = 0; i < 8; i++) {
        x.fillStyle = i % 2 ? '#f4f4f4' : '#e0392f';
        x.fillRect(i * 16, 0, 16, 32);
      }
      const t = new CanvasTexture(c);
      t.wrapS = RepeatWrapping;
      t.needsUpdate = true;
      return t;
    })();
    const barMat = new MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
    const w = roadW - 0.4;
    for (const y of [0.75, 1.5]) {
      const bar = new Mesh(new BoxGeometry(w, 0.5, 0.3), barMat);
      bar.position.y = y;
      bar.castShadow = true;
      g.add(bar);
    }
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.4, 2.2, 0.4), this.dark());
      post.position.set(sx * (w / 2 + 0.1), 1.1, 0);
      post.castShadow = true;
      g.add(post);
      const beaconMat = new MeshStandardMaterial({ color: 0x241500, emissive: this.theme.warning, emissiveIntensity: 3, roughness: 0.3 });
      const beacon = new Mesh(new SphereGeometry(0.34, 14, 10), beaconMat);
      beacon.position.set(sx * (w / 2 + 0.1), 2.45, 0);
      beacon.name = 'beacon';
      g.add(beacon);
      const gl = this.glowSprite(this.theme.warning, 5, 0.8);
      gl.position.copy(beacon.position);
      gl.name = 'beaconGlow';
      g.add(gl);
    }
    const board = this.sign('ROAD CLOSED', 5.6, '#ffffff', '#' + this.theme.danger.getHexString());
    board.position.set(0, 3.6, 0);
    g.add(board);
    const legs = new Mesh(new BoxGeometry(0.2, 2.4, 0.2), this.dark());
    legs.position.set(0, 1.9, -0.1);
    g.add(legs);
    for (const [x, z] of [[-w * 0.3, 1.6], [w * 0.3, 1.6], [-w * 0.3, -1.6], [w * 0.3, -1.6]] as const) {
      const cone = new Mesh(new CylinderGeometry(0.06, 0.34, 0.8, 12), new MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }));
      cone.position.set(x, 0.4, z);
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  }

  warningTriangle(text = '!'): Group {
    const g = new Group();
    const post = new Mesh(new CylinderGeometry(0.07, 0.07, 2.4, 8), this.dark());
    post.position.y = 1.2;
    g.add(post);
    const s = this.sign(text, 1.7, '#0a0c0e', '#' + this.theme.warning.getHexString(), '#0a0c0e');
    s.position.y = 2.7;
    g.add(s);
    return g;
  }

  speedSign(limit: string): Group {
    const g = new Group();
    const post = new Mesh(new CylinderGeometry(0.07, 0.07, 2.6, 8), this.dark());
    post.position.y = 1.3;
    g.add(post);
    const s = this.sign(limit, 1.6, '#0a0c0e', '#f4f4f4', '#' + this.theme.danger.getHexString());
    s.position.y = 2.9;
    g.add(s);
    return g;
  }

  oilPatch(): Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const grd = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(8,9,12,0.95)');
    grd.addColorStop(0.7, 'rgba(8,9,12,0.85)');
    grd.addColorStop(1, 'rgba(8,9,12,0)');
    x.fillStyle = grd;
    x.beginPath();
    for (let a = 0; a < 40; a++) {
      const ang = (a / 40) * Math.PI * 2;
      const r = 40 + Math.sin(a * 2.7) * 9 + Math.cos(a * 1.3) * 7;
      x.lineTo(64 + Math.cos(ang) * r, 64 + Math.sin(ang) * r);
    }
    x.closePath();
    x.fill();
    const tex = new CanvasTexture(c);
    tex.needsUpdate = true;
    const m = new Mesh(
      new PlaneGeometry(10, 10),
      new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.04, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  deadEnd(roadW: number): Group {
    const g = new Group();
    const wallMat = new MeshStandardMaterial({ color: ART.barrierRed, roughness: 0.6 });
    const w = new Mesh(new BoxGeometry(roadW + 3, 1.6, 1), wallMat);
    w.position.y = 0.8;
    w.castShadow = true;
    g.add(w);
    const s = this.sign('NO EXIT', 6, '#' + this.theme.danger.getHexString(), '#090b0d', '#' + this.theme.danger.getHexString());
    s.position.set(0, 3.6, -0.6);
    s.rotation.y = Math.PI;
    g.add(s);
    const s2 = s.clone();
    s2.position.z = 0.6;
    s2.rotation.y = 0;
    g.add(s2);
    return g;
  }

  // ---------------------------------------------------------------- spectators & buildings
  grandstand(length: number): Group {
    const g = new Group();
    const crowd = crowdTexture([
      '#' + this.theme.lime.getHexString(),
      '#' + this.theme.cyan.getHexString(),
      '#e9eef2',
      '#ff4545',
      '#ffb547',
    ]);
    crowd.repeat.set(length / 16, 1);
    const seat = new MeshStandardMaterial({ map: crowd, roughness: 0.9, emissive: new Color(0x111111), emissiveMap: crowd, emissiveIntensity: 0.55 });
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const step = new Mesh(new BoxGeometry(length, 1.2 + i * 1.2, 2.4), this.concrete());
      step.position.set(0, (1.2 + i * 1.2) / 2, -i * 2.4);
      step.receiveShadow = true;
      step.castShadow = true;
      g.add(step);
      const face = new Mesh(new PlaneGeometry(length, 1.2), seat);
      face.position.set(0, 1.2 + i * 1.2 + 0.62, -i * 2.4 + 1.21);
      face.rotation.x = -0.35;
      g.add(face);
    }
    const roofY = tiers * 1.2 + 6.5;
    const roof = new Mesh(new BoxGeometry(length + 4, 0.5, tiers * 2.4 + 3), this.dark());
    roof.position.set(0, roofY, -tiers * 1.2 + 0.4);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    g.add(roof);
    const led = new Mesh(new BoxGeometry(length, 0.16, 0.3), this.emissive(this.theme.lime, 1.8));
    led.position.set(0, roofY - 0.35, 1.2);
    g.add(led);
    for (let x = -length / 2 + 2; x <= length / 2 - 2; x += length / 5) {
      const c = new Mesh(new CylinderGeometry(0.25, 0.25, roofY, 8), this.dark());
      c.position.set(x, roofY / 2, 1.6);
      g.add(c);
    }
    return g;
  }

  pitBuilding(length: number): Group {
    const g = new Group();
    const w = new Mesh(new BoxGeometry(length, 7, 12), new MeshStandardMaterial({ color: 0x15191e, roughness: 0.6, metalness: 0.3 }));
    w.position.y = 3.5;
    w.castShadow = true;
    w.receiveShadow = true;
    g.add(w);
    const doors = Math.floor(length / 9);
    for (let i = 0; i < doors; i++) {
      const lit = i % 2 === 0 ? this.theme.lime : this.theme.cyan;
      const d = new Mesh(new BoxGeometry(6, 4.4, 0.2), this.emissive(lit, 0.9));
      d.position.set(-length / 2 + 5 + i * 9, 2.4, 6.05);
      g.add(d);
    }
    const stripe = new Mesh(new BoxGeometry(length, 0.3, 0.2), this.emissive(this.theme.lime, 2.2));
    stripe.position.set(0, 6.9, 6.1);
    g.add(stripe);
    return g;
  }

  skyline(count: number, radius: number, rand: () => number): Group {
    const g = new Group();
    const tex = windowTexture('#' + this.theme.cyan.getHexString());
    const tex2 = windowTexture('#ffd9a0', 8);
    const mats = [tex, tex2].map(
      (t) => new MeshStandardMaterial({ color: 0x0b0e12, emissive: new Color(0xffffff), emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.8 }),
    );
    const geo = new BoxGeometry(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.05;
      const r = radius * (0.95 + rand() * 0.45);
      const w = 40 + rand() * 90;
      const h = 50 + rand() * rand() * 260;
      const m = new Mesh(geo, mats[rand() > 0.4 ? 0 : 1]!);
      m.scale.set(w, h, 40 + rand() * 80);
      m.position.set(Math.cos(ang) * r, h / 2 - 12, Math.sin(ang) * r);
      m.rotation.y = -ang;
      g.add(m);
    }
    return g;
  }

  lampPole(height = 14): Group {
    const g = new Group();
    const pole = new Mesh(new CylinderGeometry(0.14, 0.22, height, 8), this.dark());
    pole.position.y = height / 2;
    pole.castShadow = true;
    g.add(pole);
    const arm = new Mesh(new BoxGeometry(3.4, 0.16, 0.2), this.dark());
    arm.position.set(1.6, height, 0);
    g.add(arm);
    const head = new Mesh(new BoxGeometry(1.4, 0.2, 0.7), this.emissive(new Color(0xfff1d6), 4));
    head.position.set(3.1, height - 0.15, 0);
    g.add(head);
    const gl = this.glowSprite(new Color(0xffe2b0), 14, 0.5);
    gl.position.set(3.1, height - 0.6, 0);
    g.add(gl);
    return g;
  }

  checkerStrip(roadW: number): Mesh {
    const m = new Mesh(
      new PlaneGeometry(roadW - 0.6, 2.4),
      new MeshBasicMaterial({ map: checkerTexture(16, 2), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6 }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  groundDisc(radius: number, color: number): Mesh {
    const m = new Mesh(new CircleGeometry(radius, 32), new MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }
}
