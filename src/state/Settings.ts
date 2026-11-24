/**
 * src/state/Settings.ts — persisted presentation settings (quality, weather, motion, renderer).
 * Pure presentation: nothing here is read by the engine or algorithms.
 */

export type Quality = 'low' | 'medium' | 'high';
export type Weather = 'clear' | 'rain';
export type RendererMode = '3d' | '2d';

export interface SettingsData {
  quality: Quality;
  weather: Weather;
  renderer: RendererMode;
  /** User override; the OS `prefers-reduced-motion` setting always wins when it is on. */
  reducedMotion: boolean;
}

const KEY = 'src.settings.v1';
const DEFAULTS: SettingsData = { quality: 'medium', weather: 'clear', renderer: '3d', reducedMotion: false };

type Listener = (s: SettingsData) => void;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function parseSettings(raw: string | null): SettingsData {
  if (!raw) return { ...DEFAULTS };
  try {
    const o = JSON.parse(raw) as Partial<SettingsData>;
    return {
      quality: o.quality === 'low' || o.quality === 'high' ? o.quality : 'medium',
      weather: o.weather === 'rain' ? 'rain' : 'clear',
      renderer: o.renderer === '2d' ? '2d' : '3d',
      reducedMotion: o.reducedMotion === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

class SettingsStore {
  private data: SettingsData;
  private readonly listeners: Listener[] = [];

  constructor() {
    this.data = parseSettings(safeStorage()?.getItem(KEY) ?? null);
  }

  get current(): SettingsData {
    return this.data;
  }

  /** True when motion should be minimised (OS preference or the in-game toggle). */
  get reduceMotion(): boolean {
    const os = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return os || this.data.reducedMotion;
  }

  set(patch: Partial<SettingsData>): void {
    this.data = { ...this.data, ...patch };
    try {
      safeStorage()?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage can throw in private contexts — settings then live in memory only */
    }
    for (const l of this.listeners) l(this.data);
  }

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      const i = this.listeners.indexOf(l);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }
}

export const settings = new SettingsStore();
