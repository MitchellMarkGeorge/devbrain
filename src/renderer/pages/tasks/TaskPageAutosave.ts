import { useCallback, useEffect, useRef } from 'react';

/**
 * Saves the latest value `delay` ms after the last change, and at once when the component
 * unmounts (leaving the page, closing the dialog), so nothing typed is lost. `save` may change
 * between renders; the latest is used.
 */
export function useAutosave<T>(save: (value: T) => void, delay = 500) {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) latest.current(next.value);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => flush, [flush]);
  return { schedule, flush };
}
