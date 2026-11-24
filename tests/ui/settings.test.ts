import { describe, it, expect } from 'vitest';
import { parseSettings } from '../../src/state/Settings';

describe('parseSettings', () => {
  it('falls back to defaults for null, junk or hostile input', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{"quality":"ultra","weather":5,"renderer":{}}']) {
      const s = parseSettings(raw as string | null);
      expect(['low', 'medium', 'high']).toContain(s.quality);
      expect(['clear', 'rain']).toContain(s.weather);
      expect(['3d', '2d']).toContain(s.renderer);
      expect(typeof s.reducedMotion).toBe('boolean');
    }
  });
  it('round-trips valid values', () => {
    const s = parseSettings(JSON.stringify({ quality: 'high', weather: 'rain', renderer: '2d', reducedMotion: true }));
    expect(s).toEqual({ quality: 'high', weather: 'rain', renderer: '2d', reducedMotion: true });
  });
});
