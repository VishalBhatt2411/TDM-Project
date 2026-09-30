import { BLACK, WHITE, contrastRatio, hexToRgb, mixRgb } from "@/lib/color";

/** How much of the brand colour each end of the home-page hero keeps; the rest is black, so white text stays legible. */
const HERO_SHADE = { start: 0.8, end: 0.45 } as const;

/** The hero's background for a CSS colour — `hsl(var(--primary))` on the site, the edited hex in the admin preview. */
export function heroBackground(color: string): string {
  const shade = (weight: number) => `color-mix(in srgb, ${color} ${weight * 100}%, black)`;
  return `linear-gradient(135deg, ${shade(HERO_SHADE.start)}, ${shade(HERO_SHADE.end)})`;
}

/** Contrast of the hero's white text at its lightest point (the gradient's start). */
export function heroTextContrast(primaryColorHex: string): number {
  return contrastRatio(WHITE, mixRgb(hexToRgb(primaryColorHex), BLACK, HERO_SHADE.start));
}
