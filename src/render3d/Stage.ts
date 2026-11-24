import {
  ACESFilmicToneMapping,
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createCinematicPass } from './CinematicPass.ts';
import type { Quality } from '../state/Settings.ts';

export class WebGLUnavailableError extends Error {
  constructor() {
    super('WebGL is not available');
    this.name = 'WebGLUnavailableError';
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface StageOptions {
  quality: Quality;
  /** Bloom strength; kept restrained by default ("do not overuse bloom"). */
  bloom?: number;
  shadows?: boolean;
  fov?: number;
  near?: number;
  far?: number;
}

const QUALITY_PIXEL_RATIO: Record<Quality, number> = { low: 0.75, medium: 1, high: 1.5 };

/**
 * Owns the WebGL renderer, the effect composer and the render loop for one view.
 * Scenes plug in through `onUpdate`. Resolution adapts automatically if frames run slow.
 */
export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly composer: EffectComposer;
  readonly cinematic: ShaderPass;
  readonly bloom: UnrealBloomPass;
  readonly clock = new Clock();
  onUpdate: ((dt: number, t: number) => void) | null = null;
  /** Running average frame time in ms (for the quality governor / debug overlay). */
  frameMs = 16;

  private bokeh: BokehPass | null = null;
  private readonly ro: ResizeObserver;
  private raf = 0;
  private running = false;
  private pixelRatio: number;
  private readonly maxPixelRatio: number;
  private slowFrames = 0;
  private w = 1;
  private h = 1;
  private disposed = false;

  constructor(readonly container: HTMLElement, readonly opts: StageOptions) {
    if (!webglAvailable()) throw new WebGLUnavailableError();
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: opts.quality !== 'low',
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      throw new WebGLUnavailableError();
    }
    this.renderer = renderer;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY_PIXEL_RATIO[opts.quality]);
    this.pixelRatio = this.maxPixelRatio;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = opts.shadows !== false && opts.quality !== 'low';
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    this.camera = new PerspectiveCamera(opts.fov ?? 55, 1, opts.near ?? 0.3, opts.far ?? 4000);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), opts.bloom ?? 0.32, 0.55, 0.88);
    this.bloom.enabled = opts.quality !== 'low';
    this.composer.addPass(this.bloom);
    this.cinematic = createCinematicPass();
    this.composer.addPass(this.cinematic);
    this.composer.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  get width(): number {
    return this.w;
  }
  get height(): number {
    return this.h;
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(2, Math.floor(rect.width));
    const h = Math.max(2, Math.floor(rect.height));
    if (w === this.w && h === this.h && this.renderer.getPixelRatio() === this.pixelRatio) return;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.cinematic.uniforms['uResolution']!.value as Vector2).set(w, h);
  }

  /** Depth of field for hero shots (garage). */
  enableDepthOfField(focus: number, aperture = 0.00018, maxblur = 0.012): void {
    if (this.opts.quality === 'low') return;
    if (!this.bokeh) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus, aperture, maxblur });
      this.composer.insertPass(this.bokeh, 1);
    }
    const u = this.bokeh.uniforms as unknown as Record<string, { value: number }>;
    u['focus']!.value = focus;
    u['aperture']!.value = aperture;
    u['maxblur']!.value = maxblur;
  }

  setFocus(distance: number): void {
    if (this.bokeh) (this.bokeh.uniforms as unknown as Record<string, { value: number }>)['focus']!.value = distance;
  }

  setSpeedBlur(v: number): void {
    this.cinematic.uniforms['uSpeed']!.value = this.opts.quality === 'low' ? 0 : v;
  }

  /** 0 = visible, 1 = black (screen transitions). */
  setFade(v: number): void {
    this.cinematic.uniforms['uFade']!.value = v;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const frame = (): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
      this.governQuality();
      this.cinematic.uniforms['uTime']!.value = t % 100;
      this.onUpdate?.(dt, t);
      this.composer.render(dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Drop render resolution (then bloom) if frames stay slow; never raises it back (no flicker). */
  private governQuality(): void {
    if (this.frameMs > 24) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.slowFrames = 0;
      if (this.pixelRatio > 0.6) {
        this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.2);
        this.resize();
      } else if (this.bloom.enabled) {
        this.bloom.enabled = false;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as unknown as {
        geometry?: { dispose(): void };
        material?: { dispose(): void } | Array<{ dispose(): void }>;
      };
      m.geometry?.dispose();
      if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
      else m.material?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
