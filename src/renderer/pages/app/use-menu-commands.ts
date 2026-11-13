import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { events } from '../../ipc';
import { useRunCommand } from '../../keyboard';

/**
 * Runs the app menu's commands (the `app.command` event: New Task, New Note, Settings…, Find…,
 * Go to › a page) from the keyboard layer's registry, as their keys would, so the menu and the
 * keys do the same thing. A command sent for another workspace than this window's is dropped: it
 * was picked as this window left it. Called by the workspace layout, where the app-wide commands
 * are registered; main disables these items while no workspace is open.
 */
export function useMenuCommands(): void {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const runCommand = useRunCommand();
  useEffect(
    () =>
      events.on('app.command', ({ command, workspaceId: target }) => {
        if (target === workspaceId) runCommand(command);
      }),
    [workspaceId, runCommand],
  );
}
