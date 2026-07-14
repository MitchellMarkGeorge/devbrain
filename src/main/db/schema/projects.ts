import { ProjectId, generateId } from '@common/ids';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { timesamps, completedAt, archivedAt, date } from './utils';
import { ProjectStatus } from '@main/core/projects/types';
import { isNotNull, sql } from 'drizzle-orm';

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
      .where(isNotNull(table.archivedAt)),

    // completedAt only has a value if the task's status is completed
    check(
      'completed_at_consistency',
      sql`(${table.status} = ${sql.raw(String(ProjectStatus.COMPLETED))}) = (${table.completedAt} IS NOT NULL)`,
    ),
  ],
);
