import type { AppStateMachine, Screen } from '../../state/AppState.ts';
import { settings, type Quality, type RendererMode } from '../../state/Settings.ts';
import { session } from '../../state/session.ts';

interface Item { label: string; hint: string; screen?: Screen; act?: 'settings' | 'help'; primary?: boolean }
const ITEMS: Item[] = [
  { label: 'Championship', hint: 'Standings & podium', screen: 'Dashboard' },
  { label: 'Quick race', hint: 'Start now', screen: 'Racing', primary: true },
  { label: 'Track explorer', hint: '3 circuits', screen: 'TrackExplorer' },
  { label: 'Algorithm lab', hint: '12 algorithms', screen: 'AlgorithmLab' },
  { label: 'Settings', hint: 'Quality · renderer', act: 'settings' },
  { label: 'Instructions', hint: 'How it works', act: 'help' },
];

/** Main menu: a cinematic 3D garage with the navigation laid over it. Falls back to a static backdrop. */
export class MainMenu {
  readonly el: HTMLElement;
  private garage: { dispose(): void; setLivery(l: never): void; rev(): void; reduceMotion: boolean } | null = null;
  private modal: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closeModal();
  };
  private disposed = false;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = document.createElement('div');
    this.el.className = 'screen menu';
    container.appendChild(this.el);
    this.build();
    window.addEventListener('keydown', this.onKey);
  }

  private build(): void {
    this.el.innerHTML = `
      <div class="menu__stage"></div>
      <div class="menu__shade"></div>
      <div class="menu__panel">
        <div class="menu__eyebrow">DAA project · season 2026</div>
        <h1 class="menu__title">Smart Racing<br>Championship</h1>
        <p class="menu__sub">Race three circuits where graph algorithms pick every route, then watch them work in 3D.</p>
        <nav class="menu__nav" aria-label="Main navigation"></nav>
      </div>`;
    const nav = this.el.querySelector('.menu__nav')!;
    for (const it of ITEMS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu__item' + (it.primary ? ' menu__item--primary' : '');
      b.innerHTML = `<span>${it.label}</span><small>${it.hint}</small>`;
      b.addEventListener('click', () => {
        if (it.screen === 'Racing') session.plan = null;
        if (it.screen) this.app.navigate(it.screen);
        else if (it.act === 'settings') this.openSettings();
        else this.openHelp();
      });
      nav.appendChild(b);
    }
    this.mountGarage();
  }

  private async mountGarage(): Promise<void> {
    const stage = this.el.querySelector('.menu__stage') as HTMLElement;
    const fallback = (): void => {
      stage.innerHTML = '<div class="menu__fallback"></div>';
    };
    if (settings.current.renderer === '2d') return fallback();
    try {
      const { webglAvailable } = await import('../../render3d/Stage.ts');
      if (!webglAvailable()) return fallback();
      const { GarageView } = await import('../../render3d/GarageView.ts');
      if (this.disposed) return;
      const g = new GarageView(stage, settings.current.quality, session.livery as never);
      g.reduceMotion = settings.reduceMotion;
      g.start();
      this.garage = g as unknown as MainMenu['garage'];
    } catch {
      fallback();
    }
  }

  // ------------------------------------------------------------------ modals
  private openModal(html: string): HTMLElement {
    this.closeModal();
    const m = document.createElement('div');
    m.className = 'modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = `<div class="modal__card">${html}<div style="margin-top:18px"><button class="hud__btn hud__btn--primary" data-close>Close</button></div></div>`;
    m.addEventListener('click', (e) => {
      if (e.target === m || (e.target as HTMLElement).hasAttribute('data-close')) this.closeModal();
    });
    this.el.appendChild(m);
    (m.querySelector('[data-close]') as HTMLElement).focus();
    this.modal = m;
    return m;
  }

  private closeModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  private openSettings(): void {
    const s = settings.current;
    const seg = <T extends string>(key: string, opts: Array<[T, string]>, cur: T): string =>
      `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
    const m = this.openModal(`<h2>Settings</h2>
      <div class="modal__row"><div>Graphics quality<small>Resolution, shadows and bloom. Lowers itself if frames run slow.</small></div>${seg<Quality>('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality)}</div>
      <div class="modal__row"><div>Renderer<small>Switch to 2D if 3D is slow or unavailable.</small></div>${seg<RendererMode>('renderer', [['3d', '3D'], ['2d', '2D']], s.renderer)}</div>
      <div class="modal__row"><div>Reduce motion<small>Stops camera drift, shake and spinning.</small></div>${seg<string>('reducedMotion', [['false', 'Off'], ['true', 'On']], String(s.reducedMotion))}</div>`);
    m.querySelectorAll<HTMLElement>('.seg').forEach((grp) => {
      grp.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
        if (!b) return;
        grp.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        const key = grp.dataset['key']!;
        const v = b.dataset['v']!;
        settings.set({ [key]: key === 'reducedMotion' ? v === 'true' : v } as never);
        if (this.garage) this.garage.reduceMotion = settings.reduceMotion;
      });
    });
  }

  private openHelp(): void {
    this.openModal(`<h2>How it works</h2>
      <p>Four cars race a graph-based circuit. Every route is chosen by Dijkstra over distance, time, fuel and risk, with checkpoints visited in order.</p>
      <ul>
        <li><kbd>N</kbd> or <kbd>Space</kbd> fires a nitro charge: 1.5× speed, double fuel on that stretch.</li>
        <li><kbd>C</kbd> cycles cameras, <kbd>1</kbd>–<kbd>4</kbd> pick one, <kbd>P</kbd> pauses.</li>
        <li>Live events close roads, spill oil and cap speed, so racers recompute their route mid-race.</li>
        <li>Finished races feed the Championship, which ranks drivers with Merge, Quick and Heap sort.</li>
        <li>The Track explorer and Algorithm lab replay the real algorithms step by step.</li>
      </ul>`);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKey);
    this.garage?.dispose();
    this.el.remove();
  }
}
