import { ProjectId, generateId } from '@common/ids';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { timesamps, completedAt, archivedAt, date } from './utils';
import { ProjectStatus } from '@main/core/projects/types';
import { isNull, sql } from 'drizzle-orm';

export const projects = sqliteTable(
  'projects',
  {
    id: text()
      .primaryKey()
      .$type<ProjectId>()
      .$default(() => generateId('project')),
    title: text().notNull(),
    description: text(),
    startDate: date(),
    dueDate: date().notNull(),
    color: text(),
    status: integer().notNull().$type<ProjectStatus>().default(ProjectStatus.NOT_STARTED),
    ...timesamps,
    ...completedAt,
    ...archivedAt,
  },
  (table) => [
    // having status here first filters out by status first, then followed by due date
    index('idx_projects_status_due_date')
      .on(table.status, table.dueDate)
      .where(isNull(table.archivedAt)),

    // keyset pagination in ProjectService.listProjects: (sort column, id), either direction
    // (sqlite can scan an index backwards). `where` must match the query's archived filter.
    index('idx_projects_due_date_id').on(table.dueDate, table.id).where(isNull(table.archivedAt)),
    index('idx_projects_status_id').on(table.status, table.id).where(isNull(table.archivedAt)),
    index('idx_projects_created_at_id')
      .on(table.createdAt, table.id)
      .where(isNull(table.archivedAt)),
    index('idx_projects_updated_at_id')
      .on(table.updatedAt, table.id)
      .where(isNull(table.archivedAt)),

    // completedAt only has a value if the task's status is completed
    check(
      'completed_at_consistency',
      sql`(${table.status} = ${sql.raw(String(ProjectStatus.COMPLETED))}) = (${table.completedAt} IS NOT NULL)`,
    ),
  ],
);
