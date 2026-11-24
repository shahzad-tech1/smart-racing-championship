import { AppStateMachine, type Screen } from '../state/AppState.ts';

interface Disposable {
  dispose(): void;
}

/** Bootstrap the app: manages screen lifecycle. */
export class App {
  private readonly _state: AppStateMachine;
  private _active: Disposable | null = null;

  constructor(private readonly _root: HTMLElement) {
    this._state = new AppStateMachine();
    this._state.subscribe((s) => this._mount(s.screen));
    this._mount(this._state.current.screen);
  }

  get state(): AppStateMachine {
    return this._state;
  }

  private async _mount(screen: Screen): Promise<void> {
    this._active?.dispose();
    this._active = null;
    this._root.innerHTML = '';

    switch (screen) {
      case 'MainMenu': {
        const { MainMenu } = await import('./screens/MainMenu.ts');
        this._active = new MainMenu(this._root, this._state);
        break;
      }
      case 'TrackExplorer': {
        const { TrackExplorer } = await import('./screens/TrackExplorer.ts');
        this._active = new TrackExplorer(this._root, this._state);
        break;
      }
      case 'Racing': {
        const { Racing } = await import('./screens/Racing.ts');
        this._active = new Racing(this._root, this._state);
        break;
      }
      case 'Dashboard': {
        const { Dashboard } = await import('./screens/Dashboard.ts');
        this._active = new Dashboard(this._root, this._state);
        break;
      }
      case 'AlgorithmLab': {
        const { AlgorithmLab } = await import('./lab/AlgorithmLab.ts');
        this._active = new AlgorithmLab(this._root, this._state);
        break;
      }
      default:
        screen satisfies never;
    }
  }
}
