import { EventId, ProjectId, TaskId } from '@common/ids';
import { externalLinks } from '@main/db/schema/integrations';
import { inArray, sql, SQL, SQLWrapper } from 'drizzle-orm';
import { NodeSQLiteDatabase, NodeSQLiteRunResult } from '@main/db/node-sqlite';
import { BaseSQLiteDatabase, SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { ExternalRef, LinkState } from './types';
import { projectLinkMetadataSchema, taskLinkMetadataSchema } from './schema';
import { ExternalReadOnlyError } from '../shared/errors';

// the entities an external link can point at
export type LinkedEntity = 'task' | 'project' | 'event';
export type LinkedEntityId = TaskId | ProjectId | EventId;

// the link column pointing at each entity; each is unique, so a lookup by entity is one seek
const LINK_COLUMNS: Record<LinkedEntity, SQLiteColumn> = {
  task: externalLinks.taskId,
  project: externalLinks.projectId,
  event: externalLinks.eventId,
};

// by id prefix (see @common/ids)
const ENTITY_PREFIXES: Record<string, LinkedEntity> = {
  tsk: 'task',
  prj: 'project',
  evt: 'event',
};

// which link column an id is looked up by; read guards resolve a bare entity id the same way
export function entityOf(id: LinkedEntityId): LinkedEntity {
  const entity = ENTITY_PREFIXES[id.slice(0, id.indexOf('_'))];
  if (!entity) throw new Error(`Not an entity an external link can point at: ${id}`);
  return entity;
}

/** the labels a ref shows, read out of the link's metadata */
function labelsOf(
  entity: LinkedEntity,
  metadata: unknown,
): Pick<ExternalRef, 'statusLabel' | 'priorityLabel'> {
  // an unreadable metadata blob only costs the labels, never the read
  switch (entity) {
    case 'task': {
      const { data } = taskLinkMetadataSchema.safeParse(metadata);
      return { statusLabel: data?.statusLabel ?? null, priorityLabel: data?.priorityLabel ?? null };
    }
    case 'project': {
      const { data } = projectLinkMetadataSchema.safeParse(metadata);
      return { statusLabel: data?.statusLabel ?? null, priorityLabel: null };
    }
    case 'event':
      return { statusLabel: null, priorityLabel: null };
  }
}

/**
 * True when the row whose id is `idColumn` (tasks.id, projects.id or events.id) has a link in
 * `state`. A correlated EXISTS that seeks the link's unique entity column once per candidate row,
 * so the outer query keeps its own index and ordering. `idColumn` can also be a bound id, to ask
 * about one row.
 */
export function hasLinkInState(entity: LinkedEntity, idColumn: SQLWrapper, state: LinkState): SQL {
  return sql`exists (select 1 from ${externalLinks} where ${LINK_COLUMNS[entity]} = ${idColumn} and ${externalLinks.state} = ${state})`;
}

/**
 * Throws `ExternalReadOnlyError` when the row is synced from a provider. Detached and removed rows
 * are the user's own and stay editable, as does an id with no row behind it, so callers keep their
 * own not-found handling.
 *
 * Services call this before any write a user makes. `SyncWriter` writes synced rows through its own
 * path and skips it. Synchronous, so it also runs inside a transaction (`db` can be one).
 */
export function assertEditable(
  db: BaseSQLiteDatabase<'sync', NodeSQLiteRunResult>,
  id: LinkedEntityId,
): void {
  const isSynced = hasLinkInState(entityOf(id), sql`${id}`, LinkState.SYNCED);
  const [synced] = db.values<[number]>(sql`select ${isSynced}`);
  if (synced[0]) throw new ExternalReadOnlyError(id);
}

/** true when a row read with its `external` field is synced, so its provider owns it */
export function isSynced(row: { external?: ExternalRef | null }): boolean {
  return row.external?.state === LinkState.SYNCED;
}

/** `assertEditable` for a row already read with its `external` field, so it costs no query */
export function assertRowEditable(row: {
  id: LinkedEntityId;
  external?: ExternalRef | null;
}): void {
  if (isSynced(row)) throw new ExternalReadOnlyError(row.id);
}

/**
 * The `external` field of read models: id to ref for each id that has a link, in any state. The
 * ids must share an entity type.
 *
 * Services fill `external` after their own query, with one batched lookup per call, instead of
 * joining inside every list query: that keeps the keyset queries and the indexes behind them
 * untouched.
 */
export async function getRefs<T extends LinkedEntityId>(
  db: NodeSQLiteDatabase,
  ids: T[],
): Promise<Map<T, ExternalRef>> {
  const refs = new Map<T, ExternalRef>();
  if (ids.length === 0) return refs;

  const entity = entityOf(ids[0]);
  if (ids.some((id) => entityOf(id) !== entity)) {
    throw new Error('External refs are looked up for one entity type at a time');
  }
  const column = LINK_COLUMNS[entity];

  const links = await db
    .select({
      entityId: sql<T>`${column}`,
      provider: externalLinks.provider,
      state: externalLinks.state,
      key: externalLinks.externalKey,
      url: externalLinks.externalUrl,
      metadata: externalLinks.metadata,
      lastSyncedAt: externalLinks.lastSyncedAt,
    })
    .from(externalLinks)
    .where(inArray(column, ids));

  for (const { entityId, metadata, ...link } of links) {
    refs.set(entityId, { ...link, ...labelsOf(entity, metadata) });
  }
  return refs;
}

/** the rows with `external` set: the row's ref when it has a link, null when it is local */
export async function withRefs<T extends { id: LinkedEntityId }>(
  db: NodeSQLiteDatabase,
  rows: T[],
): Promise<(T & { external: ExternalRef | null })[]> {
  const refs = await getRefs(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, external: refs.get(row.id) ?? null }));
}

export async function withRef<T extends { id: LinkedEntityId }>(
  db: NodeSQLiteDatabase,
  row: T,
): Promise<T & { external: ExternalRef | null }> {
  const [withRef] = await withRefs(db, [row]);
  return withRef;
}
