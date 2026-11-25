import type { DataTag, QueryClient, QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { RichTextEditorHandle } from '@renderer/editor/RichTextEditor';
import { useSwitchingWorkspace } from '@renderer/app/hooks/use-switching-workspace';

// Saving what is typed in an editor (a note's body, a task's description) as it is typed: one save
// `delay` ms after the last change, and at once whenever it could otherwise be lost.

/**
 * Saves the latest value `delay` ms after the last change, and at once when the component
 * unmounts (leaving the page), when the window loses focus, and when a switch to another workspace
 * starts (the page stays mounted under the splash, and a save after the switch would go to the
 * workspace opened next). `save` may change between renders; the latest is used.
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

  useEffect(() => {
    window.addEventListener('blur', flush);
    return () => {
      window.removeEventListener('blur', flush);
      flush();
    };
  }, [flush]);

  const switching = useSwitchingWorkspace();
  useEffect(() => {
    if (switching) flush();
  }, [switching, flush]);

  // whether a change is waiting for its save
  const isPending = useCallback(() => pending.current !== null, []);

  return { schedule, flush, isPending };
}

/**
 * An editor's text saved as it is typed. The editor is uncontrolled: it starts from
 * `initialValue` and holds its text from then on. `remote` is the text as the cache holds it (a
 * task's `description`, a note's markdown). When it changes to a text the editor would not save
 * itself (`markdown()`), the change came from outside (a sync, a reattach) and the hook loads it
 * through the editor's handle (`editor`, its `ref`), unless a change is waiting for its save: that
 * save is written over it.
 *
 * `save` must put the text in the cache `remote` is read from, as it will be stored, before it
 * sends it, and cancel a read of it on its way (`writeSaveToCache`). The editor's own save then
 * reaches `remote` as the text the editor holds, and every read that lands was sent after the
 * latest save, so none answers with a text older than it (docs/editor.md). A save whose text is
 * what the cache already holds is skipped.
 *
 * Pass `initialValue`, `onChange`, and `editor` as its `ref`, to the editor, destructuring what the
 * hook returns: React's lint takes an object one of whose values is passed as a `ref` for a ref.
 */
export function useEditorAutosave(
  remote: string,
  save: (text: string) => void,
  delay?: number,
): {
  initialValue: string;
  editor: RefObject<RichTextEditorHandle>;
  onChange: (text: string) => void;
  flush: () => void;
} {
  const [initialValue] = useState(remote);
  const editor = useRef<RichTextEditorHandle>(null);
  const { schedule, flush, isPending } = useAutosave((text: string) => {
    if (!sameText(text, remote)) save(text);
  }, delay);

  // React sets the editor's handle before it runs effects, so it is there for every change
  useEffect(() => {
    if (isPending()) return;
    const handle = editor.current;
    if (handle && !sameText(handle.markdown(), remote)) handle.load(remote);
  }, [remote, isPending]);

  return { initialValue, editor, onChange: schedule, flush };
}

// a blank text is stored as none (a description) or as it is (a note): the same text either way
function sameText(a: string, b: string): boolean {
  return a === b || (a.trim() === '' && b.trim() === '');
}

/**
 * Puts what an editor is about to save in the cache its text is read from (`update` gives the
 * cached entity with the text as it will be stored), and cancels a read of it on its way, whose
 * answer would be older than the save. Does nothing while the cache has no entity to write to.
 */
export function writeSaveToCache<TData>(
  queryClient: QueryClient,
  queryKey: DataTag<QueryKey, TData, unknown>,
  update: (cached: NoInfer<TData>) => NoInfer<TData>,
): void {
  if (queryClient.getQueryData<TData>(queryKey) === undefined) return;
  queryClient.setQueryData<TData>(queryKey, (cached) =>
    cached === undefined ? undefined : update(cached),
  );
  // cancelled, the query keeps the state of its last write, this one
  void queryClient.cancelQueries({ queryKey, exact: true });
}
