import { Camera } from './Camera.ts';

type DrawFn = (canvas: CanvasWrapper) => void;

/**
 * Resize-aware canvas with device-pixel-ratio scaling.
 * All drawing is in CSS/logical pixels; DPR scaling is handled transparently.
 */
export class CanvasWrapper {
  readonly el: HTMLCanvasElement;
  readonly camera: Camera;

  private _ctx: CanvasRenderingContext2D;
  private _dpr = 1;
  private _logW = 300;
  private _logH = 150;
  private _ro: ResizeObserver;

  constructor(container: HTMLElement, camera?: Camera) {
    this.el = document.createElement('canvas');
    this.el.style.display = 'block';
    this.el.style.width = '100%';
    this.el.style.height = '100%';
    const ctx = this.el.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d canvas context');
    this._ctx = ctx;
    this.camera = camera ?? new Camera();
    container.appendChild(this.el);

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(container);
    this._onResize();
  }

  private _onResize(): void {
    const p = this.el.parentElement;
    if (!p) return;
    const rect = p.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this._dpr = window.devicePixelRatio || 1;
    this._logW = rect.width;
    this._logH = rect.height;
    this.el.width = Math.round(rect.width * this._dpr);
    this.el.height = Math.round(rect.height * this._dpr);
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  get ctx(): CanvasRenderingContext2D { return this._ctx; }
  get logicalWidth(): number { return this._logW; }
  get logicalHeight(): number { return this._logH; }

  clear(fill?: string): void {
    if (fill) {
      this._ctx.fillStyle = fill;
      this._ctx.fillRect(0, 0, this._logW, this._logH);
    } else {
      this._ctx.clearRect(0, 0, this._logW, this._logH);
    }
  }

  /**
   * Start the RAF loop. Returns a stop function.
   * The draw callback is invoked every frame.
   */
  startLoop(draw: DrawFn): () => void {
    let running = true;
    const frame = () => {
      if (!running) return;
      draw(this);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return () => { running = false; };
  }

  dispose(): void {
    this._ro.disconnect();
    this.el.remove();
  }

  /** Add wheel + pointer pan/zoom interaction. */
  enablePanZoom(): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.camera.zoomAt(e.offsetX, e.offsetY, factor, this._logW, this._logH);
    }, { passive: false });

    this.el.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.offsetX;
      lastY = e.offsetY;
      this.el.setPointerCapture(e.pointerId);
    });

    this.el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.camera.pan(e.offsetX - lastX, e.offsetY - lastY);
      lastX = e.offsetX;
      lastY = e.offsetY;
    });

    const stop = () => { dragging = false; };
    this.el.addEventListener('pointerup', stop);
    this.el.addEventListener('pointercancel', stop);
  }
}
