import { useEffect, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, Clock, Plus } from 'lucide-react';
import type { Provider, SourceSyncStatus } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Heading,
  Icon,
  IntegrationCard,
  PageContent,
  ProviderTile,
} from '../../components';
import { events, trpc } from '../../ipc';
import { IntegrationAccount } from './IntegrationAccount';
import { PROVIDERS, type ProviderEntry } from './providers';
import { useConnecting, useIntegrationFlows } from './use-integration-flows';
import styles from './IntegrationsPage.module.css';

/**
 * How far each running source's sync has got, from `sync.progress`: items applied, by source id.
 * A source's count is dropped once it is no longer running.
 */
function useSyncProgress(statuses: readonly SourceSyncStatus[]): ReadonlyMap<string, number> {
  const [progress, setProgress] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(
    () =>
      events.on('sync.progress', ({ sourceId, itemsApplied }) =>
        setProgress((current) => new Map(current).set(sourceId, itemsApplied)),
      ),
    [],
  );
  const running = new Set(statuses.filter((s) => s.running).map((s) => s.sourceId as string));
  const stale = [...progress.keys()].some((id) => !running.has(id));
  if (stale) setProgress(new Map([...progress].filter(([id]) => running.has(id))));
  return progress;
}

/** "Connect Account": the providers, GitHub coming later (Figma `7165:13363`). */
function ConnectMenu({
  onConnect,
  disabled,
}: {
  onConnect: (p: Provider) => void;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" icon={Plus} trailingIcon={ChevronDown} disabled={disabled}>
            Connect Account
          </Button>
        }
      />
      <DropdownMenuContent align="end" className={styles.connectMenu}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Connect an account</DropdownMenuLabel>
          {PROVIDERS.map((entry) => (
            <DropdownMenuItem
              key={entry.tile}
              className={styles.menuItem}
              disabled={entry.provider === null}
              onClick={() => entry.provider && onConnect(entry.provider)}
            >
              <span className={styles.menuEntry}>
                <ProviderTile provider={entry.tile} size={24} />
                <span className={styles.menuText}>
                  <span>{entry.name}</span>
                  <span className={styles.menuLine}>{entry.menuLine}</span>
                </span>
                {entry.provider === null && <ComingLater />}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComingLater() {
  return (
    <span className={styles.comingLater}>
      <Icon icon={Clock} size={12} />
      Coming later
    </span>
  );
}

/** No account yet (Figma `7165:14142`): every provider, each with Connect. */
function ProviderList({
  onConnect,
  disabled,
}: {
  onConnect: (p: Provider) => void;
  disabled: boolean;
}) {
  return (
    <div className={styles.providerList}>
      {PROVIDERS.map((entry: ProviderEntry) => (
        <div key={entry.tile} className={styles.providerRow}>
          <ProviderTile provider={entry.tile} />
          <div className={styles.providerText}>
            <span className={styles.providerName}>{entry.name}</span>
            <span className={styles.menuLine}>{entry.description}</span>
          </div>
          {entry.provider === null ? (
            <ComingLater />
          ) : (
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={disabled}
              aria-label={`Connect ${entry.name}`}
              onClick={() => entry.provider && onConnect(entry.provider)}
            >
              Connect
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Integrations (`/app/$workspaceId/integrations`, Figma `7164:13117`): the workspace's connected
 * accounts, each with its sources, and Connect Account. Statuses follow `integrations.changed`,
 * `sources.changed` and `sync.progress` (the invalidator refetches on the first two); nothing polls.
 */
export function IntegrationsPage() {
  const integrations = useSuspenseQuery(trpc.integrations.list.queryOptions()).data;
  const statuses = useQuery(trpc.sync.status.queryOptions()).data ?? [];
  const calendars = useQuery({
    ...trpc.calendars.list.queryOptions(),
    enabled: integrations.length > 0,
  }).data;
  const workspace = useQuery(trpc.workspaces.current.queryOptions()).data;
  const progress = useSyncProgress(statuses);
  const flows = useIntegrationFlows();
  const connecting = useConnecting();
  const empty = integrations.length === 0;

  return (
    <PageContent layout="document" data-testid="page">
      <div className={styles.page}>
        <div className={styles.intro}>
          <div className={styles.introText}>
            <Heading level={1}>Integrations</Heading>
            <p className={styles.lead}>
              {empty
                ? 'Connect an account to bring its tasks and events into DevBrain. Synced items are read-only in DevBrain.'
                : `Accounts connected to the ${workspace?.name ?? ''} workspace. Each account can be used for one or more sources. Synced items are read-only in DevBrain.`}
            </p>
          </div>
          {!empty && <ConnectMenu onConnect={flows.connect} disabled={connecting} />}
        </div>
        {empty ? (
          <ProviderList onConnect={flows.connect} disabled={connecting} />
        ) : (
          <>
            {integrations.map((integration) => (
              <IntegrationAccount
                key={integration.id}
                integration={integration}
                statuses={statuses}
                progress={progress}
                calendars={calendars ?? []}
                flows={flows}
                locked={connecting}
              />
            ))}
            <IntegrationCard
              provider="github"
              name="GitHub"
              state="coming-later"
              meta="Pull requests and branches for linked tasks"
            />
            <p className={styles.footnote}>
              Turning an account off pauses all of its sources; turning it back on picks up where it
              left off. Mirrored items stay as they are until you disconnect.
            </p>
          </>
        )}
      </div>
    </PageContent>
  );
}
