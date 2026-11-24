import { Color } from 'three';
import { tok } from '../render/tokens.ts';

/** Brand colours read from the CSS design tokens (single source of truth: tokens.css). */
export interface Theme {
  bg: Color;
  bg2: Color;
  lime: Color;
  cyan: Color;
  nitro: Color;
  warning: Color;
  danger: Color;
  text: Color;
  /** CSS strings, for canvas textures. */
  css: { lime: string; cyan: string; nitro: string; warning: string; danger: string; text: string; bg: string; bg2: string };
}

export function readTheme(): Theme {
  const css = {
    lime: tok('--lime'),
    cyan: tok('--cyan'),
    nitro: tok('--nitro'),
    warning: tok('--warning'),
    danger: tok('--danger'),
    text: tok('--ink'),
    bg: tok('--bg'),
    bg2: tok('--bg-2'),
  };
  return {
    bg: new Color(css.bg),
    bg2: new Color(css.bg2),
    lime: new Color(css.lime),
    cyan: new Color(css.cyan),
    nitro: new Color(css.nitro),
    warning: new Color(css.warning),
    danger: new Color(css.danger),
    text: new Color(css.text),
    css,
  };
}
