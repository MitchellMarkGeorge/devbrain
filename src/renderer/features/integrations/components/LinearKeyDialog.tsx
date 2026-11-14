import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthType, Provider, SourceType, type Integration } from '@common/types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  ProviderTile,
  toast,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { KeyScope } from '@renderer/keyboard';
import type { ModalProps } from '@renderer/app/modals';
import { mutationErrorCopy } from '@renderer/shared/lib/mutation-errors';
import { ipcErrorOf } from '@renderer/shared/lib/workspace/errors';
import styles from './IntegrationsPage.module.css';

export interface LinearKeyDialogProps extends ModalProps {
  /** the workspace's name, for "To the ‹name› workspace" */
  workspaceName: string;
  /** the account whose rejected key is being replaced; a new connection without it */
  reconnect?: Pick<Integration, 'id' | 'accountLabel'>;
}

/** Why Linear refused the key, under the field. */
function keyError(error: unknown, reconnect: LinearKeyDialogProps['reconnect']): string {
  const serialized = ipcErrorOf(error);
  switch (serialized?.code) {
    case 'integration_auth':
    case 'invalid_input':
      return 'Linear didn’t accept this key. Check it was copied whole, and try again.';
    case 'integration_already_connected':
      return 'This Linear account is already connected to the workspace.';
    case 'integration_account_mismatch':
      return `This key is for another Linear account. Use a key for ${reconnect?.accountLabel ?? 'the same account'}.`;
    default: {
      const copy = mutationErrorCopy(error, 'Couldn’t connect Linear');
      return copy.description ?? copy.title;
    }
  }
}

/**
 * Connect Linear (Figma `7165:13724`): a personal API key and whether to sync its tasks, checked
 * with Linear before it is kept. With `reconnect`, it replaces the key Linear rejected (Update API
 * Key, `7426:43169`), keeping the account's sources.
 */
export function LinearKeyDialog({ workspaceName, reconnect, ...modal }: LinearKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [tasks, setTasks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onDone = (integration: Integration) => {
    modal.onOpenChange(false);
    toast({
      tone: 'success',
      title: reconnect ? 'Linear reconnected' : 'Linear connected',
      description: integration.accountLabel,
    });
  };
  const onError = (failure: unknown) => setError(keyError(failure, reconnect));
  const connect = useMutation(
    trpc.integrations.connect.mutationOptions({ onSuccess: onDone, onError }),
  );
  const update = useMutation(
    trpc.integrations.reconnect.mutationOptions({ onSuccess: onDone, onError }),
  );
  const pending = connect.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const key = apiKey.trim();
    if (key === '') {
      setError('Paste a personal API key from Linear.');
      return;
    }
    setError(null);
    if (reconnect) {
      update.mutate({ auth: AuthType.API_KEY, id: reconnect.id, apiKey: key });
    } else {
      connect.mutate({
        auth: AuthType.API_KEY,
        provider: Provider.LINEAR,
        apiKey: key,
        enableSources: tasks ? [SourceType.TASKS] : [],
      });
    }
  };

  return (
    <Dialog {...modal}>
      <DialogContent>
        <KeyScope name="dialog" />
        <form className={styles.dialogForm} onSubmit={submit} noValidate>
          <DialogHeader className={styles.dialogHeader}>
            <ProviderTile provider="linear" size={32} />
            <div>
              <DialogTitle>{reconnect ? 'Update Linear API key' : 'Connect Linear'}</DialogTitle>
              <DialogDescription>
                {reconnect ? reconnect.accountLabel : `To the ${workspaceName} workspace`}
              </DialogDescription>
            </div>
          </DialogHeader>
          <Field
            label="Personal API key"
            description="Create one in Linear under Settings › Security & access. DevBrain checks it with Linear, then stores it encrypted on this Mac. It is never shown again."
            error={error ?? undefined}
          >
            <Input
              type="password"
              value={apiKey}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="lin_api_…"
              onChange={(event) => {
                setApiKey(event.currentTarget.value);
                setError(null);
              }}
            />
          </Field>
          {!reconnect && (
            <div className={styles.useFor}>
              <div className={styles.useForLabel}>Use this account for</div>
              <label className={styles.useForCard}>
                <Checkbox checked={tasks} onCheckedChange={(checked) => setTasks(checked)} />
                <span>
                  <span className={styles.useForTitle}>Tasks</span>
                  <span className={styles.useForDescription}>
                    Issues assigned to you, with their projects. They appear next to your own tasks
                    and are read-only.
                  </span>
                </span>
              </label>
              <p className={styles.useForNote}>You can change this later in Integrations.</p>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Checking…' : reconnect ? 'Check Key and Update' : 'Check Key and Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
