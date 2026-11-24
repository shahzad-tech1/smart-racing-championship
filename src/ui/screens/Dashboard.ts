import type { AppStateMachine } from '../../state/AppState.ts';
import type { SortMethod } from '../../state/Championship.ts';
import { session, racerName } from '../../state/session.ts';
import { settings } from '../../state/Settings.ts';
import { RaceEngine } from '../../engine/RaceEngine.ts';
import { buildRaceEvents } from '../../data/raceEvents.ts';
import { buildGrid } from '../../data/grid.ts';
import { SortRace } from '../components/SortRace.ts';
import type { PodiumView } from '../../render3d/PodiumView.ts';

function fmt(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

const SORTS: Array<[string, SortMethod]> = [['Merge', 'merge'], ['Quick', 'quick'], ['Heap', 'heap']];

/**
 * Championship: standings from REAL race results (raced on the Racing screen, or simulated headlessly
 * by the same RaceEngine), shown over a 3D podium. Nothing here is random.
 */
export class Dashboard {
  readonly el: HTMLElement;
  private sort: SortMethod = 'merge';
  private podium: PodiumView | null = null;
  private sortRace: SortRace;
  private panel!: HTMLElement;
  private host!: HTMLElement;
  private busy = false;
  private disposed = false;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this.el = document.createElement('div');
    this.el.className = 'screen';
    this.el.style.cssText = 'height:100%;';
    container.appendChild(this.el);
    this.el.innerHTML = `<div class="stage3d"><div class="stage3d__canvas"></div><div class="hud"></div></div>`;
    this.host = this.el.querySelector('.stage3d__canvas') as HTMLElement;
    const hud = this.el.querySelector('.hud') as HTMLElement;
    hud.innerHTML = `<div class="hud__top"><div class="hud__interactive"><button class="hud__btn" data-a="menu">← Menu</button></div></div>`;
    this.panel = document.createElement('div');
    this.panel.className = 'hud__chip hud__interactive';
    this.panel.style.cssText = 'position:absolute;left:16px;top:60px;bottom:16px;width:min(560px,56%);overflow:auto;pointer-events:auto;background:rgba(9,11,13,0.86);padding:16px 18px;';
    hud.appendChild(this.panel);
    this.sortRace = new SortRace(settings.reduceMotion);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-a=menu]')) this.app.navigate('MainMenu');
    });
    this.render();
    void this.mount3d();
  }

  private async mount3d(): Promise<void> {
    if (settings.current.renderer === '2d') return;
    try {
      const { webglAvailable } = await import('../../render3d/Stage.ts');
      if (!webglAvailable()) return;
      const { PodiumView } = await import('../../render3d/PodiumView.ts');
      if (this.disposed) return;
      const v = new PodiumView(this.host, settings.current.quality);
      v.reduceMotion = settings.reduceMotion;
      v.start();
      this.podium = v;
      this.syncPodium();
    } catch {
      /* the standings table works without the 3D scene */
    }
  }

  private syncPodium(): void {
    const c = session.championship;
    const top = c.topPodium(3).map((e) => ({ id: e.racerId, name: racerName(e.racerId), points: e.totalPoints }));
    this.podium?.setStandings(top, c.finished);
  }

  /** Run the next circuit headlessly with the real engine (same grid and events as the Racing screen). */
  private simulate(): void {
    const c = session.championship;
    if (this.busy || c.finished) return;
    this.busy = true;
    this.render();
    // let the "running" state paint before the (synchronous) engine run
    setTimeout(() => {
      const def = c.circuits[c.raceIndex]!;
      const graph = def.build();
      const meta = def.meta;
      const engine = new RaceEngine(
        graph,
        buildGrid(meta.startVertex),
        { startVertex: meta.startVertex, finishVertex: meta.finishVertex, checkpointOrder: [...meta.checkpointOrder], laps: meta.laps },
        buildRaceEvents(graph, meta),
      );
      engine.run();
      c.addRaceResult(engine.results(c.raceIndex));
      this.busy = false;
      this.render();
      this.syncPodium();
    }, 30);
  }

  private render(): void {
    const c = session.championship;
    const standings = c.standings(this.sort);
    const next = c.finished ? null : c.circuits[c.raceIndex]!;
    const champ = c.champion;
    const rows = standings
      .map((e, i) => `<tr class="${e.racerId === 1 ? 'me' : ''}"><td class="hud__num">${i + 1}</td><td>${racerName(e.racerId)}</td><td class="hud__num">${e.totalPoints}</td><td>${e.wins}</td><td>${fmt(e.bestFastestLap)}</td></tr>`)
      .join('');
    this.panel.innerHTML = `
      <div class="hud__label">${c.finished ? 'Season complete' : `Race ${c.raceIndex + 1} of ${c.raceCount}${next ? ` · ${next.meta.name}` : ''}`}</div>
      <h2 class="hud__num" style="font-size:2.6rem;margin:2px 0 12px;line-height:1">${champ ? `${racerName(champ.racerId)} wins` : 'Championship'}</h2>
      ${standings.length ? `<table style="width:100%;border-collapse:collapse">
        <thead><tr class="hud__label"><th style="text-align:left;padding:6px 8px">#</th><th style="text-align:left">Driver</th><th style="text-align:left">Pts</th><th style="text-align:left">Wins</th><th style="text-align:left">Best lap</th></tr></thead>
        <tbody class="dash__rows">${rows}</tbody></table>`
        : '<p style="color:var(--ink-2)">No races yet. Race a circuit yourself, or simulate it: both use the same engine and produce real results.</p>'}
      <div class="hud__label" style="margin:14px 0 6px">Ranking algorithm</div>
      <div class="seg" data-key="sort">${SORTS.map(([l, v]) => `<button type="button" data-v="${v}" aria-pressed="${v === this.sort}">${l} sort</button>`).join('')}</div>
      <p style="color:var(--ink-2);font-size:0.85rem;margin:6px 0 14px">All three produce the identical order. The podium picks its top 3 with a size-3 heap (Top-K).</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
        <button class="hud__btn hud__btn--primary" data-a="race" ${c.finished ? 'disabled' : ''}>Race ${next ? next.meta.name : ''}</button>
        <button class="hud__btn" data-a="sim" ${c.finished || this.busy ? 'disabled' : ''}>${this.busy ? 'Simulating…' : 'Simulate race'}</button>
        <button class="hud__btn" data-a="reset">Reset season</button>
      </div>
      <div data-slot="sortrace"></div>`;
    (this.panel.querySelector('[data-slot=sortrace]') as HTMLElement).appendChild(this.sortRace.el);
    this.panel.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b || b.closest('[data-slot=sortrace]')) return;
      if (b.closest('[data-key=sort]')) {
        this.sort = b.dataset['v'] as SortMethod;
        this.render();
      } else if (b.dataset['a'] === 'race') this.app.navigate('Racing');
      else if (b.dataset['a'] === 'sim') this.simulate();
      else if (b.dataset['a'] === 'reset') {
        session.reset();
        this.render();
        this.syncPodium();
      }
    };
  }

  dispose(): void {
    this.disposed = true;
    this.sortRace.dispose();
    this.podium?.dispose();
    this.el.remove();
  }
}
