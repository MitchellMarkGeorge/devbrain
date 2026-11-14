import { SWATCHES, type Swatch } from '@renderer/components';

// Workspaces keep their colour as #rrggbb (WorkspaceInfo.color); the design system draws the six
// swatches. A colour picked in DevBrain is one of the swatches' own; any other (a workspace from
// before, or recovered grey) is drawn as the nearest swatch.

/** Each swatch's colour as stored, the 500 step of its palette (tokens.css). */
export const SWATCH_HEX: Readonly<Record<Swatch, string>> = {
  red: '#fb2c36',
  amber: '#fe9a00',
  green: '#00bc7d',
  blue: '#2b7fff',
  indigo: '#615fff',
  pink: '#f6339a',
};

function rgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return match ? ([1, 2, 3].map((i) => parseInt(match[i], 16)) as [number, number, number]) : null;
}

/** The swatch a stored colour is drawn as: its own, else the nearest; blue for no colour. */
export function swatchOf(hex: string | null | undefined): Swatch {
  const color = hex ? rgb(hex) : null;
  if (color === null) return 'blue';
  let best: Swatch = 'blue';
  let bestDistance = Infinity;
  for (const swatch of SWATCHES) {
    const [r, g, b] = rgb(SWATCH_HEX[swatch])!;
    const distance = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (distance < bestDistance) {
      best = swatch;
      bestDistance = distance;
    }
  }
  return best;
}
