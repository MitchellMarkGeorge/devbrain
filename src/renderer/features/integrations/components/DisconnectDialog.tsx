import { useState } from 'react';
import type { DisconnectCounts, EntityCounts, Integration } from '@common/types';
import { AuthType } from '@common/types';
import { ConfirmDialog, ConfirmDialogChoices } from '@renderer/components';
import { KeyScope } from '@renderer/keyboard';
import type { ModalProps } from '@renderer/app/modals';
import { providerEntry } from '../lib/providers';

/** Counts as words, the empty ones left out: "8 tasks and 2 projects", or null for none. */
export function countsText(counts: EntityCounts): string | null {
  const parts = (
    [
      [counts.tasks, 'task'],
      [counts.projects, 'project'],
      [counts.events, 'event'],
    ] as const
  ).flatMap(([count, noun]) => (count > 0 ? [`${count} ${noun}${count === 1 ? '' : 's'}`] : []));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What each choice does, with the preview's counts. */
export function disconnectChoices(preview: DisconnectCounts) {
  const all: EntityCounts = {
    tasks: preview.deleted.tasks + preview.kept.tasks,
    projects: preview.deleted.projects + preview.kept.projects,
    events: preview.deleted.events + preview.kept.events,
  };
  const everything = countsText(all);
  const deleted = countsText(preview.deleted);
  const kept = countsText(preview.kept);
  return {
    keep: everything
      ? `${everything} stay in DevBrain as your own. They stop syncing and become editable.`
      : 'Nothing has synced from this account yet.',
    remove: deleted
      ? `Deletes ${deleted}.${kept ? ` ${kept} stay as local copies because a note or task links to them.` : ''}`
      : kept
        ? `Nothing is deleted: ${kept} stay as local copies because a note or task links to them.`
        : 'Nothing has synced from this account yet.',
  };
}

export interface DisconnectDialogProps extends ModalProps {
  integration: Pick<Integration, 'provider' | 'accountLabel' | 'authType'>;
  preview: DisconnectCounts;
  onDisconnect: (keepLocalCopies: boolean) => void;
}

/**
 * Disconnect ‹provider›? (Figma `7175:34304`): what stops, and what happens to what it synced,
 * counted from `integrations.previewDisconnect`: kept as local copies (the default) or removed.
 */
export function DisconnectDialog({
  integration,
  preview,
  onDisconnect,
  ...modal
}: DisconnectDialogProps) {
  const [choice, setChoice] = useState<'keep' | 'remove'>('keep');
  const { name } = providerEntry(integration.provider);
  const words = disconnectChoices(preview);
  const credential =
    integration.authType === AuthType.API_KEY ? 'its API key' : 'its Google sign-in';
  return (
    <ConfirmDialog
      {...modal}
      title={`Disconnect ${name}?`}
      description={`DevBrain stops syncing ${integration.accountLabel} and removes ${credential} from this Mac.`}
      actionLabel="Disconnect"
      onConfirm={() => onDisconnect(choice === 'keep')}
    >
      <ConfirmDialogChoices
        label="Synced items"
        value={choice}
        onValueChange={setChoice}
        choices={[
          { value: 'keep', label: 'Keep as local copies', description: words.keep },
          { value: 'remove', label: 'Remove them', description: words.remove },
        ]}
      />
      <KeyScope name="dialog" />
    </ConfirmDialog>
  );
}
