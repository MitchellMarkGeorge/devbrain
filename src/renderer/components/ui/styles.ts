import styles from './ui.module.css';

/** Resolve reference class hooks through CSS Modules; caller classes stay untouched. */
export function ui(...names: (string | false | undefined)[]) {
  return names
    .filter(Boolean)
    .map((name) => styles[name as string] ?? name)
    .join(' ');
}
export function cx(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(' ');
}
export const colorValue = (color?: string) =>
  color &&
  (['red', 'amber', 'green', 'blue', 'indigo', 'pink'].includes(color)
    ? `var(--swatch-${color})`
    : color);
export const percent = (value: number, total = 100) =>
  total > 0 && Number.isFinite(value) && Number.isFinite(total)
    ? Math.min(100, Math.max(0, (value / total) * 100))
    : 0;
