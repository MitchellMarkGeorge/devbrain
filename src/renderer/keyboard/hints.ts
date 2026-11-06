import type { RefObject } from 'react';

/**
 * Registers an element for Vim's `f` hints: the label drawn over it and what typing the label
 * does. A no-op until Vim mode exists; rows, pills and buttons call it as they are built, which is
 * cheaper than retrofitting them.
 */
export function useHintTarget(ref: RefObject<HTMLElement | null>, action: () => void): void {
  void ref;
  void action;
}
