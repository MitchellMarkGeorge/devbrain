import { useEffect, useRef, useState } from 'react';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import { events as appEvents } from './ipc';
import type { EventClient } from './ipc/events';

/**
 * The workspace being opened, or null: from main's `workspace.changed`, which names it from the
 * start of an open (before the old workspace closes) until it is open or its open has failed.
 * The app shows its splash meanwhile. Any window hears it, whoever started the open: this one,
 * another window, or the menu.
 */
export function useOpeningWorkspace(
  events: EventClient<AppEvents> = appEvents,
): WorkspaceId | null {
  const [opening, setOpening] = useState<WorkspaceId | null>(null);
  useEffect(() => events.on('workspace.changed', (change) => setOpening(change.opening)), [events]);
  return opening;
}

/**
 * True while `active` is, and for at least `minimumMs` from when it became so: a splash for a
 * switch that takes a few milliseconds would only flicker.
 */
export function useHeldFor(active: boolean, minimumMs: number): boolean {
  const [held, setHeld] = useState(active);
  const startedAt = useRef<number | null>(null);
  // holds from the render it turns active in
  if (active && !held) setHeld(true);
  useEffect(() => {
    if (active) {
      startedAt.current ??= Date.now();
      return;
    }
    if (!held) return;
    const left = (startedAt.current ?? 0) + minimumMs - Date.now();
    const timer = setTimeout(
      () => {
        startedAt.current = null;
        setHeld(false);
      },
      Math.max(0, left),
    );
    return () => clearTimeout(timer);
  }, [active, held, minimumMs]);
  return held;
}
