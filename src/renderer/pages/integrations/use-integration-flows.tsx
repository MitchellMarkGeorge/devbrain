import { useCallback, useMemo } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExternalSourceId } from '@common/ids';
import { AuthType, Provider, type Integration } from '@common/types';
import { ConfirmDialog, toast } from '../../components';
import { ipc, trpc } from '../../ipc';
import { KeyScope } from '../../keyboard';
import { useModals } from '../../modals';
import { ipcErrorCode } from '../../workspace/errors';
import { useMutationErrorToast } from '../app/mutation-errors';
import { ChooseCalendarsDialog } from './ChooseCalendarsDialog';
import { countsText, DisconnectDialog } from './DisconnectDialog';
import { GoogleSignInDialog } from './GoogleSignInDialog';
import { LinearKeyDialog } from './LinearKeyDialog';
import { providerEntry } from './providers';

/**
 * Whether a connect or reconnect is running, in this window, from any page: the accounts'
 * switches stay locked until it ends, so a switch can't be overwritten by the status the
 * reconnect writes when it ends (follow-up "A reconnect overwrites a disable made while it runs").
 * Read from React Query's mutation cache, which outlives the page and its dialogs.
 */
export function useConnecting(): boolean {
  const connecting = useMutationState({
    filters: { mutationKey: trpc.integrations.connect.mutationKey(), status: 'pending' },
  });
  const reconnecting = useMutationState({
    filters: { mutationKey: trpc.integrations.reconnect.mutationKey(), status: 'pending' },
  });
  return connecting.length + reconnecting.length > 0;
}

export interface IntegrationFlows {
  /** Connect menu: Linear asks for a key, Google Calendar signs in in the browser */
  connect(provider: Provider): void;
  /** a rejected key or sign-in: a new key for Linear, Google's sign-in again */
  reconnect(integration: Integration): void;
  /** previews what goes, asks, then disconnects */
  disconnect(integration: Integration): Promise<void>;
  chooseCalendars(integration: Integration, sourceId: ExternalSourceId): void;
  /**
   * Asks, then reattaches the `count` tasks a disconnect kept as local copies, replacing what was
   * changed in them since (follow-up "Reconnecting leaves kept tasks detached")
   */
  reattachKept(integration: Integration, count: number): void;
  /** keeps them local, so they are no longer offered */
  keepKeptLocal(integration: Integration): void;
}

const tasksText = (count: number) => `${count} task${count === 1 ? '' : 's'}`;

