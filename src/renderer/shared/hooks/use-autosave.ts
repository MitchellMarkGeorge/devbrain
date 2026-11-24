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
 * task's `description`, a note's markdown); when it changes from outside the editor (a sync, a
 * reattach), the hook loads it into the editor through its handle (`editor`, its `ref`).
 *
 * The cache also changes for the editor's own saves: a save makes core report its entity changed,
 * and the query is refetched (a note's markdown is the exception: its editor writes its saves
 * into the cache, and nothing refetches it). So the hook follows `remote` only while no save is
 * waiting or on its way, and looks once more when the last one lands. A save settles only once
 * the refetches it caused have landed (the IPC link waits for them), so by then the cache holds
 * the latest save, or a change made from outside since: a refetch of an older save arrives
 * while a newer one is still on its way, and is never taken. It follows a text that differs from
 * its latest save (`stored`, the text as `save` stores it: a blank description as `''`), and
 * loads it unless the editor already shows it.
 *
 * `save` returns the promise of the save, if it saves: until it settles, `remote` is not followed.
 * Pass `initialValue`, `onChange`, and `editor` as its `ref`, to the editor, destructuring what the
 * hook returns: React's lint takes an object one of whose values is passed as a `ref` for a ref.
 */
export function useEditorAutosave(
  remote: string,
  save: (text: string) => Promise<unknown> | void,
  options: { delay?: number; stored?: (text: string) => string } = {},
): {
  initialValue: string;
  editor: RefObject<RichTextEditorHandle>;
  onChange: (text: string) => void;
  flush: () => void;
} {
  const [initialValue] = useState(remote);
  const editor = useRef<RichTextEditorHandle>(null);
  // the latest text saved, as stored, or the last one followed from outside
  const held = useRef(remote);
  // `remote` as of the last render, for the look once a save lands
  const latest = useRef(remote);
  const saving = useRef(0);
  const stored = useRef(options.stored);
  useEffect(() => {
    stored.current = options.stored;
  });

  // whether a change is waiting for its save: the timer's, once useAutosave below has made it
  const isPending = useRef<() => boolean>(() => false);

  // follows the cache's text, while nothing of the editor's own is waiting or on its way
  const follow = useCallback(() => {
    const text = latest.current;
    if (saving.current > 0 || isPending.current() || text === held.current) return;
    held.current = text;
    if (editor.current && editor.current.markdown() !== text) editor.current.load(text);
  }, []);

  const autosave = useAutosave((text: string) => {
    held.current = stored.current ? stored.current(text) : text;
    const saved = save(text);
    if (!saved) return;
    saving.current += 1;
    // looked at once the editor has been drawn with what the cache now holds: React Query tells
    // the components of a change on a zero-delay timer (its notifyManager), so a save that
    // settles first would be compared with the text from before it
    const settled = () => {
      saving.current -= 1;
      setTimeout(follow, 0);
    };
    saved.then(settled, settled);
  }, options.delay);
  useEffect(() => {
    isPending.current = autosave.isPending;
  });

  // React sets the editor's handle before it runs effects, so it is there for every change
  useEffect(() => {
    latest.current = remote;
    follow();
  });

  return { initialValue, editor, onChange: autosave.schedule, flush: autosave.flush };
}
