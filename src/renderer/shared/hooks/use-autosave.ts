import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { loadMarkdown, markdownOf } from '@renderer/editor/RichTextEditor';
import { storeContent } from '@renderer/shared/api/content';
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

  return { schedule, flush };
}

/**
 * An editor's text saved as it is typed. `queryKey` is the editor's content query
 * (`shared/api/content.ts`) and `remote` the text it holds, which changes in only two ways:
 *
 * - a save of this editor: `save` stores the text and returns it as stored, if that differs (a
 *   blank description as `''`), and the hook writes that into the content query itself
 *   (`storeContent`). Core reports the save's entity (`task`, `note`), never `content`, so the
 *   query is not refetched: nothing of the editor's own comes back to it later.
 * - a change from outside the editor (a sync, a reattach), which core reports as `content`, and
 *   the query refetches.
 *
 * The editor is uncontrolled: it starts from `initialValue` and holds its text from then on. The
 * hook keeps one text, its latest save or the last text from outside, and when `remote` differs
 * from it, loads `remote` into the editor (`loadMarkdown`), unless the editor already shows it.
 * Pass `initialValue`, `onReady` and `onChange` to the editor.
 */
export function useEditorAutosave(
  queryKey: QueryKey,
  remote: string,
  save: (text: string) => string | void,
  delay?: number,
): {
  initialValue: string;
  onReady: (editor: Editor) => void;
  onChange: (text: string) => void;
  flush: () => void;
} {
  const queryClient = useQueryClient();
  const [initialValue] = useState(remote);
  const editor = useRef<Editor | null>(null);
  // the latest text saved, or the last one from outside
  const held = useRef(remote);

  // The editor reports itself before this runs, as a child's effects run first: also one made in
  // this very commit (a synced description, left out while empty, that a sync has just filled).
  // One left out since (emptied) is destroyed.
  useEffect(() => {
    if (remote === held.current) return;
    held.current = remote;
    const current = editor.current;
    if (current && !current.isDestroyed && markdownOf(current) !== remote) {
      loadMarkdown(current, remote);
    }
  }, [remote]);

  const onReady = useCallback((instance: Editor) => {
    editor.current = instance;
  }, []);

  const { schedule, flush } = useAutosave((text: string) => {
    const stored = save(text) ?? text;
    // before the cache, so the render that reads the save there finds it held
    held.current = stored;
    storeContent(queryClient, queryKey, stored);
  }, delay);
  return { initialValue, onReady, onChange: schedule, flush };
}
