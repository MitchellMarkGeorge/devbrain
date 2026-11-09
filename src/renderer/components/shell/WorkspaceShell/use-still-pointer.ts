import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

/**
 * Whether the pointer has stayed still since `mark()`. Hiding the sidebar with its toggle leaves
 * the pointer resting on the window bar's toggle, which appears in the same place under it; the
 * browser calls that pointing at it, which would peek the drawer straight back open. A peek waits
 * for the pointer to move first.
 */
export function useStillPointer(root: RefObject<HTMLElement | null>) {
  // counts the pointer's moves over the shell (the drawer included, which is portalled into it)
  const moves = useRef(0);
  const markedAt = useRef<number | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const moved = () => {
      moves.current += 1;
    };
    element.addEventListener('pointermove', moved, true);
    return () => element.removeEventListener('pointermove', moved, true);
  }, [root]);
  const mark = useCallback(() => {
    markedAt.current = moves.current;
  }, []);
  const still = useCallback(() => markedAt.current === moves.current, []);
  return useMemo(() => ({ mark, still }), [mark, still]);
}
