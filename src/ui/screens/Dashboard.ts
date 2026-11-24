import type { AppStateMachine } from '../../state/AppState.ts';
import { Championship, type SortMethod } from '../../state/Championship.ts';
import type { ChampionshipEntry } from '../../core/types.ts';
import { Button } from '../components/Button.ts';
import { StatTile } from '../components/StatTile.ts';

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds === Infinity) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

export class Dashboard {
  readonly el: HTMLElement;
  private _championship: Championship;
  private _sortMethod: SortMethod = 'merge';
  private _standingsEl!: HTMLElement;
  private _podiumEl!: HTMLElement;
  private _championReveal!: HTMLElement;

  constructor(container: HTMLElement, private app: AppStateMachine) {
    this._championship = new Championship();
    this.el = document.createElement('div');
    this.el.className = 'screen screen--menu';
    this.el.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: var(--paper);
      color: var(--ink);
    `;
    container.appendChild(this.el);
    this._build();
  }

  private _build(): void {
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 1.5rem var(--gutter) 0.75rem;
      border-bottom: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
    `;
    const h1 = document.createElement('h1');
    h1.style.cssText = 'font-size:var(--text-xl);';
    h1.textContent = 'Championship';
    const back = new Button({ label: '← Menu', onClick: () => this.app.navigate('MainMenu') });
    back.el.style.cssText = 'margin-top:0.5rem;font-size:var(--text-xs);min-height:36px;';
    header.append(h1, back.el);
    this.el.appendChild(header);

    // Main layout
    const main = document.createElement('div');
    main.style.cssText = 'flex:1;display:flex;min-height:0;overflow:hidden;';
    this.el.appendChild(main);

    // Left: standings tower
    const leftCol = document.createElement('div');
    leftCol.style.cssText = `
      flex: 1;
      padding: var(--gutter);
      overflow-y: auto;
      border-right: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
    `;
    main.appendChild(leftCol);

    // Right: podium + controls
    const rightCol = document.createElement('div');
    rightCol.style.cssText = `
      width: 280px;
      padding: var(--gutter);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    `;
    main.appendChild(rightCol);

    // Sort controls
    const sortSection = this._buildSortControls();
    leftCol.appendChild(sortSection);

    // Standings table
    this._standingsEl = document.createElement('div');
    this._standingsEl.setAttribute('role', 'table');
    this._standingsEl.setAttribute('aria-label', 'Championship standings');
    leftCol.appendChild(this._standingsEl);

    // Champion reveal area
    this._championReveal = document.createElement('div');
    this._championReveal.style.cssText = 'text-align:center;padding:2rem 0;display:none;';
    leftCol.appendChild(this._championReveal);

    // Podium
    const podiumHead = document.createElement('h2');
    podiumHead.style.cssText = 'font-size:var(--text-md);margin-bottom:var(--gap);';
    podiumHead.textContent = 'Podium';
    this._podiumEl = document.createElement('div');
    rightCol.append(podiumHead, this._podiumEl);

    // Stats
    const statsSection = this._buildStats();
    rightCol.appendChild(statsSection);

    // Demo: add simulated results
    const demoSection = this._buildDemoControls();
    rightCol.appendChild(demoSection);

    this._refresh();
  }

