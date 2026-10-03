import { describe, it, expect } from 'vitest';
import { and, eq, isNull, SQL } from 'drizzle-orm';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { events } from '@main/db/schema/events';
import { createDb } from '../utils';
import { keyset, SortKind } from '../../shared/pagination';

// Verifies the keyset-paginated queries are served by the pagination indexes: the plan must
// SEARCH/SCAN using the expected index and must not need a temp b-tree for ORDER BY.

const db = createDb();

interface Case {
  name: string;
  table: { id: SQLiteColumn; archivedAt?: SQLiteColumn } & Record<string, unknown>;
  from: unknown;
  sortColumn: SQLiteColumn;
  kind: SortKind;
  index: string;
  extra?: SQL;
}

const cases: Case[] = [
  ['tasks', tasks, 'dueDate', 'date', 'idx_tasks_due_date_id'],
  ['tasks', tasks, 'priority', 'number', 'idx_tasks_priority_id'],
  ['tasks', tasks, 'status', 'number', 'idx_tasks_status_id'],
  ['tasks', tasks, 'createdAt', 'date', 'idx_tasks_created_at_id'],
  ['tasks', tasks, 'updatedAt', 'date', 'idx_tasks_updated_at_id'],
  ['projects', projects, 'dueDate', 'date', 'idx_projects_due_date_id'],
  ['projects', projects, 'status', 'number', 'idx_projects_status_id'],
  ['projects', projects, 'createdAt', 'date', 'idx_projects_created_at_id'],
  ['projects', projects, 'updatedAt', 'date', 'idx_projects_updated_at_id'],
  ['notes', notes, 'title', 'text', 'idx_notes_title_id'],
  ['notes', notes, 'createdAt', 'date', 'idx_notes_created_at_id'],
  ['notes', notes, 'updatedAt', 'date', 'idx_notes_updated_at_id'],
].map(([name, table, column, kind, index]) => ({
  name: `${name}.${column}`,
  table: table as unknown as Case['table'],
  from: table,
  sortColumn: (table as unknown as Record<string, SQLiteColumn>)[column as string],
  kind: kind as SortKind,
  index: index as string,
}));

function plan(query: { toSQL(): { sql: string; params: unknown[] } }): string[] {
  const { sql, params } = query.toSQL();
  const rows = (db as unknown as { $client: import('better-sqlite3').Database }).$client
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params) as { detail: string }[];
  return rows.map((r) => r.detail);
}

function cursorFor(kind: SortKind, sortKey: string, value: unknown): string {
  // produce a real cursor by paginating two fake rows with limit 1
  const pager = keyset<{ v: unknown; id: string }>(
    {
      sortKey,
      sortColumn: tasks.id,
      idColumn: tasks.id,
      kind,
      direction: 'asc',
      sortValue: (r) => r.v,
      id: (r) => r.id,
    },
    { limit: 1 },
  );
  return pager.toPage([
    { v: value, id: 'a' },
    { v: value, id: 'b' },
  ]).nextCursor!;
}

describe.each(cases)('pagination index — $name', (c) => {
  const sample = c.kind === 'date' ? new Date() : c.kind === 'number' ? 1 : 'x';

  it.each(['asc', 'desc'] as const)('%s, first page and with cursor use the index', (direction) => {
    for (const withCursor of [false, true]) {
      const pager = keyset<{ v: unknown; id: string }>(
        {
          sortKey: c.name,
          sortColumn: c.sortColumn,
          idColumn: c.table.id,
          kind: c.kind,
          direction,
          sortValue: (r) => r.v,
          id: (r) => r.id,
        },
        { cursor: withCursor ? cursorFor(c.kind, c.name, sample) : undefined },
      );
      const query = db
        .select()
        .from(c.from as typeof tasks)
        .where(and(isNull(c.table.archivedAt!), pager.after))
        .orderBy(...pager.orderBy)
        .limit(pager.fetchLimit);
      const detail = plan(query).join('\n');
      expect(detail).toContain(c.index);
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
      kind: 'date',
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

describe('pagination index — events.listEventsInRange', () => {
  it('orders by startAt without a temp b-tree', () => {
    const pager = keyset<{ v: unknown; id: string }>({
      sortKey: 'startAt',
      sortColumn: events.startAt,
      idColumn: events.id,
      kind: 'date',
      direction: 'asc',
      sortValue: (r) => r.v,
      id: (r) => r.id,
    });
    const query = db
      .select()
      .from(events)
      .where(pager.after)
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);
    const detail = plan(query).join('\n');
    expect(detail).toContain('idx_events_start_at_id');
    expect(detail).not.toContain('TEMP B-TREE');
  });
});
