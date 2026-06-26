import { ProjectId, generateId } from '@common/ids';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timesamps, completedAt, archivedAt, date } from './utils';

export const projects = sqliteTable('projects', {
  id: text()
    .primaryKey()
    .$type<ProjectId>()
    .$default(() => generateId('project')),
  title: text().notNull(),
  description: text(),
  startDate: date(),
  dueDate: date().notNull(),
  color: text(),
  ...timesamps,
  ...completedAt,
  ...archivedAt,
}); // add indexes and checks
