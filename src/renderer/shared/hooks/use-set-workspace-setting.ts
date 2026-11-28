import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkspaceInfo } from '@common/types';
import { ipc, trpc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';

/** One write `workspace.setSetting` takes: a dot path into its settings and a value of its type. */
export type WorkspaceSettingUpdate = Parameters<typeof ipc.workspace.setSetting.mutate>[0];

/** The workspace with the value at `path` ('calendar.showTasks') of its settings replaced. */
export function withWorkspaceSetting(
  workspace: WorkspaceInfo,
  { path, value }: WorkspaceSettingUpdate,
): WorkspaceInfo {
  const keys = path.split('.');
  const write = (node: unknown, index: number): unknown => {
    if (index === keys.length) return value;
    const record = (node ?? {}) as Record<string, unknown>;
    return { ...record, [keys[index]]: write(record[keys[index]], index + 1) };
  };
  return { ...workspace, settings: write(workspace.settings, 0) as WorkspaceInfo['settings'] };
}

/**
 * Writes one of the open workspace's own settings (the calendar's "Tasks" filter) through `workspace.setSetting`, optimistically, as `useSetSetting` writes a
 * setting: the cached workspace (`workspaces.current`) takes the value at once, then what main
 * answered. A failed write shows the error toast and reads the workspace again.
 */
export function useSetWorkspaceSetting(): (update: WorkspaceSettingUpdate) => Promise<void> {
  const queryClient = useQueryClient();
  const showError = useMutationErrorToast('Couldn’t save that for this workspace');
  return useCallback(
    async (update) => {
      const key = trpc.workspaces.current.queryKey();
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, (current) => current && withWorkspaceSetting(current, update));
      try {
        const saved = await ipc.workspace.setSetting.mutate(update);
        // only while it is still the open workspace: a switch may have happened meanwhile
        queryClient.setQueryData(key, (current) => (current?.id === saved.id ? saved : current));
      } catch (error) {
        showError(error);
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, showError],
  );
}
