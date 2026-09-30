/** "#RRGGBB" colour maths for tenant brand colours: theme variables and WCAG contrast checks. */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type Rgb = readonly [number, number, number];

export const WHITE: Rgb = [255, 255, 255];
export const BLACK: Rgb = [0, 0, 0];

/** WCAG 2.x AA minimums: body text, and large (≥ 24px, or ≥ 18.66px bold) text. */
export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;

export function isHexColor(value: string | undefined): value is string {
  return !!value && HEX_COLOR.test(value);
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Mixes `rgb` toward `other` in sRGB — the same maths as CSS `color-mix(in srgb, rgb weight, other)`. */
export function mixRgb(rgb: Rgb, other: Rgb, weight: number): Rgb {
  return rgb.map((c, i) => Math.round(c * weight + other[i] * (1 - weight))) as unknown as Rgb;
}

/** Space-separated "H S% L%", the format the theme's CSS variables (`hsl(var(--primary))`) use. */
export function rgbToHslTriplet([r, g, b]: Rgb): string {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or black — whichever reads better on `background` (at least 4.5:1 for every colour). */
export function readableOn(background: Rgb): Rgb {
  return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? WHITE : BLACK;
}
