export class Chip {
  readonly el: HTMLSpanElement;

  constructor(text: string, active = false) {
    this.el = document.createElement('span');
    this.el.className = 'chip' + (active ? ' chip--active' : '');
    this.el.textContent = text;
  }

  setActive(active: boolean): void {
    this.el.classList.toggle('chip--active', active);
  }

  setText(text: string): void {
    this.el.textContent = text;
  }
}
