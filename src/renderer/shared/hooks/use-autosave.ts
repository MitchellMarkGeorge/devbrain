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
 * So `value` (what the editor is given) follows `remote` only when it changes to a text this
 * editor never saved: a change from elsewhere (the file edited on disk, a sync, another window).
 * Its own saves coming back leave `value` alone, and the editor keeps what it holds. Pass
 * `onChange` to the editor. A `save` that stores the text in another form (a blank description as
 * none) returns that form, so it is known as its own when it comes back.
 */
export function useEditorAutosave(
  remote: string,
  save: (text: string) => string | void,
  delay?: number,
): { value: string; onChange: (text: string) => void; flush: () => void } {
  // the texts this editor saved since `value` last followed `remote`
  const [saved] = useState(() => new Set<string>());
  const [value, setValue] = useState(remote);
  if (remote !== value && !saved.has(remote)) {
    saved.clear();
    setValue(remote);
  }
  const { schedule, flush } = useAutosave((text: string) => {
    saved.add(text);
    const stored = save(text);
    if (stored !== undefined) saved.add(stored);
  }, delay);
  return { value, onChange: schedule, flush };
}
