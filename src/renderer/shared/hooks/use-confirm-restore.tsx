import { useCallback } from 'react';
import { LinkState, type ExternalRef } from '@common/types';
import { ConfirmDialog, PROVIDER_LABELS, providerOf } from '@renderer/components';
import { KeyScope } from '@renderer/keyboard';
import { useModals } from '@renderer/app/modals';

/** An item about to be restored from the trash: its title, and its link if it has one. */
export interface RestoreEntry {
  title: string;
  external?: ExternalRef | null;
}

/** The items a restore brings back detached: those sync moved to the trash (their link `removed`). */
export function removedByProvider<Entry extends RestoreEntry>(items: readonly Entry[]): Entry[] {
  return items.filter((item) => item.external?.state === LinkState.REMOVED);
}

/**
 * What restoring `removed` does, as the confirmation says it: `removed` are the items among the
 * `total` being restored that come back detached.
 */
export function restoreDetachDescription(removed: readonly RestoreEntry[], total: number): string {
  const provider = PROVIDER_LABELS[providerOf(removed[0].external!) ?? 'linear'];
  const one = removed.length === 1;
  const subject = one
    ? `“${removed[0].title}”`
    : removed.length === total
      ? `these ${total} items`
      : `${removed.length} of these items`;
  return one
    ? `${provider} no longer syncs ${subject}. Restored, it becomes a local copy you can edit here, and your edits don’t go back to ${provider}. If it comes back in ${provider}, you can reattach it, which replaces your edits with ${provider}’s.`
    : `${provider} no longer syncs ${subject}. Restored, they become local copies you can edit here, and your edits don’t go back to ${provider}. If they come back in ${provider}, you can reattach them, which replaces your edits with ${provider}’s.`;
}

/**
 * Asks before restoring items sync moved to the trash (an issue deleted in Linear, or one that
 * left what DevBrain syncs): core restores them detached (`ArchiveService`'s
 * `detachRemovedLinks`), so they stop following their provider. Resolves `true` at once when none
 * of `items` is one; otherwise always asks, whatever the settings, as Detach does, and resolves with
 * the answer. Trash's Restore (one or several) and the trash bar on a task's or project's page.
 */
export function useConfirmRestore(): (items: readonly RestoreEntry[]) => Promise<boolean> {
  const modals = useModals();
  return useCallback(
    (items) => {
      const removed = removedByProvider(items);
      if (removed.length === 0) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let confirmed = false;
        modals.open((props) => (
          <ConfirmDialog
            {...props}
            title={removed.length === 1 ? 'Restore as a local copy?' : 'Restore as local copies?'}
            description={restoreDetachDescription(removed, items.length)}
            actionLabel="Restore"
            onConfirm={() => {
              confirmed = true;
            }}
            onOpenChange={(open) => {
              props.onOpenChange(open);
              if (!open) resolve(confirmed);
            }}
          >
            {/* a modal key scope: nothing outside the dialog fires while it is open */}
            <KeyScope name="dialog" />
          </ConfirmDialog>
        ));
      });
    },
    [modals],
  );
}
