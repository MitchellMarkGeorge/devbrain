import { useEffect, useState } from 'react';

/**
 * How long typing pauses before a search is asked for (⌘K and the pickers). Long enough that
 * results change when the user stops, not mid-word at a normal typing speed (a key every
 * 150–250ms); a search itself takes a few milliseconds.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/** `value`, once it has stayed the same for `ms`. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
