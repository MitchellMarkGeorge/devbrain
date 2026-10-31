import { ProjectId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  CreateProjectOptions,
  Project,
  ProjectFilterOptions,
  ProjectSortOptions,
  ProjectStats,
  ProjectStatus,
  UpdateProjectOptions,
} from './types';
import { projects } from '@main/db/schema/projects';
import { eq, inArray, SQL, sql, and, isNull, not, asc, desc, gt, gte, lt } from 'drizzle-orm';
import { localDayWindow } from '../shared/dates';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { keyset, Page, PageOptions } from '../shared/pagination';
import { NotFoundError } from '../shared/errors';
import { tasks } from '@main/db/schema/tasks';
import { TaskStatus } from '../tasks/types';
import {
  assertEditable,
  hasLinkInState,
  withExternalRef,
  withExternalRefs,
} from '../integrations/refs';
import { LinkState } from '../integrations/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after the write commits, with the row as written.
export type ProjectChange =
  | { type: 'created'; project: Project }
  | { type: 'updated'; project: Project };

export class ProjectService {
  private readonly changes = new ChangeListeners<ProjectChange>('Project');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<ProjectChange>): () => void {
    return this.changes.add(listener);
  }

  getById(id: ProjectId): Project {
    const row = this.activeProjects(eq(projects.id, id)).limit(1).get();
    if (!row) throw new NotFoundError(id);
    return withExternalRef(this.db, row);
  }

  getByIds(ids: ProjectId[]): Project[] {
    return withExternalRefs(this.db, this.activeProjects(inArray(projects.id, ids)).all());
  }

  // Every active (unarchived) project, synced ones included, oldest first: what an import matches
  // project titles against and an export names tasks' projects from. Not paged.
  listAll(): Project[] {
    const rows = this.db
      .select()
      .from(projects)
      .where(isNull(projects.archivedAt))
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .all();
    return withExternalRefs(this.db, rows);
  }

  createProject(options: CreateProjectOptions): Project {
    const newProject = {
      title: options.title,
      description: options.description ?? null,
      startDate: options.startDate ?? null,
      dueDate: options.dueDate,
      color: options.color ?? null,
      status: options.status ?? ProjectStatus.NOT_STARTED,
      completedAt: options.status === ProjectStatus.COMPLETED ? new Date() : null,
    };
    const row = this.db.insert(projects).values(newProject).returning().get();
    // a new project is local, so it has no link
    const project = { ...row, external: null };
    this.changes.emit({ type: 'created', project });
    return project;
  }

  updateProject(id: ProjectId, updates: UpdateProjectOptions): Project {
    assertEditable(this.db, id);
    const row = this.db.update(projects).set(updates).where(eq(projects.id, id)).returning().get();
    return this.updated(id, row);
  }

  updateStatus(id: ProjectId, newStatus: ProjectStatus): Project {
    assertEditable(this.db, id);
    const row = this.db
      .update(projects)
      .set({
        // if a project is now complete, set a new completedAt timestamp
        // if not, set it to null (this also applies to projects that were once completed and have their status changed)
        completedAt: newStatus === ProjectStatus.COMPLETED ? new Date() : null,
        status: newStatus,
      })
      .where(eq(projects.id, id))
      .returning()
      .get();
    return this.updated(id, row);
  }

  listProjects(
    filter: ProjectFilterOptions = {},
    sort: ProjectSortOptions = { sortBy: 'createdAt' },
    page: PageOptions = {},
  ): Page<Project> {
    const clauses = [isNull(projects.archivedAt)];

    // apply easy filters
    if (filter.status) clauses.push(eq(projects.status, filter.status));
    if (filter.dueBefore != null) clauses.push(lt(projects.dueDate, filter.dueBefore));
    if (filter.dueAfter != null) clauses.push(gt(projects.dueDate, filter.dueAfter));
    if (filter.dueOn != null) {
      // get the start and end time the date and compare (inclusive start and exlusive end/midnight)
      const { startOfDay, endOfDay } = localDayWindow(filter.dueOn);
      clauses.push(gte(projects.dueDate, startOfDay));
      clauses.push(lt(projects.dueDate, endOfDay));
    }

    if (filter.origin !== undefined) {
      // only a synced link makes a project external; a detached one is the user's own again
      const isSynced = hasLinkInState('project', projects.id, LinkState.SYNCED);
      clauses.push(filter.origin === 'external' ? isSynced : not(isSynced));
    }

    let sortColumn: SQLiteColumn;
    switch (sort.sortBy) {
      case 'dueDate':
        sortColumn = projects.dueDate;
        break;
      case 'status':
        sortColumn = projects.status;
        break;
      case 'createdAt':
        sortColumn = projects.createdAt;
        break;
      case 'updatedAt':
        sortColumn = projects.updatedAt;
        break;
    }

    const pager = keyset<Project>(
      {
        sortKey: sort.sortBy,
        sortColumn,
        idColumn: projects.id,
        direction: sort.direction === 'asc' ? 'asc' : 'desc',
        sortValue: (row) => row[sortColumn.name as keyof Project],
        id: (row) => row.id,
        // undated rows sort last
        isSortValueNullable: sort.sortBy === 'dueDate',
      },
      page,
    );

    const rows = this.db
      .select()
      .from(projects)
      .where(and(...clauses, pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit)
      .all();

    // filled after the page is cut, so the lookup covers only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: withExternalRefs(this.db, result.items) };
  }

  getProjectStats(id: ProjectId): ProjectStats {
    // to prevent N+1, this has to be a an arrow of project ids
    // throws NotFoundError for an unknown or archived project
    this.getById(id);

    const today = Date.now();

    const count = (predicate: SQL) =>
      sql<number>`coalesce(sum(case when ${predicate} then 1 else 0 end), 0)`;

    const stats = this.db
      .select({
        numOfCompleted: count(sql`${tasks.status} = ${TaskStatus.COMPLETED}`),
        numOfNotStarted: count(sql`${tasks.status} = ${TaskStatus.NOT_STARTED}`),
        numOfInProgress: count(sql`${tasks.status} = ${TaskStatus.IN_PROGRESS}`),
        numOfCancelled: count(sql`${tasks.status} = ${TaskStatus.CANCELLED}`),
        numOfOverdue: count(
          // an undated task is never overdue, and neither is a closed one
          sql`${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${today} AND ${tasks.status} NOT IN (${TaskStatus.COMPLETED}, ${TaskStatus.CANCELLED})`,
        ),
        // cancelled tasks are left out so they do not dilute progress
        totalTasks: count(sql`${tasks.status} != ${TaskStatus.CANCELLED}`),
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, id), isNull(tasks.archivedAt)))
      .get();

    return (
      stats ?? {
        numOfCompleted: 0,
        numOfInProgress: 0,
        numOfNotStarted: 0,
        numOfCancelled: 0,
        numOfOverdue: 0,
        totalTasks: 0,
      }
    );
  }

  // An update's result as every read returns it, with `external`, after sending the change. Throws
  // NotFoundError when the update matched no row.
  private updated(id: ProjectId, row: Project | undefined): Project {
    if (!row) throw new NotFoundError(id);
    const project = withExternalRef(this.db, row);
    this.changes.emit({ type: 'updated', project });
    return project;
  }

  private activeProjects(condition: SQL<unknown>) {
    // automatically filters out archived projects
    return (
      this.db
        .select()
        .from(projects)
        .where(and(condition, isNull(projects.archivedAt)))
        // by default sort by created at (come back to this)
        .orderBy(desc(projects.createdAt))
    );
  }
}
