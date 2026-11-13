import { useEffect, useRef, useState, type RefObject } from 'react';

// Focus in the virtualized lists (TaskList, NoteList, ProjectList) when the focused row goes.
// Each list keeps its focused row as an id; these keep it on a row, and on the page, when that
// row's item leaves the list (moved to trash, or a status or move that filters it out).

/**
 * The id of the row that has focus: `wanted` while it is in `ids` (the list's focusable rows, in
 * order), else the row now where it was (the next one, or the last when it was last).
 */
export function useFocusedRowId(
  ids: readonly string[],
  wanted: string | undefined,
): string | undefined {
  const wantedPosition = wanted == null ? -1 : ids.indexOf(wanted);
  const [position, setPosition] = useState(0);
  if (wantedPosition >= 0 && wantedPosition !== position) setPosition(wantedPosition);
  if (wantedPosition >= 0) return wanted;
  return ids.length ? ids[Math.min(position, ids.length - 1)] : undefined;
}

/**
 * Brings focus back to the list when the row holding it unmounts because its item left the list:
 * focus would fall to the page, and the list's keys (a `list` scope, read from the focused
 * element) with it. Call the returned function from a row's ref as it detaches (React detaches it
 * while the row is still in the document). A row only scrolled away keeps its item, so focus is
 * left where the scroll put it.
 */
export function useRefocusOnRemoval({
  listRef,
  rows,
  has,
  focusedId,
  focus,
}: {
  listRef: RefObject<HTMLElement | null>;
  /** the rows drawn now, by id */
  rows: { readonly current: ReadonlyMap<string, HTMLElement> };
  /** whether an id is still in the list */
  has: (id: string) => boolean;
  /** the row that has focus now (`useFocusedRowId`) */
  focusedId: string | undefined;
  /** focuses a row, scrolling it into view first */
  focus: (id: string) => void;
}): (id: string) => void {
  const lost = useRef<string | null>(null);
  useEffect(() => {
    const id = lost.current;
    if (id == null) return;
    lost.current = null;
    // focus that went elsewhere on purpose (a dialog, a menu) stays there
    const active = document.activeElement;
    if (active && active !== document.body) return;
    if (!has(id) && focusedId && listRef.current?.isConnected) focus(focusedId);
  });
  return (id) => {
    if (rows.current.get(id)?.contains(document.activeElement)) lost.current = id;
  };
}
