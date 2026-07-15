import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from '@common/ids';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { ArchiveService } from '../../archive/service';
import { ProjectStatus } from '../../projects/types';
import { TaskStatus } from '../../tasks/types';
import { NotFoundError } from '../../shared/errors';

const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);

const TOMORROW = new Date(Date.now() + 86_400_000);
const YESTERDAY = new Date(Date.now() - 86_400_000);
const NEXT_WEEK = new Date(Date.now() + 7 * 86_400_000);

function createDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, casing: 'snake_case' });
  migrate(db, { migrationsFolder: MIGRATIONS_PATH });
  sqlite.pragma('foreign_keys = OFF');
  return db;
}

let db: BetterSQLite3Database;
let projects: ProjectService;
let tasks: TaskService;
let archive: ArchiveService;

beforeEach(() => {
  db = createDb();
  projects = new ProjectService(db);
  tasks = new TaskService(db);
  archive = new ArchiveService(db);
});

describe('ProjectService — createProject', () => {
  it('creates a project and returns it with an assigned id', async () => {
    const project = await projects.createProject({ title: 'My Project', dueDate: TOMORROW });
    expect(project.id).toBeTruthy();
    expect(project.title).toBe('My Project');
  });

  it('defaults status to NOT_STARTED', async () => {
    const project = await projects.createProject({ title: 'New', dueDate: TOMORROW });
    expect(project.status).toBe(ProjectStatus.NOT_STARTED);
  });

  it('accepts an explicit status override', async () => {
    const project = await projects.createProject({
      title: 'Active',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    expect(project.status).toBe(ProjectStatus.ACTIVE);
  });

  it('sets completedAt when created with COMPLETED status', async () => {
    const before = new Date();
    const project = await projects.createProject({
      title: 'Done from the start',
      dueDate: TOMORROW,
      status: ProjectStatus.COMPLETED,
    });
    const after = new Date();
    expect(project.completedAt).not.toBeNull();
    expect(project.completedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(project.completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('leaves completedAt null for non-COMPLETED statuses', async () => {
    const notStarted = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const active = await projects.createProject({
      title: 'B',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    const onHold = await projects.createProject({
      title: 'C',
      dueDate: TOMORROW,
      status: ProjectStatus.ON_HOLD,
    });
    expect(notStarted.completedAt).toBeNull();
    expect(active.completedAt).toBeNull();
    expect(onHold.completedAt).toBeNull();
  });

  it('stores the provided description', async () => {
    const project = await projects.createProject({
      title: 'With desc',
      dueDate: TOMORROW,
      description: 'A great project',
    });
    expect(project.description).toBe('A great project');
  });

  it('sets description to null when not provided', async () => {
    const project = await projects.createProject({ title: 'No desc', dueDate: TOMORROW });
    expect(project.description).toBeNull();
  });

  it('stores the provided startDate', async () => {
    const project = await projects.createProject({
      title: 'With start',
      dueDate: TOMORROW,
      startDate: YESTERDAY,
    });
    expect(project.startDate).not.toBeNull();
    expect(project.startDate!.getTime()).toBe(YESTERDAY.getTime());
  });

  it('sets startDate to null when not provided', async () => {
    const project = await projects.createProject({ title: 'No start', dueDate: TOMORROW });
    expect(project.startDate).toBeNull();
  });

  it('stores the provided color', async () => {
    const project = await projects.createProject({
      title: 'Colorful',
      dueDate: TOMORROW,
      color: '#ff0000',
    });
    expect(project.color).toBe('#ff0000');
  });

  it('stores the provided dueDate', async () => {
    const project = await projects.createProject({ title: 'Due soon', dueDate: NEXT_WEEK });
    expect(project.dueDate.getTime()).toBe(NEXT_WEEK.getTime());
  });
});

describe('ProjectService — getById', () => {
  it('returns the project for a valid id', async () => {
    const created = await projects.createProject({ title: 'Find me', dueDate: TOMORROW });
    const found = await projects.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe('Find me');
  });

  it('returns null for an unknown id', async () => {
    const result = await projects.getById(generateId('project'));
    expect(result).toBeNull();
  });

  it('returns null for an archived project', async () => {
    const project = await projects.createProject({ title: 'Will be archived', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    const result = await projects.getById(project.id);
    expect(result).toBeNull();
  });
});

describe('ProjectService — getByIds', () => {
  it('returns all projects matching the provided ids', async () => {
    const a = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const b = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    await projects.createProject({ title: 'C', dueDate: TOMORROW }); // not requested
    const result = await projects.getByIds([a.id, b.id]);
    expect(result).toHaveLength(2);
    const ids = result.map((p) => p.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('returns an empty array when none of the ids match', async () => {
    const result = await projects.getByIds([generateId('project'), generateId('project')]);
    expect(result).toHaveLength(0);
  });

  it('excludes archived projects even when their id is requested', async () => {
    const project = await projects.createProject({ title: 'Archived', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    const result = await projects.getByIds([project.id]);
    expect(result).toHaveLength(0);
  });
});

describe('ProjectService — updateProject', () => {
  it('updates the title', async () => {
    const project = await projects.createProject({ title: 'Old title', dueDate: TOMORROW });
    const updated = await projects.updateProject(project.id, { title: 'New title' });
    expect(updated!.title).toBe('New title');
  });

  it('updates the description', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const updated = await projects.updateProject(project.id, { description: 'Added description' });
    expect(updated!.description).toBe('Added description');
  });

  it('updates the dueDate', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const updated = await projects.updateProject(project.id, { dueDate: NEXT_WEEK });
    expect(updated!.dueDate.getTime()).toBe(NEXT_WEEK.getTime());
  });

  it('updates the startDate', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const updated = await projects.updateProject(project.id, { startDate: YESTERDAY });
    expect(updated!.startDate!.getTime()).toBe(YESTERDAY.getTime());
  });

  it('updates the color', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const updated = await projects.updateProject(project.id, { color: '#00ff00' });
    expect(updated!.color).toBe('#00ff00');
  });

  it('returns null for an unknown id', async () => {
    const result = await projects.updateProject(generateId('project'), { title: 'Ghost' });
    expect(result).toBeNull();
  });

  it('persists only the fields that were passed', async () => {
    const project = await projects.createProject({
      title: 'Original',
      dueDate: TOMORROW,
      description: 'Original desc',
    });
    const updated = await projects.updateProject(project.id, { title: 'Changed' });
    expect(updated!.description).toBe('Original desc');
    expect(updated!.dueDate.getTime()).toBe(TOMORROW.getTime());
  });
});

describe('ProjectService — updateStatus', () => {
  it('updates the project status', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const updated = await projects.updateStatus(project.id, ProjectStatus.ACTIVE);
    expect(updated.status).toBe(ProjectStatus.ACTIVE);
  });

  it('sets completedAt when transitioning to COMPLETED', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const before = new Date();
    const updated = await projects.updateStatus(project.id, ProjectStatus.COMPLETED);
    const after = new Date();
    expect(updated.completedAt).not.toBeNull();
    expect(updated.completedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updated.completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('clears completedAt when transitioning away from COMPLETED', async () => {
    const project = await projects.createProject({
      title: 'Project',
      dueDate: TOMORROW,
      status: ProjectStatus.COMPLETED,
    });
    expect(project.completedAt).not.toBeNull();
    const updated = await projects.updateStatus(project.id, ProjectStatus.ACTIVE);
    expect(updated.completedAt).toBeNull();
  });

  it('completedAt stays null when transitioning between non-COMPLETED statuses', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const updated = await projects.updateStatus(project.id, ProjectStatus.ON_HOLD);
    expect(updated.completedAt).toBeNull();
  });

  it('transitioning through all non-COMPLETED statuses leaves completedAt null', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await projects.updateStatus(project.id, ProjectStatus.ACTIVE);
    const onHold = await projects.updateStatus(project.id, ProjectStatus.ON_HOLD);
    expect(onHold.completedAt).toBeNull();
  });
});

describe('ProjectService — listProjects', () => {
  it('returns all non-archived projects by default', async () => {
    const a = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const b = await projects.createProject({
      title: 'B',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    const archived = await projects.createProject({ title: 'Archived', dueDate: TOMORROW });
    await archive.archiveProject(archived.id);

    const result = await projects.listProjects();
    const ids = result.map((p) => p.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(archived.id);
  });

  it('filter.status returns only projects with that status', async () => {
    await projects.createProject({ title: 'Not started', dueDate: TOMORROW });
    const active = await projects.createProject({
      title: 'Active',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    const result = await projects.listProjects({ status: ProjectStatus.ACTIVE });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
  });

  it('filter.dueBefore returns projects due strictly before the date', async () => {
    const early = await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    const result = await projects.listProjects({ dueBefore: TOMORROW });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(early.id);
  });

  it('filter.dueAfter returns projects due strictly after the date', async () => {
    const late = await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    const result = await projects.listProjects({ dueAfter: TOMORROW });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(late.id);
  });

  it('filter.dueOn returns projects due on that calendar day', async () => {
    const today = new Date();
    const midday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const onDay = await projects.createProject({ title: 'Today', dueDate: midday });
    await projects.createProject({ title: 'Yesterday', dueDate: YESTERDAY });
    const result = await projects.listProjects({ dueOn: today });
    const ids = result.map((p) => p.id);
    expect(ids).toContain(onDay.id);
  });

  it('filter.dueOn does not include projects from the adjacent days', async () => {
    const today = new Date();
    await projects.createProject({ title: 'Yesterday', dueDate: YESTERDAY });
    await projects.createProject({ title: 'Tomorrow', dueDate: TOMORROW });
    const result = await projects.listProjects({ dueOn: today });
    expect(result).toHaveLength(0);
  });

  it('sort=dueDate orders by dueDate descending by default', async () => {
    const early = await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    const late = await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    const result = await projects.listProjects({}, { sortBy: 'dueDate' });
    expect(result[0].id).toBe(late.id);
    expect(result[result.length - 1].id).toBe(early.id);
  });

  it('sort=status orders by status descending by default', async () => {
    const completed = await projects.createProject({
      title: 'Completed',
      dueDate: TOMORROW,
      status: ProjectStatus.COMPLETED,
    });
    const active = await projects.createProject({
      title: 'Active',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    const notStarted = await projects.createProject({
      title: 'Not started',
      dueDate: TOMORROW,
    });
    const result = await projects.listProjects({}, { sortBy: 'status' });
    expect(result[0].id).toBe(completed.id);
    expect(result[1].id).toBe(active.id);
    expect(result[2].id).toBe(notStarted.id);
  });

  it('sort=lastUpdated orders by updatedAt descending', async () => {
    const a = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const b = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    await projects.updateProject(a.id, { title: 'A updated' });
    const result = await projects.listProjects({}, { sortBy: 'lastUpdated' });
    const ids = result.map((p) => p.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('direction=asc reverses the sort order', async () => {
    const early = await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    const late = await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    const result = await projects.listProjects({}, { sortBy: 'dueDate', direction: 'asc' });
    expect(result[0].id).toBe(early.id);
    expect(result[result.length - 1].id).toBe(late.id);
  });

  it('excludes archived projects regardless of filter', async () => {
    const project = await projects.createProject({
      title: 'Will archive',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    await archive.archiveProject(project.id);
    const result = await projects.listProjects({ status: ProjectStatus.ACTIVE });
    expect(result.map((p) => p.id)).not.toContain(project.id);
  });

  it('combines filter and sort correctly', async () => {
    const earlyActive = await projects.createProject({
      title: 'Early active',
      dueDate: YESTERDAY,
      status: ProjectStatus.ACTIVE,
    });
    const lateActive = await projects.createProject({
      title: 'Late active',
      dueDate: NEXT_WEEK,
      status: ProjectStatus.ACTIVE,
    });
    await projects.createProject({ title: 'Not started', dueDate: TOMORROW });

    const result = await projects.listProjects(
      { status: ProjectStatus.ACTIVE },
      { sortBy: 'dueDate', direction: 'asc' },
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(earlyActive.id);
    expect(result[1].id).toBe(lateActive.id);
  });
});

describe('ProjectService — getProjectStats', () => {
  it('throws NotFoundError for an unknown project id', async () => {
    await expect(projects.getProjectStats(generateId('project'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError for an archived project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    await expect(projects.getProjectStats(project.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('counts tasks grouped by status', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await tasks.createTask({
      title: 'Task 1',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.NOT_STARTED,
    });
    await tasks.createTask({
      title: 'Task 2',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    await tasks.createTask({
      title: 'Task 3',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.COMPLETED,
    });

    const stats = await projects.getProjectStats(project.id);
    expect(stats.numOfNotStarted).toBe(1);
    expect(stats.numOfInProgress).toBe(1);
    expect(stats.numOfCompleted).toBe(1);
  });

  it('counts overdue tasks (non-completed tasks past their due date)', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await tasks.createTask({
      title: 'Overdue not started',
      dueDate: YESTERDAY,
      projectId: project.id,
      status: TaskStatus.NOT_STARTED,
    });
    await tasks.createTask({
      title: 'Overdue in progress',
      dueDate: YESTERDAY,
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    // completed past due date should NOT be counted as overdue
    await tasks.createTask({
      title: 'Completed past due',
      dueDate: YESTERDAY,
      projectId: project.id,
      status: TaskStatus.COMPLETED,
    });
    // future due date should NOT be counted as overdue
    await tasks.createTask({
      title: 'Future task',
      dueDate: NEXT_WEEK,
      projectId: project.id,
      status: TaskStatus.NOT_STARTED,
    });

    const stats = await projects.getProjectStats(project.id);
    expect(stats.numOfOverdue).toBe(2);
  });

  it('does not count tasks from other projects', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });

    await tasks.createTask({
      title: 'Task for B',
      dueDate: TOMORROW,
      projectId: projectB.id,
      status: TaskStatus.IN_PROGRESS,
    });

    const stats = await projects.getProjectStats(projectA.id);
    expect(stats.numOfInProgress).toBe(0);
    expect(stats.totalTasks).toBe(0);
  });

  it('excludes archived tasks from all counts', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Will be archived',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    await archive.archiveTask(task.id);

    const stats = await projects.getProjectStats(project.id);
    expect(stats.numOfInProgress).toBe(0);
    expect(stats.totalTasks).toBe(0);
  });

  it('totalTasks reflects the count of non-archived tasks in the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await tasks.createTask({
      title: 'Task 1',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    await tasks.createTask({ title: 'Task 2', dueDate: TOMORROW, projectId: project.id });
    const t3 = await tasks.createTask({
      title: 'Task 3',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    await archive.archiveTask(t3.id);
    // unrelated task
    await tasks.createTask({ title: 'Unrelated', dueDate: TOMORROW });

    const stats = await projects.getProjectStats(project.id);
    expect(stats.totalTasks).toBe(2);
  });
});

describe('ArchiveService — archiveProject', () => {
  it('sets archivedAt to a recent timestamp', async () => {
    const project = await projects.createProject({ title: 'To archive', dueDate: TOMORROW });
    const before = new Date();
    const archived = await archive.archiveProject(project.id);
    const after = new Date();
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(archived.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns the updated project row', async () => {
    const project = await projects.createProject({ title: 'Archivable', dueDate: TOMORROW });
    const result = await archive.archiveProject(project.id);
    expect(result.id).toBe(project.id);
    expect(result.title).toBe('Archivable');
  });

  it('archived project is no longer returned by ProjectService.getById', async () => {
    const project = await projects.createProject({ title: 'Gone', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    expect(await projects.getById(project.id)).toBeNull();
  });

  it('archived project is excluded from ProjectService.listProjects', async () => {
    const project = await projects.createProject({ title: 'Gone', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    const result = await projects.listProjects();
    expect(result.map((p) => p.id)).not.toContain(project.id);
  });

  it('archives all tasks belonging to the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const t1 = await tasks.createTask({
      title: 'Task 1',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const t2 = await tasks.createTask({
      title: 'Task 2',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    await archive.archiveProject(project.id);
    expect(await tasks.getById(t1.id)).toBeNull();
    expect(await tasks.getById(t2.id)).toBeNull();
  });

  it('archives subtasks of tasks belonging to the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    await archive.archiveProject(project.id);
    expect(await tasks.getById(sub.id)).toBeNull();
  });

  it('does not archive tasks belonging to a different project', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const taskInB = await tasks.createTask({
      title: 'Task in B',
      dueDate: TOMORROW,
      projectId: projectB.id,
    });
    await archive.archiveProject(projectA.id);
    expect(await tasks.getById(taskInB.id)).not.toBeNull();
  });

  it('overwrites archivedAt of already-archived tasks with the project archive timestamp', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Pre-archived',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    await archive.archiveTask(task.id);

    const before = new Date();
    await archive.archiveProject(project.id);
    const after = new Date();

    // archiveProject stamps all tasks with a fresh timestamp regardless of prior archive state
    const { tasks: tasksTable } = await import('@main/db/schema/tasks');
    const { eq: drizzleEq } = await import('drizzle-orm');
    const [raw] = await db.select().from(tasksTable).where(drizzleEq(tasksTable.id, task.id));
    expect(raw.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(raw.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('ArchiveService — restoreProject', () => {
  it('clears archivedAt on the project', async () => {
    const project = await projects.createProject({ title: 'Restore me', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    const restored = await archive.restoreProject(project.id);
    expect(restored.archivedAt).toBeNull();
  });

  it('returns the updated project row', async () => {
    const project = await projects.createProject({ title: 'Restore me', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    const result = await archive.restoreProject(project.id);
    expect(result.id).toBe(project.id);
    expect(result.title).toBe('Restore me');
  });

  it('restored project is visible via ProjectService.getById', async () => {
    const project = await projects.createProject({ title: 'Restored', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    await archive.restoreProject(project.id);
    const found = await projects.getById(project.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(project.id);
  });

  it('restored project appears in ProjectService.listProjects', async () => {
    const project = await projects.createProject({ title: 'Restored', dueDate: TOMORROW });
    await archive.archiveProject(project.id);
    await archive.restoreProject(project.id);
    const result = await projects.listProjects();
    expect(result.map((p) => p.id)).toContain(project.id);
  });

  it('restores all tasks that were archived with the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const t1 = await tasks.createTask({
      title: 'Task 1',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const t2 = await tasks.createTask({
      title: 'Task 2',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    await archive.archiveProject(project.id);
    await archive.restoreProject(project.id);
    expect(await tasks.getById(t1.id)).not.toBeNull();
    expect(await tasks.getById(t2.id)).not.toBeNull();
  });

  it('restored tasks appear in TaskService.listTasks', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    await archive.archiveProject(project.id);
    await archive.restoreProject(project.id);
    const result = await tasks.listTasks({ status: TaskStatus.IN_PROGRESS });
    expect(result.map((t) => t.id)).toContain(task.id);
  });

  it('restores tasks that were independently archived before the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const independentlyArchived = await tasks.createTask({
      title: 'Archived independently',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const projectTask = await tasks.createTask({
      title: 'Archived with project',
      dueDate: TOMORROW,
      projectId: project.id,
    });

    // archive one task independently before archiving the project
    await archive.archiveTask(independentlyArchived.id);
    await archive.archiveProject(project.id);
    await archive.restoreProject(project.id);

    const restoredTask = await tasks.getById(projectTask.id);
    expect(restoredTask).not.toBeNull();
  });

  it('restoring a project does not affect tasks from other projects', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const taskInB = await tasks.createTask({
      title: 'Task in B',
      dueDate: TOMORROW,
      projectId: projectB.id,
    });
    await archive.archiveProject(projectA.id);
    await archive.restoreProject(projectA.id);
    // taskInB was never archived, should still be visible
    expect(await tasks.getById(taskInB.id)).not.toBeNull();
  });
});
