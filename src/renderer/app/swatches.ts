import { hexColorSchema } from '@common/color';
import { SWATCHES, type Swatch } from '../components';

// Core stores a workspace's colour as #rrggbb; the design system draws the six swatches by name.
// A workspace created here gets its swatch's colour (the Tailwind 500 step the `--swatch-*` tokens
// use, docs/design-system/tokens.json); one with any other colour is drawn in the nearest swatch.

export const SWATCH_HEX: Record<Swatch, string> = {
  red: '#fb2c36',
  amber: '#fe9a00',
  green: '#00bc7d',
  blue: '#2b7fff',
  indigo: '#615fff',
  pink: '#f6339a',
};

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** The swatch to draw a stored colour in, or undefined (the neutral tile) for one that isn't hex. */
export function swatchOf(color: string | null | undefined): Swatch | undefined {
  if (!hexColorSchema.safeParse(color).success) return undefined;
  const [r, g, b] = rgb(color as string);
  let nearest: Swatch | undefined;
  let best = Infinity;
  for (const swatch of SWATCHES) {
    const [sr, sg, sb] = rgb(SWATCH_HEX[swatch]);
    const distance = (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2;
    if (distance < best) {
      best = distance;
      nearest = swatch;
    }
  }
  return nearest;
}

/** A provider's or the user's colour, safe to put in a style, or undefined (docs/security). */
export function safeColor(color: string | null | undefined): string | undefined {
  return hexColorSchema.safeParse(color).success ? (color as string) : undefined;
}
