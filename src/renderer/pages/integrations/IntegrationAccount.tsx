import { useMutation, useMutationState, useQuery } from '@tanstack/react-query';
import { Calendar, CircleCheck, GitPullRequest, RefreshCw, RotateCcw } from 'lucide-react';
import {
  AuthType,
  IntegrationStatus,
  SourceType,
  type Calendar as CalendarRow,
  type ExternalSource,
  type Integration,
  type SourceSyncStatus,
} from '@common/types';
import {
  Button,
  Icon,
  IntegrationCard,
  IntegrationCardAlert,
  IntegrationSwitchLabel,
  SourceRow,
  Switch,
  useFormat,
} from '../../components';
import { trpc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';
import { calendarsOf } from './ChooseCalendarsDialog';
import type { IntegrationFlows } from './use-integration-flows';
import {
  accountMeta,
  accountState,
  providerEntry,
  SOURCE_DESCRIPTIONS,
  SOURCE_TITLES,
  sourceStatus,
} from './providers';
import styles from './IntegrationsPage.module.css';

const SOURCE_ICONS = {
  [SourceType.TASKS]: CircleCheck,
  [SourceType.EVENTS]: Calendar,
  [SourceType.VERSION_CONTROL]: GitPullRequest,
};

/** The kept-copies offer's words: "3 tasks from Linear are still local copies …" */
function keptText(count: number, vendor: string): string {
  const one = count === 1;
  const them = one ? 'it' : 'them';
  return `${one ? '1 task' : `${count} tasks`} from ${vendor} ${one ? 'is still a local copy' : 'are still local copies'} from when this account was disconnected. Reattach to sync ${them} again, or keep ${them} as your own.`;
}

export interface IntegrationAccountProps {
  integration: Integration;
  /** each source's sync state (sync.status) */
  statuses: readonly SourceSyncStatus[];
  /** items each running source has applied so far (sync.progress) */
  progress: ReadonlyMap<string, number>;
  calendars: readonly CalendarRow[];
  flows: IntegrationFlows;
  /** a connect or reconnect is running: the switches wait for it */
  locked: boolean;
}

/**
 * One connected account (Figma `7164:13117`): its state, its On/Off switch and Disconnect…, an
 * alert with Reconnect when its sign-in was rejected, and its sources, each with its own switch
 * and status. Every status comes from core and its events; nothing here polls.
 *
 * After the account was disconnected keeping local copies and then connected again, its first
 * sync matches those tasks back to it (`integrations.keptCopies`), and the alert offers to
 * reattach them or keep them local. Not in Figma; it reuses the card's alert.
 */
export function IntegrationAccount({
  integration,
  statuses,
  progress,
  calendars,
  flows,
  locked,
}: IntegrationAccountProps) {
  const format = useFormat('minute');
  const showError = useMutationErrorToast();
  const entry = providerEntry(integration.provider);
  const setEnabled = useMutation(
    trpc.integrations.setEnabled.mutationOptions({
      onError: (error) => showError(error, `Couldn’t switch ${entry.name}`),
    }),
  );
  const setSource = useMutation(
    trpc.sources.setEnabled.mutationOptions({
      onError: (error) => showError(error, 'Couldn’t switch the source'),
    }),
  );
  // a switch shows where it is going while its write runs
  const on = setEnabled.isPending
    ? setEnabled.variables.enabled
    : integration.status !== IntegrationStatus.DISABLED;
  const sourceOn = (source: ExternalSource) =>
    setSource.isPending && setSource.variables.id === source.id
      ? setSource.variables.enabled
      : source.enabled;
  const running = (source: ExternalSource) =>
    statuses.some((status) => status.sourceId === source.id && status.running);
  const syncing = integration.sources.some(running);
  const needsReconnect = integration.status === IntegrationStatus.NEEDS_REAUTH;
  const apiKey = integration.authType === AuthType.API_KEY;
  const what = integration.sources.some((s) => s.sourceType === SourceType.EVENTS)
    ? 'Events'
    : 'Tasks';
  const switchesLocked = locked || setEnabled.isPending;
  const hasTasks = integration.sources.some((s) => s.sourceType === SourceType.TASKS);
  const kept =
    useQuery({
      ...trpc.integrations.keptCopies.queryOptions({ id: integration.id }),
      enabled: hasTasks,
    }).data?.tasks ?? 0;
  // a reattach or "keep local" of this account running, from the page's flows
  const pendingIds = (key: readonly unknown[]) => ({
    filters: { mutationKey: key, status: 'pending' as const },
    select: (mutation: { state: { variables: unknown } }) =>
      (mutation.state.variables as { id: string }).id,
  });
  const keptBusy = [
    ...useMutationState(pendingIds(trpc.integrations.reattachKept.mutationKey())),
    ...useMutationState(pendingIds(trpc.integrations.keepKeptLocal.mutationKey())),
  ].includes(integration.id);

  return (
    <IntegrationCard
      provider={entry.tile}
      name={entry.name}
      state={accountState(integration)}
      meta={accountMeta(integration)}
      data-integration-id={integration.id}
      actions={
        <>
          {syncing && (
            <span className={styles.syncing}>
              <Icon icon={RefreshCw} size={12} className={styles.spinner} />
              Syncing…
            </span>
          )}
          <IntegrationSwitchLabel>{on ? 'On' : 'Off'}</IntegrationSwitchLabel>
          <Switch
            checked={on}
            disabled={switchesLocked}
            aria-label={`${entry.name} on`}
            onCheckedChange={(enabled) => setEnabled.mutate({ id: integration.id, enabled })}
          />
          <Button variant="outline" size="sm" onClick={() => void flows.disconnect(integration)}>
            Disconnect…
          </Button>
        </>
      }
      alert={
        needsReconnect ? (
          <IntegrationCardAlert
            action={
              <Button
                variant="outline"
                size="sm"
                icon={RotateCcw}
                disabled={locked}
                onClick={() => flows.reconnect(integration)}
              >
                {apiKey ? 'Update API Key' : 'Reconnect'}
              </Button>
            }
          >
            {entry.vendor} rejected the saved {apiKey ? 'API key' : 'sign-in'}, so nothing from this
            account is syncing. {what} already in DevBrain stay visible.
          </IntegrationCardAlert>
        ) : (
          kept > 0 && (
            <IntegrationCardAlert
              data-testid="kept-copies"
              action={
                <span className={styles.alertActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={keptBusy}
                    onClick={() => flows.keepKeptLocal(integration)}
                  >
                    Keep Local
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RotateCcw}
                    disabled={keptBusy || !on}
                    onClick={() => flows.reattachKept(integration, kept)}
                  >
                    Reattach…
                  </Button>
                </span>
              }
            >
              {keptText(kept, entry.vendor)}
            </IntegrationCardAlert>
          )
        )
      }
    >
      {integration.sources.map((source) => {
        const status = sourceStatus({
          integration,
          source,
          running: running(source),
          applied: progress.get(source.id),
          now: format.now,
          relative: format.formatRelative,
          time: format.formatTime,
        });
        const events = source.sourceType === SourceType.EVENTS;
        const own = events ? calendarsOf(calendars, source.id) : [];
        return (
          <SourceRow
            key={source.id}
            data-source-id={source.id}
            icon={SOURCE_ICONS[source.sourceType]}
            title={SOURCE_TITLES[source.sourceType]}
            description={
              events && own.length > 0
                ? `${own.filter((c) => c.selected).length} of ${own.length} calendars`
                : SOURCE_DESCRIPTIONS[source.sourceType]
            }
            action={
              events && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => flows.chooseCalendars(integration, source.id)}
                >
                  Choose Calendars
                </Button>
              )
            }
            status={status.text}
            tone={status.tone}
            disabled={!on}
            control={
              <Switch
                checked={sourceOn(source)}
                disabled={!on || switchesLocked}
                aria-label={`Sync ${SOURCE_TITLES[source.sourceType].toLowerCase()}`}
                onCheckedChange={(enabled) => setSource.mutate({ id: source.id, enabled })}
              />
            }
          />
        );
      })}
    </IntegrationCard>
  );
}
