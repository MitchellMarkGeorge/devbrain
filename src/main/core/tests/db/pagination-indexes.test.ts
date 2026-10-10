import { describe, it, expect } from 'vitest';
import { and, eq, isNotNull, isNull, not, sql, SQL } from 'drizzle-orm';
import { SQLiteColumn, unionAll } from 'drizzle-orm/sqlite-core';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { createDb } from '../utils';
import { keyset } from '../../shared/pagination';
import { hasLinkInState, LinkedEntity } from '../../integrations/refs';
import { LinkState } from '../../integrations/types';

// Verifies the keyset-paginated queries are served by the pagination indexes: the plan must
// SEARCH/SCAN using the expected index and must not need a temp b-tree for ORDER BY.

const db = createDb();

interface Case {
  name: string;
  table: { id: SQLiteColumn; archivedAt?: SQLiteColumn } & Record<string, unknown>;
  from: unknown;
  sortColumn: SQLiteColumn;
  // index used when sorting descending, and ascending unless `ascIndex` is given
  index: string;
  ascIndex: string;
  // the service sorts this column with keyset's `isSortValueNullable`
  isSortValueNullable: boolean;
  // the entity behind the `origin` filter, for the tables that have one
  entity?: LinkedEntity;
}

// the `origin` filter as listTasks and listProjects build it: a correlated EXISTS on the link
function originFilter(
  entity: LinkedEntity | undefined,
  idColumn: SQLiteColumn,
  origin: 'local' | 'external' | undefined,
): SQL | undefined {
  if (!entity || origin === undefined) return undefined;
  const isSynced = hasLinkInState(entity, idColumn, LinkState.SYNCED);
  return origin === 'external' ? isSynced : not(isSynced);
}

const cases: Case[] = [
  ['tasks', tasks, 'dueDate', 'date', 'idx_tasks_due_date_id', 'idx_tasks_due_date_nulls_last_id'],
  ['tasks', tasks, 'priority', 'number', 'idx_tasks_priority_id'],
  ['tasks', tasks, 'status', 'number', 'idx_tasks_status_id'],
  ['tasks', tasks, 'createdAt', 'date', 'idx_tasks_created_at_id'],
  ['tasks', tasks, 'updatedAt', 'date', 'idx_tasks_updated_at_id'],
  [
    'projects',
    projects,
    'dueDate',
    'date',
    'idx_projects_due_date_id',
    'idx_projects_due_date_nulls_last_id',
  ],
  ['projects', projects, 'status', 'number', 'idx_projects_status_id'],
  ['projects', projects, 'createdAt', 'date', 'idx_projects_created_at_id'],
  ['projects', projects, 'updatedAt', 'date', 'idx_projects_updated_at_id'],
  ['notes', notes, 'title', 'text', 'idx_notes_title_id'],
  ['notes', notes, 'createdAt', 'date', 'idx_notes_created_at_id'],
  ['notes', notes, 'updatedAt', 'date', 'idx_notes_updated_at_id'],
].map(([name, table, column, , index, ascIndex]) => ({
  name: `${name}.${column}`,
  table: table as unknown as Case['table'],
  from: table,
  sortColumn: (table as unknown as Record<string, SQLiteColumn>)[column as string],
  index: index as string,
  ascIndex: (ascIndex ?? index) as string,
  isSortValueNullable: column === 'dueDate',
  entity: ({ tasks: 'task', projects: 'project' } as const)[name as string],
}));

function plan(query: { toSQL(): { sql: string; params: unknown[] } }): string[] {
  const { sql, params } = query.toSQL();
  const rows = (db as unknown as { $client: import('better-sqlite3').Database }).$client
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params) as { detail: string }[];
  return rows.map((r) => r.detail);
}

function cursorFor(
  sortColumn: SQLiteColumn,
  sortKey: string,
  value: unknown,
  isSortValueNullable = false,
): string {
  // produce a real cursor by paginating two fake rows with limit 1
  const pager = keyset<{ v: unknown; id: string }>(
    {
      sortKey,
      sortColumn,
      idColumn: tasks.id,
      direction: 'asc',
      sortValue: (r) => r.v,
      id: (r) => r.id,
      isSortValueNullable,
    },
    { limit: 1 },
  );
  return pager.toPage([
    { v: value, id: 'a' },
    { v: value, id: 'b' },
  ]).nextCursor!;
}

