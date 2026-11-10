import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppSettings } from '@common/types';
import { ipc, trpc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';

/** One write `settings.set` takes: a dot path under `settings` and a value of its type. */
export type SettingUpdate = Parameters<typeof ipc.settings.set.mutate>[0];

/** The settings with the value at `path` ('settings.general.timeFormat') replaced. */
export function withSetting(settings: AppSettings, { path, value }: SettingUpdate): AppSettings {
  const keys = path.split('.').slice(1);
  const write = (node: unknown, index: number): unknown => {
    if (index === keys.length) return value;
    const record = (node ?? {}) as Record<string, unknown>;
    return { ...record, [keys[index]]: write(record[keys[index]], index + 1) };
  };
  return write(settings, 0) as AppSettings;
}

// writes sent and not yet answered, in this window: an answer is only applied once it is the
// last, as main applies them in order and the last answer holds them all, where an earlier one
// would briefly undo a later edit's optimistic value
let inFlight = 0;

/**
 * Writes one setting through `settings.set` (S1), optimistically: the cached settings take the
 * value at once, so every control shows it in the same frame, and then whatever main answered. A
 * failed write shows the error toast and reads the settings again, so the controls go back to
 * what was saved (rather than to a snapshot, which a second quick edit would make stale).
 */
export function useSetSetting(): (update: SettingUpdate) => Promise<void> {
  const queryClient = useQueryClient();
  const showError = useMutationErrorToast('Couldn’t save the setting');
  return useCallback(
    async (update) => {
      const key = trpc.settings.get.queryKey();
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, (current) => current && withSetting(current, update));
      inFlight += 1;
      try {
        const saved = await ipc.settings.set.mutate(update);
        if (inFlight === 1) queryClient.setQueryData(key, saved);
      } catch (error) {
        showError(error);
        await queryClient.invalidateQueries({ queryKey: key });
      } finally {
        inFlight -= 1;
      }
    },
    [queryClient, showError],
  );
}
