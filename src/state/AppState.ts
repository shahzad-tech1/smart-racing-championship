export type Screen =
  | 'MainMenu'
  | 'TrackExplorer'
  | 'Racing'
  | 'Dashboard'
  | 'AlgorithmLab';

export interface AppState {
  readonly screen: Screen;
  /** Circuit id selected for the current session ('circuit1' | 'circuit2' | 'circuit3'). */
  readonly circuitId: string;
  /** Whether a championship session is active. */
  readonly inChampionship: boolean;
}

type Listener = (state: AppState) => void;

/** Minimal pub-sub state machine — one active screen at a time. */
export class AppStateMachine {
  private _state: AppState = {
    screen: 'MainMenu',
    circuitId: 'circuit1',
    inChampionship: false,
  };

  private readonly _listeners: Listener[] = [];

  get current(): AppState {
    return this._state;
  }

  navigate(screen: Screen, patch?: Partial<Omit<AppState, 'screen'>>): void {
    this._state = { ...this._state, ...patch, screen };
    for (const l of this._listeners) l(this._state);
  }

  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }
}
