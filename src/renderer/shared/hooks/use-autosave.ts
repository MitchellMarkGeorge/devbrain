import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
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

// An editor's latest save, as stored, and how many it has made. Written as it saves, outside any
// render; a render only reads it.
class SaveLog {
  count = 0;
  text = '';

  record(text: string): void {
    this.count += 1;
    this.text = text;
  }
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
 * So the hook holds one text: the latest it saved, or the one it was last given. When `remote`
 * differs from it, the text changed from outside: `value` follows it and `revision` is bumped,
 * which makes the editor load `value` even when the string is the one it was last given (a
 * reattach restoring the provider's description). Pass `value`, `revision` and `onChange` to the
 * editor.
 */
export function useEditorAutosave(
  queryKey: QueryKey,
  remote: string,
  save: (text: string) => string | void,
  delay?: number,
): { value: string; revision: number; onChange: (text: string) => void; flush: () => void } {
  const queryClient = useQueryClient();
  const [saves] = useState(() => new SaveLog());
  // the text given to the editor, and the number of saves made before it was
  const [followed, setFollowed] = useState({ value: remote, revision: 0, saves: 0 });

  // what the editor holds, as far as the hook knows: its latest save, unless it was given a text
  // since
  const held = saves.count > followed.saves ? saves.text : followed.value;
  if (remote !== held) {
    // React draws again at once, before this render's output is used
    setFollowed({ value: remote, revision: followed.revision + 1, saves: saves.count });
  }

  const { schedule, flush } = useAutosave((text: string) => {
    const stored = save(text) ?? text;
    // before the cache: a render that sees the save there sees it here too
    saves.record(stored);
    storeContent(queryClient, queryKey, stored);
  }, delay);
  return { value: followed.value, revision: followed.revision, onChange: schedule, flush };
}
