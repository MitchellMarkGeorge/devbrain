import { ProjectId, generateId } from '@common/ids';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { timesamps, completedAt, trashedAt, date } from './utils';
import { ProjectStatus } from '@common/types';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';

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
    dueDate: date(),
    color: text(),
    status: integer().notNull().$type<ProjectStatus>().default(ProjectStatus.NOT_STARTED),
    ...timesamps,
    ...completedAt,
    ...trashedAt,
  },
  (table) => [
    // having status here first filters out by status first, then followed by due date
    index('idx_projects_status_due_date')
      .on(table.status, table.dueDate)
      .where(isNull(table.trashedAt)),

    // keyset pagination in ProjectService.listProjects: (sort column, id), either direction
    // (sqlite can scan an index backwards). `where` must match the query's trashed filter.
    index('idx_projects_due_date_id').on(table.dueDate, table.id).where(isNull(table.trashedAt)),
    // the due-date sort puts undated rows last (keyset's `isSortValueNullable`): descending order
    // gets that from the index above, ascending order leads with `(due_date IS NULL)` and is served
    // by this one. drizzle-kit wraps the expression in backticks, which sqlite reads as a column
    // name, so the generated CREATE INDEX was fixed by hand
    index('idx_projects_due_date_nulls_last_id')
      .on(sql`(${table.dueDate} IS NULL)`, table.dueDate, table.id)
      .where(isNull(table.trashedAt)),
    index('idx_projects_status_id').on(table.status, table.id).where(isNull(table.trashedAt)),
    index('idx_projects_created_at_id')
      .on(table.createdAt, table.id)
      .where(isNull(table.trashedAt)),
    index('idx_projects_updated_at_id')
      .on(table.updatedAt, table.id)
      .where(isNull(table.trashedAt)),
    // keyset pagination in TrashService.listTrashed: the inverse of the partial indexes above,
    // covering only trashed rows. `where` must match the query's trashed filter.
    index('idx_projects_trashed_at_id')
      .on(table.trashedAt, table.id)
      .where(isNotNull(table.trashedAt)),
    // keyset pagination in FavoritesService.listFavorites: favorited rows that are not trashed.
    // `where` must match the query's filter.
    index('idx_projects_favorited_at_id')
      .on(table.favoritedAt, table.id)
      .where(and(isNotNull(table.favoritedAt), isNull(table.trashedAt))!),
    // keyset pagination in RecentsService.listRecents: viewed rows that are not trashed.
    // `where` must match the query's filter.
    index('idx_projects_viewed_at_id')
      .on(table.viewedAt, table.id)
      .where(and(isNotNull(table.viewedAt), isNull(table.trashedAt))!),

    // completedAt only has a value if the task's status is completed
    check(
      'completed_at_consistency',
      sql`(${table.status} = ${sql.raw(String(ProjectStatus.COMPLETED))}) = (${table.completedAt} IS NOT NULL)`,
    ),
  ],
);
