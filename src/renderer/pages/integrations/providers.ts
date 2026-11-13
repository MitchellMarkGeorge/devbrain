import {
  AuthType,
  IntegrationStatus,
  Provider,
  SourceType,
  type ExternalSource,
  type Integration,
} from '@common/types';
import type { AccountState, IntegrationProvider } from '../../components';

// The providers the Connect menu offers, hard-coded until main lists them (A3), and the words the
// page uses for an account and its sources.

export interface ProviderEntry {
  /** the tile and name the components draw */
  tile: IntegrationProvider;
  name: string;
  /** who signs the account in, as the page says it: "Google rejected the saved sign-in" */
  vendor: string;
  /** what it brings and how it signs in, in the Connect menu: "Tasks · API key" */
  menuLine: string;
  /** the same, longer, on the empty page */
  description: string;
  /** null for a provider coming later */
  provider: Provider | null;
  auth: AuthType | null;
}

export const PROVIDERS: readonly ProviderEntry[] = [
  {
    tile: 'linear',
    name: 'Linear',
    vendor: 'Linear',
    menuLine: 'Tasks · API key',
    description: 'Issues assigned to you, with their projects · API key',
    provider: Provider.LINEAR,
    auth: AuthType.API_KEY,
  },
  {
    tile: 'google-calendar',
    name: 'Google Calendar',
    vendor: 'Google',
    menuLine: 'Events · Google sign-in',
    description: 'Events from the calendars you choose · Google sign-in',
    provider: Provider.GOOGLE_CALENDAR,
    auth: AuthType.OAUTH,
  },
  {
    tile: 'github',
    name: 'GitHub',
    vendor: 'GitHub',
    menuLine: 'Pull requests',
    description: 'Pull requests and branches for linked tasks',
    provider: null,
    auth: null,
  },
];

export function providerEntry(provider: Provider): ProviderEntry {
  return PROVIDERS.find((entry) => entry.provider === provider) ?? PROVIDERS[0];
}

/** An account's state pill. */
export function accountState(integration: Pick<Integration, 'status'>): AccountState {
  switch (integration.status) {
    case IntegrationStatus.CONNECTED:
      return 'connected';
    case IntegrationStatus.NEEDS_REAUTH:
      return 'needs-reconnect';
    case IntegrationStatus.DISABLED:
      return 'off';
  }
}

/** Who and how, under the name: "Mitchell George · Acme · API key". */
export function accountMeta(integration: Pick<Integration, 'accountLabel' | 'authType'>): string {
  const how = integration.authType === AuthType.API_KEY ? 'API key' : 'Google sign-in';
  return `${integration.accountLabel} · ${how}`;
}

export const SOURCE_TITLES: Record<SourceType, string> = {
  [SourceType.TASKS]: 'Tasks',
  [SourceType.EVENTS]: 'Events',
  [SourceType.VERSION_CONTROL]: 'Pull requests',
};

export const SOURCE_DESCRIPTIONS: Record<SourceType, string> = {
  [SourceType.TASKS]: 'Issues assigned to you, with their projects',
  [SourceType.EVENTS]: 'Events from the calendars you choose',
  [SourceType.VERSION_CONTROL]: 'Pull requests and branches for linked tasks',
};

/** What a source's status says, and in which tone. */
export interface SourceStatus {
  text: string;
  tone: 'subtle' | 'warning' | 'error';
}

export interface SourceStatusInput {
  integration: Pick<Integration, 'status' | 'authType'>;
  source: Pick<
    ExternalSource,
    'enabled' | 'initialSyncCompleted' | 'lastSyncedAt' | 'lastError' | 'retryAt'
  >;
  /** a run is in flight (sync.status) */
  running: boolean;
  /** items the run in flight has applied so far (sync.progress), if any arrived */
  applied?: number;
  now: Date;
  /** "3 min ago", from the page's format */
  relative: (date: Date) => string;
  /** "10:30 AM" */
  time: (date: Date) => string;
}

/**
 * A source's status text, worst first: the account off or needing a reconnect, the source off, a
 * run in flight, a provider's back-off, a failed run, then when it last synced.
 */
export function sourceStatus({
  integration,
  source,
  running,
  applied,
  now,
  relative,
  time,
}: SourceStatusInput): SourceStatus {
  if (integration.status === IntegrationStatus.DISABLED) {
    return { text: 'Off · mirrored items are kept', tone: 'subtle' };
  }
  if (integration.status === IntegrationStatus.NEEDS_REAUTH) {
    return {
      text:
        integration.authType === AuthType.API_KEY
          ? 'Paused until you update the key'
          : 'Paused until you reconnect',
      tone: 'warning',
    };
  }
  if (!source.enabled) return { text: 'Off', tone: 'subtle' };
  if (running) {
    return {
      text: applied ? `Syncing… ${applied} so far` : 'Syncing…',
      tone: 'subtle',
    };
  }
  if (source.retryAt && new Date(source.retryAt) > now) {
    return { text: `Paused until ${time(new Date(source.retryAt))}`, tone: 'warning' };
  }
  if (source.lastError) return { text: 'Last sync failed', tone: 'error' };
  if (!source.initialSyncCompleted || !source.lastSyncedAt) {
    return { text: 'Waiting for the first sync', tone: 'subtle' };
  }
  const ago = relative(new Date(source.lastSyncedAt));
  return { text: `Synced ${ago.charAt(0).toLowerCase()}${ago.slice(1)}`, tone: 'subtle' };
}
