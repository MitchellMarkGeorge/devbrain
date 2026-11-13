import { useCallback, useMemo } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExternalSourceId } from '@common/ids';
import { AuthType, Provider, type Integration } from '@common/types';
import { toast } from '../../components';
import { ipc, trpc } from '../../ipc';
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
}

/** The Integrations page's dialogs and the writes behind them. */
export function useIntegrationFlows(): IntegrationFlows {
  const modals = useModals();
  const queryClient = useQueryClient();
  const showError = useMutationErrorToast();
  const workspaceName = useQuery(trpc.workspaces.current.queryOptions()).data?.name ?? 'this';
  const connectOAuth = useMutation(trpc.integrations.connect.mutationOptions());
  const reconnectOAuth = useMutation(trpc.integrations.reconnect.mutationOptions());
  const disconnectMutation = useMutation(trpc.integrations.disconnect.mutationOptions());

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
                    // reconnecting the account later leaves kept tasks as local copies (follow-up
                    // "Reconnecting leaves kept tasks detached"), so say so now
                    description: kept
                      ? `${kept} kept as local copies. They stay local if you connect again.`
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
    }),
    [modals, workspaceName, signIn, queryClient, showError, disconnectMutation],
  );
}
