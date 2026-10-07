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
import { eq, inArray, SQL, sql, and, isNull, desc, gt, gte, lt } from 'drizzle-orm';
import { localDayWindow } from '../shared/utils';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { keyset, Page, PageOptions } from '../shared/pagination';
import { NotFoundError } from '../shared/errors';
import { tasks } from '@main/db/schema/tasks';
import { TaskStatus } from '../tasks/types';

export class ProjectService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async getById(id: ProjectId): Promise<Project> {
    const [row] = await this.activeProjects(eq(projects.id, id)).limit(1);
    if (!row) throw new NotFoundError(id);
    return row;
  }

  async getByIds(ids: ProjectId[]): Promise<Project[]> {
    return this.activeProjects(inArray(projects.id, ids));
  }

  async createProject(options: CreateProjectOptions): Promise<Project> {
    const newProject = {
      title: options.title,
      description: options.description ?? null,
      startDate: options.startDate ?? null,
      dueDate: options.dueDate,
      color: options.color ?? null,
      status: options.status ?? ProjectStatus.NOT_STARTED,
      completedAt: options.status === ProjectStatus.COMPLETED ? new Date() : null,
    };
    const [project] = await this.db.insert(projects).values(newProject).returning();
    return project;
  }

  async updateProject(id: ProjectId, updates: UpdateProjectOptions): Promise<Project | null> {
    const [updatedProject] = await this.db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return updatedProject ?? null;
  }

  async updateStatus(id: ProjectId, newStatus: ProjectStatus): Promise<Project> {
    const [row] = await this.db
      .update(projects)
      .set({
        // if a project is now complete, set a new completedAt timestamp
        // if not, set it to null (this also applies to projects that were once completed and have their status changed)
        completedAt: newStatus === ProjectStatus.COMPLETED ? new Date() : null,
        status: newStatus,
      })
      .where(eq(projects.id, id))
      .returning();

    return row;
  }

  async listProjects(
    filter: ProjectFilterOptions = {},
    sort: ProjectSortOptions = { sortBy: 'createdAt' },
    page: PageOptions = {},
  ): Promise<Page<Project>> {
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
        nullable: sort.sortBy === 'dueDate',
      },
      page,
    );

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...clauses, pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);

    return pager.toPage(rows);
  }

  async getProjectStats(id: ProjectId): Promise<ProjectStats> {
    // to prevent N+1, this has to be a an arrow of project ids
    // throws NotFoundError for an unknown or archived project
    await this.getById(id);

    const today = Date.now();

    const count = (predicate: SQL) =>
      sql<number>`coalesce(sum(case when ${predicate} then 1 else 0 end), 0)`;

    const [stats] = await this.db
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
      .where(and(eq(tasks.projectId, id), isNull(tasks.archivedAt)));

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
