import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteDatabase } from '@main/db/node-sqlite';
import { and, eq } from 'drizzle-orm';
import { ExternalSourceId, IntegrationId, TaskId, ProjectId, EventId } from '@common/ids';
import { integrations, externalSources, externalLinks } from '@main/db/schema/integrations';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { events } from '@main/db/schema/events';
import { createDb } from '../utils';
import {
  AuthType,
  IntegrationStatus,
  LinkState,
  Provider,
  SourceType,
} from '../../integrations/types';

// The integration tables' constraints and foreign key actions, against the real migrations.

let db: NodeSQLiteDatabase;
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let taskId: TaskId;
let projectId: ProjectId;
let eventId: EventId;

/** the SQLite message of a statement that must fail (drizzle wraps it as the cause) */
async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    const err = e as Error;
    return (err.cause as Error | undefined)?.message ?? err.message;
  }
  throw new Error('expected the statement to fail');
}

async function insertIntegration(accountId = 'org:user') {
  return await db
    .insert(integrations)
    .values({
      provider: Provider.LINEAR,
      authType: AuthType.API_KEY,
      accountId,
      accountLabel: 'Ada, Acme',
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get();
}

function link(values: Partial<typeof externalLinks.$inferInsert> = {}) {
  return db.insert(externalLinks).values({
    sourceId,
    provider: Provider.LINEAR,
    externalId: 'issue-1',
    externalKey: 'ENG-1',
    externalUrl: 'https://linear.app/acme/issue/ENG-1',
    externalUpdatedAt: new Date(),
    lastSyncedAt: new Date(),
    ...values,
  });
}

beforeEach(async () => {
  db = await createDb();
  integrationId = (await insertIntegration()).id;
  sourceId = (
    await db
      .insert(externalSources)
      .values({ integrationId, sourceType: SourceType.TASKS })
      .returning()
      .get()
  ).id;
  projectId = (await db.insert(projects).values({ title: 'Project' }).returning().get()).id;
  taskId = (await db.insert(tasks).values({ title: 'Task', projectId }).returning().get()).id;
  eventId = (
    await db
      .insert(events)
      .values({ title: 'Event', startAt: new Date(), endAt: new Date() })
      .returning()
      .get()
  ).id;
});

describe('integration tables — defaults and ids', () => {
  it('generates prefixed ids and fills defaults', async () => {
    const integration = (await db.select().from(integrations).get())!;
    expect(integration.id).toMatch(/^int_/);
    expect(integration.status).toBe(IntegrationStatus.CONNECTED);
    expect(integration.credentials.toString()).toBe('ciphertext');

    const source = (await db.select().from(externalSources).get())!;
    expect(source.id).toMatch(/^src_/);
    expect(source).toMatchObject({
      enabled: true,
      config: {},
      cursor: null,
      consecutiveFailures: 0,
      initialSyncCompletedAt: null,
    });

    const row = await link({ taskId }).returning().get();
    expect(row.id).toMatch(/^xln_/);
    expect(row).toMatchObject({ state: LinkState.SYNCED, metadata: {}, settledAt: null });
  });

  it('round-trips JSON config, cursor and metadata', async () => {
    await db
      .update(externalSources)
      .set({
        config: { calendarIds: ['primary'] },
        cursor: { mode: 'incremental', updatedSince: '2026-10-01T00:00:00.000Z' },
      })
      .where(eq(externalSources.id, sourceId))
      .run();
    const source = (await db.select().from(externalSources).get())!;
    expect(source.config).toEqual({ calendarIds: ['primary'] });
    expect(source.cursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-01T00:00:00.000Z',
    });

    const row = await link({ taskId, metadata: { statusLabel: 'In Review' } })
      .returning()
      .get();
    expect(row.metadata).toEqual({ statusLabel: 'In Review' });
  });
});

describe('integration tables — uniqueness', () => {
  it('rejects a second integration for the same provider and account', async () => {
    expect(await failure(() => insertIntegration())).toMatch(/UNIQUE constraint failed/);
    // another account on the same provider is fine
    expect((await insertIntegration('org:other')).provider).toBe(Provider.LINEAR);
  });

  it('rejects a second source of the same type on one integration', async () => {
    expect(
      await failure(() =>
        db.insert(externalSources).values({ integrationId, sourceType: SourceType.TASKS }).run(),
      ),
    ).toMatch(/UNIQUE constraint failed/);
    await db.insert(externalSources).values({ integrationId, sourceType: SourceType.EVENTS }).run();
  });

  it('rejects two links with the same sourceId and externalId', async () => {
    await link({ taskId }).run();
    expect(await failure(() => link({ projectId }).run())).toMatch(
      /UNIQUE constraint failed: external_links\.source_id, external_links\.external_id/,
    );
    // the same external id from no source (after a disconnect) does not collide
    await link({ projectId, sourceId: null }).run();
    await link({ eventId, sourceId: null }).run();
  });

  it('allows at most one link per entity', async () => {
    await link({ taskId }).run();
    expect(await failure(() => link({ taskId, externalId: 'issue-2' }).run())).toMatch(
      /UNIQUE constraint failed: external_links\.task_id/,
    );
  });
});

describe('integration tables — one_entity check', () => {
  it('rejects a link with no entity column set', async () => {
    expect(await failure(() => link().run())).toMatch(/CHECK constraint failed: one_entity/);
  });

  it('rejects a link with two entity columns set', async () => {
    expect(await failure(() => link({ taskId, projectId }).run())).toMatch(
      /CHECK constraint failed: one_entity/,
    );
    expect(await failure(() => link({ taskId, projectId, eventId }).run())).toMatch(
      /CHECK constraint failed: one_entity/,
    );
  });

  it('accepts a link to exactly one task, project or event', async () => {
    await link({ taskId, externalId: 'a' }).run();
    await link({ projectId, externalId: 'b' }).run();
    await link({ eventId, externalId: 'c' }).run();
    expect(await db.select().from(externalLinks).all()).toHaveLength(3);
  });
});

describe('integration tables — foreign key actions', () => {
  it('deletes a link when its task, project or event is deleted', async () => {
    await link({ taskId, externalId: 'a' }).run();
    await link({ projectId, externalId: 'b' }).run();
    await link({ eventId, externalId: 'c' }).run();

    await db.delete(tasks).where(eq(tasks.id, taskId)).run();
    expect((await db.select().from(externalLinks).all()).map((l) => l.externalId)).toEqual([
      'b',
      'c',
    ]);

    await db.delete(events).where(eq(events.id, eventId)).run();
    await db.delete(projects).where(eq(projects.id, projectId)).run();
    expect(await db.select().from(externalLinks).all()).toEqual([]);
  });

  it('deletes sources and nulls sourceId on links when the integration is deleted', async () => {
    const { id: linkId } = await link({ taskId }).returning().get();

    await db.delete(integrations).where(eq(integrations.id, integrationId)).run();

    expect(await db.select().from(externalSources).all()).toEqual([]);
    const survivor = await db
      .select()
      .from(externalLinks)
      .where(eq(externalLinks.id, linkId))
      .get()!;
    // the detached copy keeps its provider and url for the badge
    expect(survivor).toMatchObject({ sourceId: null, provider: Provider.LINEAR, taskId });
    expect(await db.select().from(tasks).all()).toHaveLength(1);
  });

  it('rejects a link to a missing source or entity', async () => {
    expect(
      await failure(() => link({ taskId, sourceId: 'src_nope' as ExternalSourceId }).run()),
    ).toMatch(/FOREIGN KEY constraint failed/);
    expect(await failure(() => link({ taskId: 'tsk_nope' as TaskId }).run())).toMatch(
      /FOREIGN KEY constraint failed/,
    );
  });
});

describe('integration tables — reconcile index', () => {
  it('serves the watched-links query by source and state from idx_external_links_source_id_state', () => {
    const query = db
      .select({ id: externalLinks.id })
      .from(externalLinks)
      .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.state, LinkState.SYNCED)));
    const { sql, params } = query.toSQL();
    const rows = (db as unknown as { $client: import('node:sqlite').DatabaseSync }).$client
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...(params as import('node:sqlite').SQLInputValue[])) as { detail: string }[];
    expect(rows.map((r) => r.detail).join('\n')).toMatch(/idx_external_links_source_id_state/);
  });
});
