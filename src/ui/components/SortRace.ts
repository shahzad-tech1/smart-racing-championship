import { mergeSort, quickSort, heapSort } from '../../algorithms/sort.ts';
import { recordingTrace, type AlgoStep } from '../../core/instrumentation.ts';
import { makeRng } from '../../core/rng.ts';

type Name = 'Merge sort' | 'Quick sort' | 'Heap sort';

interface Lane {
  name: Name;
  big: string;
  arr: number[];
  steps: AlgoStep[];
  cursor: number;
  comparisons: number;
  total: number;
  hot: Set<number>;
  done: boolean;
}

const N = 28;

function sampleArray(seed: number): number[] {
  const rnd = makeRng(seed);
  return Array.from({ length: N }, () => 8 + Math.floor(rnd() * 92));
}

/**
 * Three sorting algorithms racing on the same SAMPLE array. The array is illustrative, not race data:
 * the bars replay the steps recorded from the real mergeSort / quickSort / heapSort implementations.
 */
export class SortRace {
  readonly el: HTMLElement;
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly lanes: Lane[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private playing = false;
  private seed = 7;
  private btn!: HTMLButtonElement;
  private readonly reduce: boolean;

  constructor(reduceMotion: boolean) {
    this.reduce = reduceMotion;
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span class="hud__label">Sorting race</span>
        <span class="hud__chip" style="padding:2px 8px;border-color:var(--warning);color:var(--warning);font-size:0.72rem;letter-spacing:0.12em">SAMPLE DATA · ${N} values</span>
        <button class="hud__btn hud__btn--primary" data-a="go">Race</button>
        <button class="hud__btn" data-a="new">New sample</button>
      </div>
      <div class="sortrace" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"></div>`;
    const grid = this.el.querySelector('.sortrace') as HTMLElement;
    for (let i = 0; i < 3; i++) {
      const cell = document.createElement('div');
      cell.innerHTML = '<div class="hud__label" data-t style="margin-bottom:4px"></div><canvas width="260" height="110" style="width:100%;height:96px;display:block;background:var(--bg);border:1px solid rgba(255,255,255,0.08)"></canvas><div class="hud__gap" data-c style="margin-top:4px"></div>';
      grid.appendChild(cell);
      this.canvases.push(cell.querySelector('canvas') as HTMLCanvasElement);
    }
    this.btn = this.el.querySelector('[data-a=go]') as HTMLButtonElement;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      if (b.dataset['a'] === 'go') this.toggle();
      else if (b.dataset['a'] === 'new') {
        this.seed += 11;
        this.setup();
      }
    });
    this.setup();
  }

  private setup(): void {
    this.playing = false;
    this.btn.textContent = 'Race';
    const base = sampleArray(this.seed);
    const cmp = (a: number, b: number): number => a - b;
    const defs: Array<[Name, string, (a: number[], t: ReturnType<typeof recordingTrace>) => number[]]> = [
      ['Merge sort', 'O(n log n) · stable', (a, t) => mergeSort(a, cmp, t)],
      ['Quick sort', 'O(n log n) avg · O(n²) worst', (a, t) => quickSort(a, cmp, t)],
      ['Heap sort', 'O(n log n) · in place', (a, t) => heapSort(a, cmp, t)],
    ];
    this.lanes.length = 0;
    for (const [name, big, fn] of defs) {
      const t = recordingTrace();
      const sorted = fn([...base], t);
      void sorted;
      this.lanes.push({ name, big, arr: [...base], steps: t.steps ?? [], cursor: 0, comparisons: 0, total: t.counters.comparisons, hot: new Set(), done: false });
    }
    this.draw();
  }

  private toggle(): void {
    if (this.lanes.every((l) => l.done)) this.setup();
    this.playing = !this.playing;
    this.btn.textContent = this.playing ? 'Pause' : 'Race';
    if (this.playing) {
      this.last = performance.now();
      this.loop();
    } else cancelAnimationFrame(this.raf);
  }

  private loop = (): void => {
    if (!this.playing) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    this.acc += Math.min(0.1, (now - this.last) / 1000) * (this.reduce ? 90 : 40);
    this.last = now;
    while (this.acc >= 1) {
      this.acc -= 1;
      for (const l of this.lanes) this.step(l);
    }
    this.draw();
    if (this.lanes.every((l) => l.done)) {
      this.playing = false;
      this.btn.textContent = 'Race again';
    }
  };

  private step(l: Lane): void {
    l.hot.clear();
    if (l.done) return;
    if (l.cursor >= l.steps.length) {
      l.arr.sort((a, b) => a - b); // display-only: guarantees the final frame is sorted
      l.done = true;
      return;
    }
    const s = l.steps[l.cursor++]!;
    if (s.kind === 'compare') {
      l.comparisons++;
      l.hot.add(s.i).add(s.j);
    } else if (s.kind === 'swap') {
      const a = l.arr[s.i];
      const b = l.arr[s.j];
      if (a !== undefined && b !== undefined) {
        l.arr[s.i] = b;
        l.arr[s.j] = a;
      }
      l.hot.add(s.i).add(s.j);
    } else if (s.kind === 'write' && typeof s.item === 'number') {
      l.arr[s.index] = s.item;
      l.hot.add(s.index);
    }
  }

  private draw(): void {
    const cs = getComputedStyle(document.documentElement);
    const lime = cs.getPropertyValue('--lime').trim();
    const cyan = cs.getPropertyValue('--cyan').trim();
    const ink2 = cs.getPropertyValue('--ink-2').trim();
    this.lanes.forEach((l, i) => {
      const cv = this.canvases[i]!;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const w = cv.width / l.arr.length;
      l.arr.forEach((v, k) => {
        const h = (v / 100) * (cv.height - 6);
        ctx.fillStyle = l.done ? lime : l.hot.has(k) ? cyan : ink2;
        ctx.fillRect(k * w + 1, cv.height - h, w - 2, h);
      });
      const cell = cv.parentElement!;
      (cell.querySelector('[data-t]') as HTMLElement).innerHTML = `${l.name}<br><span style="text-transform:none;letter-spacing:0">${l.big}</span>`;
      (cell.querySelector('[data-c]') as HTMLElement).textContent = `${l.comparisons} / ${l.total} comparisons${l.done ? ' · done' : ''}`;
    });
  }

  dispose(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }
}
