import { useMutation } from '@tanstack/react-query';
import {
  Code,
  Copy,
  CornerDownRight,
  CornerUpLeft,
  Folder,
  Link,
  RotateCcw,
  SquareArrowOutUpRight,
  Trash2,
  Unlink,
} from 'lucide-react';
import { LinkState, type Task } from '@common/types';
import {
  ConfirmDialog,
  DropdownMenuItem,
  DropdownMenuSeparator,
  PageMenuButton,
  PROVIDER_LABELS,
  providerOf,
  toast,
} from '../../../components';
import { ipc, trpc } from '../../../ipc';
import { KeyScope } from '../../../keyboard';
import { useModals } from '../../../modals';
import { useMutationErrorToast } from '../../app/mutation-errors';
import type { AddingProperty } from './TaskProperties';

export interface TaskDetailMenuProps {
  task: Task;
  /** opens a property's picker on the page (Link to…, Make subtask of…) */
  onAdd: (property: Exclude<AddingProperty, null>) => void;
  onTrash: () => void;
}

/**
 * The task page's "…" menu, in the README's order: Convert to project (not built yet, drawn
 * disabled), Link to…, Make subtask of… (or Make top-level task), Duplicate and Copy as Markdown
 * (not built yet, drawn disabled), the provider's items for a synced or detached task (Open in
 * Linear, Copy Linear URL, Detach or Reattach), then Move to trash.
 */
export function TaskDetailMenu({ task, onAdd, onTrash }: TaskDetailMenuProps) {
  const modals = useModals();
  const showError = useMutationErrorToast();
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());
  const external = task.external ?? null;
  const provider = external ? PROVIDER_LABELS[providerOf(external) ?? 'linear'] : '';
  const synced = external?.state === LinkState.SYNCED;
  const detached = external?.state === LinkState.DETACHED;

  const detach = () =>
    modals.open((props) => (
      <ConfirmDialog
        {...props}
        title={`Detach from ${provider}?`}
        description={`The task becomes a local copy you can edit here. ${provider} stops updating it, and your edits don’t go back to ${provider}. You can reattach it later, which replaces your edits with ${provider}’s.`}
        actionLabel="Detach"
        onConfirm={() => {
          ipc.tasks.detach
            .mutate({ id: task.id })
            .then(() => toast({ tone: 'success', title: `Detached from ${provider}` }))
            .catch((error: unknown) => showError(error, 'Couldn’t detach the task'));
        }}
      >
        <KeyScope name="dialog" />
      </ConfirmDialog>
    ));

  const reattach = () =>
    ipc.tasks.reattach
      .mutate({ id: task.id })
      .then(() => toast({ tone: 'success', title: `Reattached to ${provider}` }))
      .catch((error: unknown) => showError(error, 'Couldn’t reattach the task'));

  return (
    <PageMenuButton>
      <DropdownMenuItem icon={Folder} disabled>
        Convert to project
      </DropdownMenuItem>
      <DropdownMenuItem icon={Link} onClick={() => onAdd('event')}>
        Link to event or note…
      </DropdownMenuItem>
      {task.parentTaskId ? (
        <DropdownMenuItem
          icon={CornerUpLeft}
          disabled={synced}
          onClick={() =>
            void ipc.tasks.promote
              .mutate({ id: task.id })
              .catch((error: unknown) => showError(error, 'Couldn’t make it a top-level task'))
          }
        >
          Make top-level task
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem icon={CornerDownRight} disabled={synced} onClick={() => onAdd('parent')}>
          Make subtask of…
        </DropdownMenuItem>
      )}
      <DropdownMenuItem icon={Copy} shortcut="⌘D" disabled>
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Code} disabled>
        Copy as Markdown
      </DropdownMenuItem>
      {external && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={SquareArrowOutUpRight}
            onClick={() => openUrl({ url: external.url })}
          >
            Open in {provider}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={Copy}
            onClick={() =>
              void navigator.clipboard
                .writeText(external.url)
                .then(() => toast({ tone: 'success', title: `${provider} URL copied` }))
            }
          >
            Copy {provider} URL
          </DropdownMenuItem>
          {synced && (
            <DropdownMenuItem icon={Unlink} onClick={detach}>
              Detach from {provider}
            </DropdownMenuItem>
          )}
          {detached && (
            <DropdownMenuItem icon={RotateCcw} onClick={() => void reattach()}>
              Reattach to {provider}
            </DropdownMenuItem>
          )}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        icon={Trash2}
        shortcut="⌘⌫"
        variant="destructive"
        disabled={synced}
        onClick={onTrash}
      >
        Move to trash
      </DropdownMenuItem>
    </PageMenuButton>
  );
}
