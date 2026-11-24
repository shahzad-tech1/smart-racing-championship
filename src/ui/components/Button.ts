export type ButtonVariant = 'default' | 'primary' | 'ghost';

export interface ButtonOpts {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  ariaLabel?: string;
}

export class Button {
  readonly el: HTMLButtonElement;
  private _onClick: () => void;

  constructor(opts: ButtonOpts) {
    this.el = document.createElement('button');
    this._onClick = opts.onClick;
    this.el.textContent = opts.label;
    this.el.className = 'btn' + (opts.variant === 'primary' ? ' btn--primary' : '');
    this.el.disabled = opts.disabled ?? false;
    if (opts.ariaLabel) this.el.setAttribute('aria-label', opts.ariaLabel);
    this.el.addEventListener('click', () => this._onClick());
  }

  setLabel(label: string): void {
    this.el.textContent = label;
  }

  setDisabled(disabled: boolean): void {
    this.el.disabled = disabled;
  }

  dispose(): void {
    this.el.remove();
  }
}
