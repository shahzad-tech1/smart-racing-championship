export type TimingStatus = 'reached' | 'unreachable' | 'pending' | 'active' | 'dnf' | 'finished';

export interface TimingRowData {
  position: number;
  name: string;
  time?: string;
  status?: TimingStatus;
}

const STATUS_LABEL: Record<TimingStatus, string> = {
  reached: 'reached',
  unreachable: 'no path',
  pending: '—',
  active: 'racing',
  dnf: 'DNF',
  finished: 'finished',
};

export class TimingRow {
  readonly el: HTMLElement;
  private _posEl: HTMLElement;
  private _nameEl: HTMLElement;
  private _timeEl: HTMLElement;
  private _statusEl: HTMLElement;

  constructor(data: TimingRowData) {
    this.el = document.createElement('div');
    this.el.className = 'timing-row';
    this.el.setAttribute('role', 'row');

    this._posEl = document.createElement('span');
    this._posEl.className = 'timing-row__pos';

    this._nameEl = document.createElement('span');
    this._nameEl.className = 'timing-row__name';

    this._timeEl = document.createElement('span');
    this._timeEl.className = 'timing-row__time mono';

    this._statusEl = document.createElement('span');
    this._statusEl.className = 'timing-row__status';

    this.el.append(this._posEl, this._nameEl, this._timeEl, this._statusEl);
    this.update(data);
  }

  update(data: TimingRowData): void {
    this._posEl.textContent = String(data.position);
    this._nameEl.textContent = data.name;
    this._timeEl.textContent = data.time ?? '—';
    const st = data.status ?? 'pending';
    this._statusEl.textContent = STATUS_LABEL[st];
    this.el.dataset['status'] = st;

    // Colour coding by status (using CSS tokens, never inline hex)
    this._statusEl.style.color =
      st === 'unreachable' || st === 'dnf' ? 'var(--danger)' :
      st === 'reached' || st === 'finished' ? 'var(--sector-pb)' :
      st === 'active' ? 'var(--signal)' :
      'var(--ink-2)';
  }
}
