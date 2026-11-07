import type { Swatch } from '../../components';

// A workspace keeps its colour as #rrggbb (core accepts any). The components draw the six swatches,
// so a new workspace gets a swatch's own colour (the swatch tokens, Tailwind 500), and a stored one
// is drawn as the swatch nearest to it. A colour near none of them (the grey of a recovered
// workspace, one picked elsewhere) gets the neutral tile.

export const SWATCH_HEX: Record<Swatch, string> = {
  red: '#fb2c36',
  amber: '#fe9a00',
  green: '#00bc7d',
  blue: '#2b7fff',
  indigo: '#615fff',
  pink: '#f6339a',
};

// how far (in RGB) a colour may be from a swatch and still be drawn as it
const NEAR = 90;

function rgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return match ? ([1, 2, 3].map((i) => parseInt(match[i], 16)) as [number, number, number]) : null;
}

/** The swatch a workspace's colour is drawn as, or undefined for the neutral tile. */
export function swatchOf(hex: string): Swatch | undefined {
  const color = rgb(hex);
  if (!color) return undefined;
  let nearest: Swatch | undefined;
  let best = NEAR;
  for (const [swatch, swatchHex] of Object.entries(SWATCH_HEX) as [Swatch, string][]) {
    const [r, g, b] = rgb(swatchHex)!;
    const distance = Math.hypot(color[0] - r, color[1] - g, color[2] - b);
    if (distance < best) {
      best = distance;
      nearest = swatch;
    }
  }
  return nearest;
}