  private _buildSortControls(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--gap);
      margin-bottom: var(--gap-lg);
      flex-wrap: wrap;
    `;

    const label = document.createElement('span');
    label.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
    label.textContent = 'Sort method (all produce identical ranking):';
    wrap.appendChild(label);

    const seg = document.createElement('div');
    seg.className = 'seg-control';

    const methods: Array<{ label: string; value: SortMethod }> = [
      { label: 'Merge sort', value: 'merge' },
      { label: 'Quick sort', value: 'quick' },
      { label: 'Heap sort', value: 'heap' },
    ];

    for (const m of methods) {
      const btn = document.createElement('button');
      btn.className = 'seg-control__btn' + (this._sortMethod === m.value ? ' seg-control__btn--active' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        this._sortMethod = m.value;
        for (const b of seg.querySelectorAll('.seg-control__btn')) b.classList.remove('seg-control__btn--active');
        btn.classList.add('seg-control__btn--active');
        this._refresh();
      });
      seg.appendChild(btn);
    }

    wrap.appendChild(seg);
    return wrap;
  }

  private _buildStats(): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:var(--gap);';
    const h = document.createElement('h2');
    h.style.cssText = 'font-size:var(--text-md);';
    h.textContent = 'Stats';
    section.appendChild(h);
    const tiles = document.createElement('div');
    tiles.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);';
    const racesTile = new StatTile('Races run', '0');
    const circuitsTile = new StatTile('Circuits', '3');
    tiles.append(racesTile.el, circuitsTile.el);
    section.appendChild(tiles);
    return section;
  }

  private _buildDemoControls(): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'margin-top:auto;display:flex;flex-direction:column;gap:var(--gap);';

    const instr = document.createElement('p');
    instr.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
    instr.textContent = 'Add a simulated race result to see standings update.';
    section.appendChild(instr);

    const addBtn = new Button({
      label: 'Simulate race',
      onClick: () => this._simulateRace(),
    });
    const resetBtn = new Button({
      label: 'Reset',
      onClick: () => { this._championship.reset(); this._refresh(); },
    });
    const raceBtn = new Button({
      label: 'Go to race',
      onClick: () => this.app.navigate('Racing'),
      variant: 'primary',
    });

    section.append(addBtn.el, resetBtn.el, raceBtn.el);
    return section;
  }

  private _simulateRace(): void {
    // Generate plausible random results for 4 racers
    const racerIds = [1, 2, 3, 4];
    const times = racerIds.map((id) => ({ id, time: 60 + Math.random() * 40 }));
    times.sort((a, b) => a.time - b.time);
    const results = times.map((t, i) => ({
      raceId: this._championship.raceIndex,
      racerId: t.id,
      finishPosition: i + 1,
      finishTime: t.time,
      fastestLap: t.time / 2 + Math.random() * 5,
      bonusPoints: 0,
      pointsAwarded: 0,
    }));
    this._championship.addRaceResult(results);
    this._refresh();
  }

  private _refresh(): void {
    const standings = this._championship.standings(this._sortMethod);
    this._renderStandings(standings);
    this._renderPodium();

    if (this._championship.finished) {
      this._showChampion();
    } else {
      this._championReveal.style.display = 'none';
    }
  }

  private _renderStandings(standings: ChampionshipEntry[]): void {
    this._standingsEl.innerHTML = '';

    if (standings.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:var(--text-sm);color:var(--ink-2);padding:var(--gutter) 0;';
      empty.textContent = 'No races yet. Simulate a race or go to the race screen.';
      this._standingsEl.appendChild(empty);
      return;
    }

    // Header row
    const header = document.createElement('div');
    header.style.cssText = `
      display: grid;
      grid-template-columns: 1.5rem 1fr repeat(4, auto);
      gap: var(--gap);
      padding: 0.25rem 0;
      font-size: var(--text-xs);
      color: var(--ink-2);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 2px solid var(--ink);
    `;
    header.innerHTML = '<span>#</span><span>Driver</span><span>Pts</span><span>Wins</span><span>Best lap</span><span>Races</span>';
    this._standingsEl.appendChild(header);

    const racerNames: Record<number, string> = { 1: 'Player', 2: 'Speeder', 3: 'Eco', 4: 'Safe' };

    for (let i = 0; i < standings.length; i++) {
      const e = standings[i]!;
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1.5rem 1fr repeat(4, auto);
        gap: var(--gap);
        align-items: baseline;
        padding: 0.375rem 0;
        border-bottom: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
        font-size: var(--text-sm);
        transition: background 0.2s;
      `;
      if (e.racerId === 1) row.style.color = 'var(--signal)';

