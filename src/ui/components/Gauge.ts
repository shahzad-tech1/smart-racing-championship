export class Gauge {
  readonly el: HTMLElement;
  private _fill: HTMLElement;
  private _label: HTMLElement;

  constructor(label: string, value: number, max: number) {
    this.el = document.createElement('div');
    this.el.className = 'gauge';
    this.el.setAttribute('role', 'meter');

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.fontSize = 'var(--text-xs)';
    lbl.style.fontFamily = 'var(--font-ui)';
    lbl.style.minWidth = '2.5rem';

    const track = document.createElement('div');
    track.className = 'gauge__track';

    this._fill = document.createElement('div');
    this._fill.className = 'gauge__fill';

    track.appendChild(this._fill);

    this._label = document.createElement('span');
    this._label.className = 'gauge__label';

    this.el.append(lbl, track, this._label);
    this.setValue(value, max);
  }

  setValue(value: number, max: number): void {
    const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
    this._fill.style.width = `${pct}%`;
    this._label.textContent = `${Math.round(value)}/${Math.round(max)}`;
    this.el.setAttribute('aria-valuenow', String(value));
    this.el.setAttribute('aria-valuemax', String(max));
  }
}
