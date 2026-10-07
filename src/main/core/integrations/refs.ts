import { EventId, ProjectId, TaskId } from '@common/ids';
import { externalLinks } from '@main/db/schema/integrations';
import { inArray, sql, SQL } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { ExternalRef, LinkState } from './types';
import { projectLinkMetadataSchema, taskLinkMetadataSchema } from './schema';

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
 * so the outer query keeps its own index and ordering.
 */
export function hasLinkInState(
  entity: LinkedEntity,
  idColumn: SQLiteColumn,
  state: LinkState,
): SQL {
  return sql`exists (select 1 from ${externalLinks} where ${LINK_COLUMNS[entity]} = ${idColumn} and ${externalLinks.state} = ${state})`;
}

/**
 * Looks up the `external` field of read models. Services fill it after their own query, with one
 * batched lookup per call, instead of joining inside every list query: that keeps the keyset
 * queries and the indexes behind them untouched.
 */
export class ExternalRefs {
  constructor(private readonly db: BetterSQLite3Database) {}

  /** id to ref for each id that has a link, in any state; the ids must share an entity type */
  async getRefs<T extends LinkedEntityId>(ids: T[]): Promise<Map<T, ExternalRef>> {
    const refs = new Map<T, ExternalRef>();
    if (ids.length === 0) return refs;

    const entity = entityOf(ids[0]);
    if (ids.some((id) => entityOf(id) !== entity)) {
      throw new Error('External refs are looked up for one entity type at a time');
    }
    const column = LINK_COLUMNS[entity];

    const links = await this.db
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
  async withRefs<T extends { id: LinkedEntityId }>(
    rows: T[],
  ): Promise<(T & { external: ExternalRef | null })[]> {
    const refs = await this.getRefs(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, external: refs.get(row.id) ?? null }));
  }

  async withRef<T extends { id: LinkedEntityId }>(
    row: T,
  ): Promise<T & { external: ExternalRef | null }> {
    const [withRef] = await this.withRefs([row]);
    return withRef;
  }
}
