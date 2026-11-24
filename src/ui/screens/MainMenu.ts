import type { AppStateMachine } from '../../state/AppState.ts';
import { CanvasWrapper } from '../../render/Canvas.ts';
import { GraphRenderer } from '../../render/GraphRenderer.ts';
import { buildCircuit1, CIRCUIT1_VERTICES, CIRCUIT1_EDGES } from '../../data/circuits/circuit1.ts';
import { tok } from '../../render/tokens.ts';

export class MainMenu {
  readonly el: HTMLElement;
  private _stopLoop: (() => void) | null = null;
  private _canvas: CanvasWrapper | null = null;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = document.createElement('div');
    this.el.className = 'screen screen--menu';
    this.el.style.display = 'grid';
    this.el.style.gridTemplateColumns = '1fr 1fr';
    this.el.style.height = '100%';
    this.el.style.overflow = 'hidden';
    container.appendChild(this.el);
    this._build();
  }

  private _build(): void {
    // Left column: title + nav
    const left = document.createElement('div');
    left.style.cssText = `
      padding: 3rem var(--gutter) 2rem;
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow-y: auto;
    `;

    const title = document.createElement('h1');
    title.style.cssText = `
      font-size: var(--text-2xl);
      font-family: var(--font-display);
      font-weight: 700;
      margin-bottom: 0.5rem;
      color: var(--ink);
    `;
    title.textContent = 'Smart Racing Championship';

    const sub = document.createElement('p');
    sub.style.cssText = `
      font-size: var(--text-sm);
      color: var(--ink-2);
      max-width: 36ch;
      margin-bottom: 2.5rem;
    `;
    sub.textContent = 'A championship on three circuits, with the routing algorithms underneath.';

    const nav = this._buildNav();

    left.append(title, sub, nav);

    // Right column: circuit map (canvas)
    const right = document.createElement('div');
    right.style.cssText = `
      position: relative;
      overflow: hidden;
      background: var(--paper);
      border-left: 1px solid var(--ink-2);
    `;

    this.el.append(left, right);

    // Start canvas after DOM is in place
    requestAnimationFrame(() => {
      this._startCanvas(right);
    });

    // Responsive: single column below 600px
    this._applyResponsive();
  }

  private _buildNav(): HTMLElement {
    const nav = document.createElement('nav');
    nav.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0;
    `;
    nav.setAttribute('aria-label', 'Main navigation');

    const items: Array<{ label: string; screen: Parameters<AppStateMachine['navigate']>[0] }> = [
      { label: 'Track explorer', screen: 'TrackExplorer' },
      { label: 'Race', screen: 'Racing' },
      { label: 'Championship', screen: 'Dashboard' },
      { label: 'Algorithm lab', screen: 'AlgorithmLab' },
    ];

    for (const item of items) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display: block;
        width: 100%;
        text-align: left;
        padding: 0.75rem 0;
        background: transparent;
        border: none;
        border-bottom: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--ink);
        cursor: pointer;
        min-height: 44px;
        transition: color 0.1s, padding-left 0.1s;
      `;
      btn.textContent = item.label;
      btn.setAttribute('type', 'button');

      btn.addEventListener('mouseenter', () => {
        btn.style.color = 'var(--signal)';
        btn.style.paddingLeft = '0.5rem';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.color = 'var(--ink)';
        btn.style.paddingLeft = '0';
      });
      btn.addEventListener('click', () => this.app.navigate(item.screen));

      nav.appendChild(btn);
    }

    return nav;
  }

  private _startCanvas(container: HTMLElement): void {
    const graph = buildCircuit1();
    const renderer = new GraphRenderer(
      (this._canvas = new CanvasWrapper(container))
    );

    // Fit to circuit1 bounds
    const xs = CIRCUIT1_VERTICES.map((v) => v.x);
    const ys = CIRCUIT1_VERTICES.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    this._canvas.camera.fitBounds(
      minX - 20, minY - 20,
      maxX + 20, maxY + 20,
      this._canvas.logicalWidth,
      this._canvas.logicalHeight,
    );

    this._stopLoop = this._canvas.startLoop((cv) => {
      cv.clear(tok('--paper'));
      renderer.render(graph, { showGrid: true });
      renderer.drawLegend();
    });

    // Pan/zoom on the hero map
    this._canvas.enablePanZoom();

    // Re-fit camera on resize
    const refitOnResize = new ResizeObserver(() => {
      if (!this._canvas) return;
      this._canvas.camera.fitBounds(
        minX - 20, minY - 20,
        maxX + 20, maxY + 20,
        this._canvas.logicalWidth,
        this._canvas.logicalHeight,
      );
    });
    refitOnResize.observe(container);
  }

  private _applyResponsive(): void {
    const mq = window.matchMedia('(max-width: 600px)');
    const apply = (m: MediaQueryList | MediaQueryListEvent) => {
      if (m.matches) {
        this.el.style.gridTemplateColumns = '1fr';
      } else {
        this.el.style.gridTemplateColumns = '1fr 1fr';
      }
    };
    apply(mq);
    mq.addEventListener('change', apply);
  }

  dispose(): void {
    this._stopLoop?.();
    this._canvas?.dispose();
    this.el.remove();
  }
}

export { CIRCUIT1_VERTICES, CIRCUIT1_EDGES };
