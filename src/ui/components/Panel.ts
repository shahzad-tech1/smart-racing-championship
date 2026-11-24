/** A bordered panel container. */
export class Panel {
  readonly el: HTMLElement;

  constructor(tag: keyof HTMLElementTagNameMap = 'div') {
    this.el = document.createElement(tag);
    this.el.className = 'panel';
  }

  append(...nodes: Array<HTMLElement | string>): void {
    for (const n of nodes) {
      if (typeof n === 'string') {
        this.el.appendChild(document.createTextNode(n));
      } else {
        this.el.appendChild(n);
      }
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