      const posEl = document.createElement('span');
      posEl.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);color:var(--ink-2);';
      posEl.textContent = String(i + 1);

      const nameEl = document.createElement('span');
      nameEl.style.fontWeight = '500';
      nameEl.textContent = racerNames[e.racerId] ?? `Racer ${e.racerId}`;

      const ptsEl = document.createElement('span');
      ptsEl.style.cssText = 'font-family:var(--font-mono);font-weight:700;text-align:right;';
      ptsEl.textContent = String(e.totalPoints);

      const winsEl = document.createElement('span');
      winsEl.style.cssText = 'font-family:var(--font-mono);text-align:right;';
      winsEl.textContent = String(e.wins);

      const lapEl = document.createElement('span');
      lapEl.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);text-align:right;';
      lapEl.textContent = fmt(e.bestFastestLap);

      const racesEl = document.createElement('span');
      racesEl.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);text-align:right;';
      racesEl.textContent = String(this._championship.raceIndex);

      row.append(posEl, nameEl, ptsEl, winsEl, lapEl, racesEl);
      this._standingsEl.appendChild(row);
    }
  }

  private _renderPodium(): void {
    this._podiumEl.innerHTML = '';
    const top3 = this._championship.topPodium(3);
    if (top3.length === 0) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:var(--text-xs);color:var(--ink-2);';
      p.textContent = 'No results yet.';
      this._podiumEl.appendChild(p);
      return;
    }

    const racerNames: Record<number, string> = { 1: 'Player', 2: 'Speeder', 3: 'Eco', 4: 'Safe' };
    const podiumOrder = [1, 0, 2]; // 2nd-1st-3rd visual arrangement
    const heights = ['4rem', '5.5rem', '3rem'];
    const labels = ['2nd', '1st', '3rd'];

    const podium = document.createElement('div');
    podium.style.cssText = 'display:flex;align-items:flex-end;gap:var(--gap);';

    for (let vi = 0; vi < 3; vi++) {
      const idx = podiumOrder[vi]!;
      const entry = top3[idx];
      if (!entry) continue;

      const col = document.createElement('div');
      col.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--gap-sm);
      `;

      const name = document.createElement('span');
      name.style.cssText = 'font-size:var(--text-xs);font-weight:500;';
      name.textContent = racerNames[entry.racerId] ?? `Racer ${entry.racerId}`;

      const pts = document.createElement('span');
      pts.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);';
      pts.textContent = `${entry.totalPoints} pts`;

      const block = document.createElement('div');
      block.style.cssText = `
        width: 100%;
        height: ${heights[vi]};
        background: ${vi === 1 ? 'var(--signal)' : 'color-mix(in srgb, var(--ink-2) 30%, var(--paper))'};
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 0.25rem;
        font-family: var(--font-display);
        font-size: var(--text-md);
        font-weight: 700;
        color: ${vi === 1 ? 'var(--paper)' : 'var(--ink)'};
      `;
      block.textContent = labels[vi] ?? '';

      col.append(name, pts, block);
      podium.appendChild(col);
    }

    this._podiumEl.appendChild(podium);
  }

  private _showChampion(): void {
    const champion = this._championship.champion;
    if (!champion) return;
    const racerNames: Record<number, string> = { 1: 'Player', 2: 'Speeder', 3: 'Eco', 4: 'Safe' };
    this._championReveal.style.display = 'block';
    this._championReveal.innerHTML = '';

    const title = document.createElement('h2');
    title.style.cssText = 'font-family:var(--font-display);font-size:var(--text-2xl);color:var(--ink);letter-spacing:-0.01em;';
    title.textContent = racerNames[champion.racerId] ?? `Racer ${champion.racerId}`;

    const sub = document.createElement('p');
    sub.style.cssText = 'font-size:var(--text-sm);color:var(--ink-2);margin-top:0.25rem;';
    sub.textContent = 'Championship winner';

    const pts = document.createElement('p');
    pts.style.cssText = 'font-family:var(--font-display);font-size:var(--text-xl);color:var(--signal);margin-top:0.5rem;';
    pts.textContent = `${champion.totalPoints} points`;

    this._championReveal.append(title, sub, pts);
  }

  dispose(): void {
    this.el.remove();
  }
}
