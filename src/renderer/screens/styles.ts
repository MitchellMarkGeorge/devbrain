import type { CSSProperties } from 'react';
import { hexColorSchema } from '@common/color';

// The startup screens' few shared styles. Colours come from index.html's CSS variables, so they
// follow the system's light or dark theme.

export const page: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: '2rem',
  boxSizing: 'border-box',
};

export const card: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

export const errorText: CSSProperties = { color: 'var(--error)', margin: 0 };

export const button: CSSProperties = {
  font: 'inherit',
  padding: '0.5rem 0.9rem',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'inherit',
  cursor: 'pointer',
};

// a workspace's colour as a dot; a colour that isn't #rrggbb is never put in a style
export function swatch(color: string, size = 12): CSSProperties {
  const parsed = hexColorSchema.safeParse(color);
  return {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    background: parsed.success ? parsed.data : 'var(--muted)',
  };
}
