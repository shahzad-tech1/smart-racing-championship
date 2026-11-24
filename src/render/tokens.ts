/** Read a CSS custom property value from :root at call time. */
export function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