describe.each(cases)('pagination index — $name', (c) => {
  const sample =
    c.sortColumn.dataType === 'date' ? new Date() : c.sortColumn.dataType === 'number' ? 1 : 'x';

  // with isSortValueNullable, a sort resumes differently after a value and after a null
  const cursorValues = c.isSortValueNullable ? [sample, null] : [sample];

  // the origin filter must not change the index or add a sort step
  const origins = c.entity ? ([undefined, 'external', 'local'] as const) : [undefined];

  it.each(['asc', 'desc'] as const)('%s, first page and with cursor use the index', (direction) => {
    for (const [cursorValue, origin] of [undefined, ...cursorValues].flatMap((v) =>
      origins.map((o) => [v, o] as const),
    )) {
      const pager = keyset<{ v: unknown; id: string }>(
        {
          sortKey: c.name,
          sortColumn: c.sortColumn,
          idColumn: c.table.id,
          direction,
          sortValue: (r) => r.v,
          id: (r) => r.id,
          isSortValueNullable: c.isSortValueNullable,
        },
        {
          cursor:
            cursorValue === undefined
              ? undefined
              : cursorFor(c.sortColumn, c.name, cursorValue, c.isSortValueNullable),
        },
      );
      const query = db
        .select()
        .from(c.from as typeof tasks)
        .where(
          and(isNull(c.table.archivedAt!), originFilter(c.entity, c.table.id, origin), pager.after),
        )
        .orderBy(...pager.orderBy)
        .limit(pager.fetchLimit);
      const detail = plan(query).join('\n');
      expect(detail).toContain(direction === 'asc' ? c.ascIndex : c.index);
      // the link is found through its unique entity column, one seek per row
      if (origin) {
        expect(detail).toContain(
          `USING INDEX external_links_${c.entity}Id_unique (${c.entity}_id=?)`,
        );
      }
      expect(detail).not.toContain('TEMP B-TREE');
    }
  });
});

describe('pagination index — tasks.listSubtasks', () => {
  it('uses the (parent, createdAt, id) index', () => {
    const pager = keyset<{ v: unknown; id: string }>({
      sortKey: 'created',
      sortColumn: tasks.createdAt,
      idColumn: tasks.id,
      direction: 'desc',
      sortValue: (r) => r.v,
      id: (r) => r.id,
    });
    const query = db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, 'tsk_x' as never), isNull(tasks.archivedAt), pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);
    const detail = plan(query).join('\n');
    expect(detail).toContain('idx_tasks_parent_created_at_id');
    expect(detail).not.toContain('TEMP B-TREE');
  });
});

describe('pagination index — archive.listArchived', () => {
  // mirrors the UNION ALL in ArchiveService.listArchived: each branch should use its own
  // (archived_at, id) index. On the first page the branches are merged with no sort step; with
  // a cursor sqlite plans the keyset OR as a multi-index OR, so each branch sorts the archived
  // rows past the cursor (accepted: see the note on listArchived)
  it.each([false, true])('with cursor: %s, uses the per-table archived indexes', (withCursor) => {
    const branch = (table: typeof tasks | typeof projects | typeof notes) => {
      const pager = keyset<{ v: unknown; id: string }>(
        {
          sortKey: 'archivedAt',
          sortColumn: table.archivedAt,
          idColumn: table.id,
          direction: 'desc',
          sortValue: (r) => r.v,
          id: (r) => r.id,
        },
        {
          cursor: withCursor ? cursorFor(table.archivedAt, 'archivedAt', new Date()) : undefined,
        },
      );
      return db
        .select({ id: sql`${table.id}`.as('id'), title: table.title, archivedAt: table.archivedAt })
        .from(table)
        .where(and(isNotNull(table.archivedAt), pager.after));
    };
    const query = unionAll(branch(tasks), branch(projects), branch(notes))
      .orderBy(sql`archived_at desc`, sql`id desc`)
      .limit(51);
    const detail = plan(query).join('\n');
    expect(detail).toContain('MERGE (UNION ALL)');
    expect(detail).toContain('idx_tasks_archived_at_id');
    expect(detail).toContain('idx_projects_archived_at_id');
    expect(detail).toContain('idx_notes_archived_at_id');
    if (!withCursor) expect(detail).not.toContain('TEMP B-TREE');
  });
});

describe('pagination index — archive.listArchived filtered to one entity type', () => {
  it.each([
    ['tasks', tasks, 'idx_tasks_archived_at_id'],
    ['projects', projects, 'idx_projects_archived_at_id'],
    ['notes', notes, 'idx_notes_archived_at_id'],
  ] as const)('%s: first page reads the archived index in order', (_, table, index) => {
    const pager = keyset<{ v: unknown; id: string }>({
      sortKey: 'archivedAt',
      sortColumn: table.archivedAt,
      idColumn: table.id,
      direction: 'desc',
      sortValue: (r) => r.v,
      id: (r) => r.id,
    });
    const query = db
      .select({ id: table.id, title: table.title, archivedAt: table.archivedAt })
      .from(table as typeof tasks)
      .where(and(isNotNull(table.archivedAt), pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);
    const detail = plan(query).join('\n');
    expect(detail).toContain(index);
    expect(detail).not.toContain('TEMP B-TREE');
  });
});
