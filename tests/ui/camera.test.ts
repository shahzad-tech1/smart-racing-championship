import { describe, it, expect } from 'vitest';
import { Camera } from '../../src/render/Camera.ts';

const EPS = 1e-9;
function near(a: number, b: number): boolean { return Math.abs(a - b) < EPS; }

describe('Camera', () => {
  it('world↔screen round-trip is exact', () => {
    const cam = new Camera(100, 200, 2);
    const sw = 800; const sh = 600;
    const wx = 150; const wy = 300;

    const [sx, sy] = cam.worldToScreen(wx, wy, sw, sh);
    const [bx, by] = cam.screenToWorld(sx, sy, sw, sh);

    expect(near(bx, wx)).toBe(true);
    expect(near(by, wy)).toBe(true);
  });

  it('world center maps to screen center', () => {
    const cam = new Camera(100, 200, 1);
    const sw = 800; const sh = 600;
    const [sx, sy] = cam.worldToScreen(100, 200, sw, sh);
    expect(near(sx, sw / 2)).toBe(true);
    expect(near(sy, sh / 2)).toBe(true);
  });

  it('zoom=2 doubles screen distance from center', () => {
    const cam1 = new Camera(0, 0, 1);
    const cam2 = new Camera(0, 0, 2);
    const sw = 100; const sh = 100;
    const [x1] = cam1.worldToScreen(10, 0, sw, sh);
    const [x2] = cam2.worldToScreen(10, 0, sw, sh);
    expect(near(x2 - sw / 2, 2 * (x1 - sw / 2))).toBe(true);
  });

  it('fitBounds centers on bounds midpoint', () => {
    const cam = new Camera();
    cam.fitBounds(0, 0, 200, 100, 800, 600);
    expect(near(cam.cx, 100)).toBe(true);
    expect(near(cam.cy, 50)).toBe(true);
  });

  it('fitBounds produces positive zoom', () => {
    const cam = new Camera();
    cam.fitBounds(0, 0, 400, 300, 800, 600);
    expect(cam.zoom).toBeGreaterThan(0);
  });

  it('pan moves camera center', () => {
    const cam = new Camera(0, 0, 1);
    cam.pan(10, 0);
    // pan by 10 screen pixels at zoom=1 moves camera by 10 world units left
    expect(near(cam.cx, -10)).toBe(true);
  });

  it('screenToWorld → worldToScreen round-trip at zoom != 1', () => {
    const cam = new Camera(50, 80, 3);
    const sw = 500; const sh = 400;
    const sx = 123; const sy = 299;
    const [wx, wy] = cam.screenToWorld(sx, sy, sw, sh);
    const [bsx, bsy] = cam.worldToScreen(wx, wy, sw, sh);
    expect(near(bsx, sx)).toBe(true);
    expect(near(bsy, sy)).toBe(true);
  });
});
