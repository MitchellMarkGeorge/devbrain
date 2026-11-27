import type { MouseEvent } from 'react';

const CONTROL = 'button, a, [role="checkbox"], input';

/**
 * Whether a click on a clickable container (a list row, a board card) came from one of its own
 * controls rather than the container itself, so that it should not open the item: a button,
 * link, checkbox or input inside it (its status button, its pills), or anything it opened and
 * portalled elsewhere in the page (a menu, a date picker, a context menu), whose clicks React
 * still bubbles up to it. Its controls then need no `stopPropagation`.
 *
 * `if (!isFromNestedControl(event)) onOpen();`
 */
export function isFromNestedControl(event: MouseEvent<HTMLElement>): boolean {
  if (!event.currentTarget.contains(event.target as Node)) return true;
  const control = (event.target as Element).closest(CONTROL);
  return control != null && control !== event.currentTarget;
}
