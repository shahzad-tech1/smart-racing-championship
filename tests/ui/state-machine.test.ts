import { describe, it, expect, vi } from 'vitest';
import { AppStateMachine, type Screen } from '../../src/state/AppState.ts';

describe('AppStateMachine', () => {
  it('starts on MainMenu', () => {
    const app = new AppStateMachine();
    expect(app.current.screen).toBe('MainMenu');
  });

  it('navigates to TrackExplorer', () => {
    const app = new AppStateMachine();
    app.navigate('TrackExplorer');
    expect(app.current.screen).toBe('TrackExplorer');
  });

  it('allows navigating to all screens', () => {
    const app = new AppStateMachine();
    const screens: Screen[] = ['MainMenu', 'TrackExplorer', 'Racing', 'Dashboard', 'AlgorithmLab'];
    for (const s of screens) {
      app.navigate(s);
      expect(app.current.screen).toBe(s);
    }
  });

  it('calls subscribers on navigate', () => {
    const app = new AppStateMachine();
    const cb = vi.fn();
    app.subscribe(cb);
    app.navigate('Racing');
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0].screen).toBe('Racing');
  });

  it('unsubscribes correctly', () => {
    const app = new AppStateMachine();
    const cb = vi.fn();
    const unsub = app.subscribe(cb);
    unsub();
    app.navigate('Dashboard');
    expect(cb).not.toHaveBeenCalled();
  });

  it('propagates state patch', () => {
    const app = new AppStateMachine();
    app.navigate('Racing', { circuitId: 'circuit2' });
    expect(app.current.circuitId).toBe('circuit2');
    expect(app.current.screen).toBe('Racing');
  });

  it('preserves unchanged state fields', () => {
    const app = new AppStateMachine();
    app.navigate('TrackExplorer', { inChampionship: true });
    app.navigate('Racing');
    expect(app.current.inChampionship).toBe(true);
  });
});
