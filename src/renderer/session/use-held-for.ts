import { useEffect, useRef, useState } from 'react';

/**
 * True while `active` is, and for at least `minimumMs` from when it became so: a splash for a
 * switch that takes a few milliseconds would only flicker.
 */
export function useHeldFor(active: boolean, minimumMs: number): boolean {
  const [held, setHeld] = useState(active);
  const startedAt = useRef<number | null>(null);
  // holds from the render it turns active in
  if (active && !held) setHeld(true);
  useEffect(() => {
    if (active) {
      startedAt.current ??= Date.now();
      return;
    }
    if (!held) return;
    const left = (startedAt.current ?? 0) + minimumMs - Date.now();
    const timer = setTimeout(
      () => {
        startedAt.current = null;
        setHeld(false);
      },
      Math.max(0, left),
    );
    return () => clearTimeout(timer);
  }, [active, held, minimumMs]);
  return held;
}
