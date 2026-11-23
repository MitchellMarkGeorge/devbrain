import { useCallback, useEffect, useRef, useState } from 'react';
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
 * An editor's text saved as it is typed, without the save's own refetch overwriting what was
 * typed since. `remote` is the text as the cache holds it (a note's `notes.readContent`, a task's
 * `description`), which a save refetches: by the time that answer arrives the user may have typed
 * more, and handing it to the editor would put the older text back.
 *
 * So `value` (what the editor is given) follows `remote` only on a change from elsewhere (the file
 * edited on disk, a sync, a reattach, another window): a text this editor didn't save, and not
 * the one it holds, as far as the hook knows (its latest save, or the text it was last given).
 * Its own saves coming back leave `value` alone, and the editor keeps what it holds. Following one
 * bumps `revision`, which makes the editor take `value` even when the string is the one it was
 * last given (a reattach restoring the provider's description). Pass `value`, `revision` and
 * `onChange` to the editor. A `save` that stores the text in another form (a blank description as
 * none) returns that form, so it is known as its own when it comes back.
 *
 * It remembers only the saves still on their way back, not every text it ever saved: when one
 * comes back, the older ones go, as a newer refetch cancels the one before it (React Query's
 * `invalidateQueries`), so an older save can't come back after a newer one.
 */
export function useEditorAutosave(
  remote: string,
  save: (text: string) => string | void,
  delay?: number,
): { value: string; revision: number; onChange: (text: string) => void; flush: () => void } {
  // this editor's saves since `value` last followed `remote`, oldest first, each as typed and as
  // stored; trimmed as they come back, so it holds the one or two still on their way
  const [saves] = useState<string[][]>(() => []);
  const [followed, setFollowed] = useState({ value: remote, revision: 0 });

  const own = saves.findIndex((texts) => texts.includes(remote));
  if (own >= 0) {
    // its own save coming back: the older ones can no longer come back
    saves.splice(0, own);
  } else if (remote !== (saves.at(-1)?.[0] ?? followed.value)) {
    // a change from elsewhere, compared with what the editor holds: its latest save, or the text
    // it was last given
    saves.splice(0);
    setFollowed(({ revision }) => ({ value: remote, revision: revision + 1 }));
  }

  const { schedule, flush } = useAutosave((text: string) => {
    const stored = save(text);
    saves.push(stored === undefined || stored === text ? [text] : [text, stored]);
  }, delay);
  return { value: followed.value, revision: followed.revision, onChange: schedule, flush };
}