/** The Integrations page's dialogs and the writes behind them. */
export function useIntegrationFlows(): IntegrationFlows {
  const modals = useModals();
  const queryClient = useQueryClient();
  const showError = useMutationErrorToast();
  const workspaceName = useQuery(trpc.workspaces.current.queryOptions()).data?.name ?? 'this';
  const connectOAuth = useMutation(trpc.integrations.connect.mutationOptions());
  const reconnectOAuth = useMutation(trpc.integrations.reconnect.mutationOptions());
  const disconnectMutation = useMutation(trpc.integrations.disconnect.mutationOptions());
  const reattachKeptMutation = useMutation(trpc.integrations.reattachKept.mutationOptions());
  const keepKeptLocalMutation = useMutation(
    trpc.integrations.keepKeptLocal.mutationOptions({
      onError: (error) => showError(error, 'Couldn’t keep the tasks local'),
    }),
  );

  // Google's sign-in: the waiting dialog while main waits for the browser, closed when it ends
  const signIn = useCallback(
    async (integration?: Integration) => {
      const name = providerEntry(Provider.GOOGLE_CALENDAR).name;
      const close = modals.open((props) => (
        <GoogleSignInDialog
          {...props}
          title={integration ? `Reconnect ${name}` : `Connect ${name}`}
          subtitle={integration ? integration.accountLabel : `To the ${workspaceName} workspace`}
          onCancel={() => {
            ipc.integrations.cancelConnect.mutate().catch(() => {});
          }}
        />
      ));
      try {
        const connected = integration
          ? await reconnectOAuth.mutateAsync({ auth: AuthType.OAUTH, id: integration.id })
          : await connectOAuth.mutateAsync({
              auth: AuthType.OAUTH,
              provider: Provider.GOOGLE_CALENDAR,
            });
        close();
        toast({
          tone: 'success',
          title: integration ? `${name} reconnected` : `${name} connected`,
          description: connected.accountLabel,
        });
      } catch (error) {
        close();
        if (ipcErrorCode(error) === 'cancelled') return;
        showError(error, integration ? `Couldn’t reconnect ${name}` : `Couldn’t connect ${name}`);
      }
    },
    [modals, workspaceName, connectOAuth, reconnectOAuth, showError],
  );

  return useMemo(
    () => ({
      connect(provider) {
        if (provider === Provider.LINEAR) {
          modals.open((props) => <LinearKeyDialog {...props} workspaceName={workspaceName} />);
        } else {
          void signIn();
        }
      },
      reconnect(integration) {
        if (integration.authType === AuthType.API_KEY) {
          modals.open((props) => (
            <LinearKeyDialog {...props} workspaceName={workspaceName} reconnect={integration} />
          ));
        } else {
          void signIn(integration);
        }
      },
      async disconnect(integration) {
        const { name } = providerEntry(integration.provider);
        let preview;
        try {
          preview = await queryClient.fetchQuery({
            ...trpc.integrations.previewDisconnect.queryOptions({ id: integration.id }),
            staleTime: 0,
          });
        } catch (error) {
          showError(error, `Couldn’t disconnect ${name}`);
          return;
        }
        modals.open((props) => (
          <DisconnectDialog
            {...props}
            integration={integration}
            preview={preview}
            onDisconnect={(keepLocalCopies) => {
              disconnectMutation
                .mutateAsync({ id: integration.id, keepLocalCopies })
                .then((result) => {
                  const kept = keepLocalCopies ? countsText(result.kept) : null;
                  toast({
                    tone: 'success',
                    title: `${name} disconnected`,
                    // connecting the account again offers to reattach the kept tasks
                    description: kept
                      ? `${kept} kept as local copies. Connect the account again to sync them.`
                      : integration.accountLabel,
                  });
                })
                .catch((error: unknown) => showError(error, `Couldn’t disconnect ${name}`));
            }}
          />
        ));
      },
      chooseCalendars(integration, sourceId) {
        modals.open((props) => (
          <ChooseCalendarsDialog {...props} integration={integration} sourceId={sourceId} />
        ));
      },
      reattachKept(integration, count) {
        const { vendor } = providerEntry(integration.provider);
        const reattach = () => {
          reattachKeptMutation
            .mutateAsync({ id: integration.id })
            .then(({ reattached, failed }) => {
              const left =
                failed.length > 0
                  ? `${tasksText(failed.length)} ${failed.length === 1 ? 'stays' : 'stay'} local. `
                  : '';
              // the first refusal says why; the others are usually the same
              const why = failed.length > 0 ? `${failed[0].message}.` : '';
              toast(
                reattached > 0
                  ? {
                      tone: 'success',
                      title: `${tasksText(reattached)} reattached`,
                      description: failed.length > 0 ? `${left}${why}` : integration.accountLabel,
                    }
                  : { tone: 'error', title: 'Couldn’t reattach the tasks', description: why },
              );
            })
            .catch((error: unknown) => showError(error, 'Couldn’t reattach the tasks'));
        };
        modals.open((props) => (
          <ConfirmDialog
            {...props}
            title={`Reattach ${tasksText(count)}?`}
            description={`They sync from ${vendor} again. Anything changed in them in DevBrain since the disconnect is replaced with ${vendor}’s copy.`}
            actionLabel="Reattach Tasks"
            onConfirm={reattach}
          >
            <KeyScope name="dialog" />
          </ConfirmDialog>
        ));
      },
      keepKeptLocal(integration) {
        keepKeptLocalMutation.mutate({ id: integration.id });
      },
    }),
    [
      modals,
      workspaceName,
      signIn,
      queryClient,
      showError,
      disconnectMutation,
      reattachKeptMutation,
      keepKeptLocalMutation,
    ],
  );
}
