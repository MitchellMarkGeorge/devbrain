import { useCallback, useEffect, useRef } from 'react';

/**
 * A function saying whether the component is still mounted, for a call's `catch`: a workspace open
 * that started unmounts the part of the window that asked (the splash replaces it), and its
 * failure then shows from the workspace state instead.
 */
export function useMounted(): () => boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
