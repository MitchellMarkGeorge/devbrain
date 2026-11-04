import { clsx, type ClassValue } from 'clsx';

/** Joins class names, skipping falsy values: `cn(styles.root, active && styles.active, className)`. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Joins a component's own classes with a Base UI `className` prop, which may be a function of the
 * part's state.
 */
export function mergeClassName<State>(
  own: string,
  className: string | ((state: State) => string | undefined) | undefined,
): string | ((state: State) => string) {
  if (typeof className === 'function') return (state: State) => cn(own, className(state));
  return cn(own, className);
}
