/** 2D camera: pan + zoom with world↔screen transforms. */
export class Camera {
  cx: number;
  cy: number;
  zoom: number;

  constructor(cx = 0, cy = 0, zoom = 1) {
    this.cx = cx;
    this.cy = cy;
    this.zoom = zoom;
  }

  worldToScreen(wx: number, wy: number, sw: number, sh: number): [number, number] {
    return [
      (wx - this.cx) * this.zoom + sw / 2,
      (wy - this.cy) * this.zoom + sh / 2,
    ];
  }

  screenToWorld(sx: number, sy: number, sw: number, sh: number): [number, number] {
    return [
      (sx - sw / 2) / this.zoom + this.cx,
      (sy - sh / 2) / this.zoom + this.cy,
    ];
  }

  /** Fit a world bounding box into the given screen dimensions with a margin factor. */
  fitBounds(
    minX: number, minY: number,
    maxX: number, maxY: number,
    sw: number, sh: number,
    margin = 0.85,
  ): void {
    this.cx = (minX + maxX) / 2;
    this.cy = (minY + maxY) / 2;
    const ww = maxX - minX || 1;
    const wh = maxY - minY || 1;
    this.zoom = Math.min(sw / ww, sh / wh) * margin;
  }

  pan(dsx: number, dsy: number): void {
    this.cx -= dsx / this.zoom;
    this.cy -= dsy / this.zoom;
  }

  zoomAt(sx: number, sy: number, factor: number, sw: number, sh: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy, sw, sh);
    this.zoom *= factor;
    const [nx, ny] = this.worldToScreen(wx, wy, sw, sh);
    this.cx -= (nx - sx) / this.zoom;
    this.cy -= (ny - sy) / this.zoom;
  }
}
