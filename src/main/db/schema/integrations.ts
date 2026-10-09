import {
  EventId,
  ExternalLinkId,
  ExternalSourceId,
  IntegrationId,
  ProjectId,
  TaskId,
  generateId,
} from '@common/ids';
import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  unique,
  check,
  AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import {
  AuthType,
  IntegrationStatus,
  LinkState,
  Provider,
  SourceType,
} from '../../core/integrations/types';
import { timesamps, date, boolean } from './utils';
import { tasks } from './tasks';
import { projects } from './projects';
import { events } from './events';

// an authenticated connection between this workspace and one account on a provider
export const integrations = sqliteTable(
  'integrations',
  {
    id: text()
      .primaryKey()
      .$type<IntegrationId>()
      .$default(() => generateId('integration')),
    provider: text().notNull().$type<Provider>(),
    authType: text().notNull().$type<AuthType>(),
    accountId: text().notNull(), // provider's user id
    accountLabel: text().notNull(), // email or display name, shown in settings
    status: text().notNull().$type<IntegrationStatus>().default(IntegrationStatus.CONNECTED),
    // safeStorage ciphertext; never leaves the main process
    credentials: blob({ mode: 'buffer' }).notNull(),
    scopes: text(), // granted scopes; null for API keys
    // no favoritedAt: integrations are not favouritable
    updatedAt: timesamps.updatedAt,
    createdAt: timesamps.createdAt,
  },
  (table) => [unique('uq_integrations_provider_account').on(table.provider, table.accountId)],
);

// a role (tasks, events, version control) an integration is switched on for
export const externalSources = sqliteTable(
  'external_sources',
  {
    id: text()
      .primaryKey()
      .$type<ExternalSourceId>()
      .$default(() => generateId('externalSource')),
    integrationId: text()
      .notNull()
      .$type<IntegrationId>()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    sourceType: text().notNull().$type<SourceType>(),
    enabled: boolean().notNull().default(true),
    // JSON, validated with core/integrations/schema on read
    config: text({ mode: 'json' }).notNull().$type<unknown>().default({}),
    // JSON, opaque to the engine; null until the first page is committed
    cursor: text({ mode: 'json' }).$type<unknown>(),
    initialSyncCompletedAt: date(), // null until the first full pass finishes
    lastSyncedAt: date(),
    lastReconciledAt: date(),
    lastError: text(), // null when the last run succeeded
    consecutiveFailures: integer().notNull().default(0), // drives backoff
    // set after a rate-limited run: the provider's stated retry time, before which nothing is sent
    retryAt: date(),
  },
  (table) => [
    unique('uq_external_sources_integration_type').on(table.integrationId, table.sourceType),
  ],
);

// maps a local task, project or event to the remote item it mirrors
export const externalLinks = sqliteTable(
  'external_links',
  {
    id: text()
      .primaryKey()
      .$type<ExternalLinkId>()
      .$default(() => generateId('externalLink')),
    // set null so detached copies survive a disconnect
    sourceId: text()
      .$type<ExternalSourceId>()
      .references(() => externalSources.id, { onDelete: 'set null' }),
    provider: text().notNull().$type<Provider>(), // kept on the row so the badge survives a disconnect
    // exactly one is set (see the check below); the link goes with its entity
    taskId: text()
      .unique()
      .$type<TaskId>()
      .references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
    projectId: text()
      .unique()
      .$type<ProjectId>()
      .references((): AnySQLiteColumn => projects.id, { onDelete: 'cascade' }),
    eventId: text()
      .unique()
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id, { onDelete: 'cascade' }),
    externalId: text().notNull(), // provider's stable id
    externalKey: text(), // human identifier, such as ENG-123
    externalUrl: text().notNull(),
    externalUpdatedAt: date().notNull(), // used to skip unchanged items
    state: text().notNull().$type<LinkState>().default(LinkState.SYNCED),
    // JSON, validated with core/integrations/schema on read
    metadata: text({ mode: 'json' }).notNull().$type<unknown>().default({}),
    lastSyncedAt: date().notNull(),
    removedAt: date(),
    // a closed issue past the settle age: still mirrored, no longer checked by reconcile
    settledAt: date(),
  },
  (table) => [
    // a null sourceId (after a disconnect) never collides, so detached copies can pile up freely
    unique('uq_external_links_source_external_id').on(table.sourceId, table.externalId),
    // the reconcile pass: watched links of one source
    index('idx_external_links_source_id_state').on(table.sourceId, table.state),

    // a link points at exactly one entity
    check(
      'one_entity',
      sql`(${table.taskId} IS NOT NULL) + (${table.projectId} IS NOT NULL) + (${table.eventId} IS NOT NULL) = 1`,
    ),
  ],
);
