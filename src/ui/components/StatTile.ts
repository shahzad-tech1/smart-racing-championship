export class StatTile {
  readonly el: HTMLElement;
  private _valueEl: HTMLElement;
  private _labelEl: HTMLElement;

  constructor(label: string, value: string) {
    this.el = document.createElement('div');
    this.el.className = 'stat-tile';

    this._labelEl = document.createElement('span');
    this._labelEl.className = 'stat-tile__label';
    this._labelEl.textContent = label;

    this._valueEl = document.createElement('span');
    this._valueEl.className = 'stat-tile__value';
    this._valueEl.textContent = value;

    this.el.appendChild(this._labelEl);
    this.el.appendChild(this._valueEl);
  }

  setValue(value: string): void {
    this._valueEl.textContent = value;
  }

  setLabel(label: string): void {
    this._labelEl.textContent = label;
  }
}
