/** The 4px spacing scale (`--space-*` tokens) that layout props take. */
export const SPACE = ['0', '0.5', '1', '1.5', '2', '3', '4', '6', '8', '12', '16'] as const;
export type Space = (typeof SPACE)[number];

/** `'1.5'` → `var(--space-1-5)` */
export function spaceVar(space: Space): string {
  return space === '0' ? '0' : `var(--space-${space.replace('.', '-')})`;
}
