import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateId } from '@common/ids';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { ArchiveService } from '../../archive/service';
import { NoteService } from '../../notes/service';
import { ProjectStatus } from '../../projects/types';
import { TaskStatus } from '../../tasks/types';
import { AlreadyArchivedError, NotArchivedError, NotFoundError } from '../../shared/errors';
import { createDb } from '../utils';
import { InvalidCursorError } from '../../shared/pagination';
import { projects as projectsTable } from '@main/db/schema/projects';
import { tasks as tasksSchema } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';

const TOMORROW = new Date(Date.now() + 86_400_000);
const YESTERDAY = new Date(Date.now() - 86_400_000);
const NEXT_WEEK = new Date(Date.now() + 7 * 86_400_000);

let db: BetterSQLite3Database;
let projects: ProjectService;
let tasks: TaskService;
let archive: ArchiveService;
let notesService: NoteService;
let workspacePath: string;

beforeEach(async () => {
  db = createDb();
  projects = new ProjectService(db);
  tasks = new TaskService(db);
  archive = new ArchiveService(db);
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-projects-service-'));
  notesService = new NoteService(db, workspacePath);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
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
    expect(project.dueDate!.getTime()).toBe(NEXT_WEEK.getTime());
  });
});

describe('ProjectService — getById', () => {
  it('returns the project for a valid id', async () => {
    const created = await projects.createProject({ title: 'Find me', dueDate: TOMORROW });
    const found = await projects.getById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.title).toBe('Find me');
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(projects.getById(generateId('project'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an archived project', async () => {
    const project = await projects.createProject({ title: 'Will be archived', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    await expect(projects.getById(project.id)).rejects.toBeInstanceOf(NotFoundError);
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
    archive.archiveProject(project.id);
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
    expect(updated!.dueDate!.getTime()).toBe(NEXT_WEEK.getTime());
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
    expect(updated!.dueDate!.getTime()).toBe(TOMORROW.getTime());
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
    archive.archiveProject(archived.id);

    const result = (await projects.listProjects()).items;
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
    const result = (await projects.listProjects({ status: ProjectStatus.ACTIVE })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
  });

  it('filter.dueBefore returns projects due strictly before the date', async () => {
    const early = await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    const result = (await projects.listProjects({ dueBefore: TOMORROW })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(early.id);
  });

  it('filter.dueAfter returns projects due strictly after the date', async () => {
    const late = await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    const result = (await projects.listProjects({ dueAfter: TOMORROW })).items;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(late.id);
  });

  it('filter.dueOn returns projects due on that calendar day', async () => {
    const today = new Date();
    const midday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const onDay = await projects.createProject({ title: 'Today', dueDate: midday });
    await projects.createProject({ title: 'Yesterday', dueDate: YESTERDAY });
    const result = (await projects.listProjects({ dueOn: today })).items;
    const ids = result.map((p) => p.id);
    expect(ids).toContain(onDay.id);
  });

  it('filter.dueOn does not include projects from the adjacent days', async () => {
    const today = new Date();
    await projects.createProject({ title: 'Yesterday', dueDate: YESTERDAY });
    await projects.createProject({ title: 'Tomorrow', dueDate: TOMORROW });
    const result = (await projects.listProjects({ dueOn: today })).items;
    expect(result).toHaveLength(0);
  });

  it('sort=dueDate orders by dueDate descending by default', async () => {
    const early = await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    const late = await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    const result = (await projects.listProjects({}, { sortBy: 'dueDate' })).items;
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
    const result = (await projects.listProjects({}, { sortBy: 'status' })).items;
    expect(result[0].id).toBe(completed.id);
    expect(result[1].id).toBe(active.id);
    expect(result[2].id).toBe(notStarted.id);
  });

  it('sort=updatedAt orders by updatedAt descending', async () => {
    const a = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const b = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    await projects.updateProject(a.id, { title: 'A updated' });
    const result = (await projects.listProjects({}, { sortBy: 'updatedAt' })).items;
    const ids = result.map((p) => p.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('direction=asc reverses the sort order', async () => {
    const early = await projects.createProject({ title: 'Early', dueDate: YESTERDAY });
    const late = await projects.createProject({ title: 'Late', dueDate: NEXT_WEEK });
    const result = (await projects.listProjects({}, { sortBy: 'dueDate', direction: 'asc' })).items;
    expect(result[0].id).toBe(early.id);
    expect(result[result.length - 1].id).toBe(late.id);
  });

  it('excludes archived projects regardless of filter', async () => {
    const project = await projects.createProject({
      title: 'Will archive',
      dueDate: TOMORROW,
      status: ProjectStatus.ACTIVE,
    });
    archive.archiveProject(project.id);
    const result = (await projects.listProjects({ status: ProjectStatus.ACTIVE })).items;
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

    const result = (
      await projects.listProjects(
        { status: ProjectStatus.ACTIVE },
        { sortBy: 'dueDate', direction: 'asc' },
      )
    ).items;
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
    archive.archiveProject(project.id);
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
    archive.archiveTask(task.id);

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
    archive.archiveTask(t3.id);
    // unrelated task
    await tasks.createTask({ title: 'Unrelated', dueDate: TOMORROW });

    const stats = await projects.getProjectStats(project.id);
    expect(stats.totalTasks).toBe(2);
  });

  it('counts cancelled tasks separately and leaves them out of totalTasks and overdue', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const create = (title: string, status: TaskStatus) =>
      tasks.createTask({ title, dueDate: YESTERDAY, projectId: project.id, status });
    await create('Not started', TaskStatus.NOT_STARTED);
    await create('In progress', TaskStatus.IN_PROGRESS);
    await create('Completed 1', TaskStatus.COMPLETED);
    await create('Completed 2', TaskStatus.COMPLETED);
    await create('Cancelled 1', TaskStatus.CANCELLED);
    await create('Cancelled 2', TaskStatus.CANCELLED);
    await create('Cancelled 3', TaskStatus.CANCELLED);

    const stats = await projects.getProjectStats(project.id);
    expect(stats).toEqual({
      numOfNotStarted: 1,
      numOfInProgress: 1,
      numOfCompleted: 2,
      numOfCancelled: 3,
      // only the open tasks past their due date
      numOfOverdue: 2,
      totalTasks: 4,
    });
  });
});

describe('ArchiveService — archiveProject', () => {
  it('sets archivedAt to a recent timestamp', async () => {
    const project = await projects.createProject({ title: 'To archive', dueDate: TOMORROW });
    const before = new Date();
    const archived = archive.archiveProject(project.id);
    const after = new Date();
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(archived.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns the updated project row', async () => {
    const project = await projects.createProject({ title: 'Archivable', dueDate: TOMORROW });
    const result = archive.archiveProject(project.id);
    expect(result.id).toBe(project.id);
    expect(result.title).toBe('Archivable');
  });

  it('archived project is no longer returned by ProjectService.getById', async () => {
    const project = await projects.createProject({ title: 'Gone', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    await expect(projects.getById(project.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archived project is excluded from ProjectService.listProjects', async () => {
    const project = await projects.createProject({ title: 'Gone', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    const result = (await projects.listProjects()).items;
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
    archive.archiveProject(project.id);
    await expect(tasks.getById(t1.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(tasks.getById(t2.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archives subtasks of tasks belonging to the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    archive.archiveProject(project.id);
    await expect(tasks.getById(sub.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not archive tasks belonging to a different project', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const taskInB = await tasks.createTask({
      title: 'Task in B',
      dueDate: TOMORROW,
      projectId: projectB.id,
    });
    archive.archiveProject(projectA.id);
    await expect(tasks.getById(taskInB.id)).resolves.toMatchObject({ id: taskInB.id });
  });

  it('overwrites archivedAt of already-archived tasks with the project archive timestamp', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Pre-archived',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    archive.archiveTask(task.id);

    const before = new Date();
    archive.archiveProject(project.id);
    const after = new Date();

    // archiveProject stamps all tasks with a fresh timestamp regardless of prior archive state
    const { tasks: tasksTable } = await import('@main/db/schema/tasks');
    const { eq: drizzleEq } = await import('drizzle-orm');
    const [raw] = await db.select().from(tasksTable).where(drizzleEq(tasksTable.id, task.id));
    expect(raw.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(raw.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('archives notes directly owned by the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const note = await notesService.createNote({ projectId: project.id });
    archive.archiveProject(project.id);
    await expect(notesService.getById(note.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archives notes linked to the project's tasks", async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const taskNote = await notesService.createNote({ linkedTaskId: task.id });
    archive.archiveProject(project.id);
    await expect(notesService.getById(taskNote.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archives notes linked to a subtask of one of the project's tasks", async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const parent = await tasks.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const sub = await tasks.createSubtask(parent.id, { title: 'Sub' });
    const subNote = await notesService.createNote({ linkedTaskId: sub.id });
    archive.archiveProject(project.id);
    await expect(notesService.getById(subNote.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not archive notes belonging to a different project', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const noteInB = await notesService.createNote({ projectId: projectB.id });
    archive.archiveProject(projectA.id);
    await expect(notesService.getById(noteInB.id)).resolves.toMatchObject({ id: noteInB.id });
  });

  it('does not archive notes linked to a task in a different project', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const taskInB = await tasks.createTask({
      title: 'Task in B',
      dueDate: TOMORROW,
      projectId: projectB.id,
    });
    const noteInB = await notesService.createNote({ linkedTaskId: taskInB.id });
    archive.archiveProject(projectA.id);
    await expect(notesService.getById(noteInB.id)).resolves.toMatchObject({ id: noteInB.id });
  });

  it('does not archive unrelated notes (no project, no linked task)', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const unrelated = await notesService.createNote({ title: 'Unrelated' });
    archive.archiveProject(project.id);
    await expect(notesService.getById(unrelated.id)).resolves.toMatchObject({ id: unrelated.id });
  });

  it('throws NotFoundError for an unknown project id', async () => {
    expect(() => archive.archiveProject(generateId('project'))).toThrow(NotFoundError);
  });

  it('throws AlreadyArchivedError when the project is already archived', async () => {
    const project = await projects.createProject({ title: 'Archive me once', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    expect(() => archive.archiveProject(project.id)).toThrow(AlreadyArchivedError);
  });
});

describe('ArchiveService — restoreProject', () => {
  it('clears archivedAt on the project', async () => {
    const project = await projects.createProject({ title: 'Restore me', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    const restored = archive.restoreProject(project.id);
    expect(restored.archivedAt).toBeNull();
  });

  it('returns the updated project row', async () => {
    const project = await projects.createProject({ title: 'Restore me', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    const result = archive.restoreProject(project.id);
    expect(result.id).toBe(project.id);
    expect(result.title).toBe('Restore me');
  });

  it('restored project is visible via ProjectService.getById', async () => {
    const project = await projects.createProject({ title: 'Restored', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);
    const found = await projects.getById(project.id);
    expect(found.id).toBe(project.id);
  });

  it('restored project appears in ProjectService.listProjects', async () => {
    const project = await projects.createProject({ title: 'Restored', dueDate: TOMORROW });
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);
    const result = (await projects.listProjects()).items;
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
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);
    await expect(tasks.getById(t1.id)).resolves.toMatchObject({ id: t1.id });
    await expect(tasks.getById(t2.id)).resolves.toMatchObject({ id: t2.id });
  });

  it('restored tasks appear in TaskService.listTasks', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);
    const result = (await tasks.listTasks({ status: TaskStatus.IN_PROGRESS })).items;
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
    archive.archiveTask(independentlyArchived.id);
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);

    const restoredTask = await tasks.getById(projectTask.id);
    expect(restoredTask.id).toBe(projectTask.id);
  });

  it('restoring a project does not affect tasks from other projects', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const taskInB = await tasks.createTask({
      title: 'Task in B',
      dueDate: TOMORROW,
      projectId: projectB.id,
    });
    archive.archiveProject(projectA.id);
    archive.restoreProject(projectA.id);
    // taskInB was never archived, should still be visible
    await expect(tasks.getById(taskInB.id)).resolves.toMatchObject({ id: taskInB.id });
  });

  it('restores notes directly owned by the project', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const note = await notesService.createNote({ projectId: project.id });
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);
    await expect(notesService.getById(note.id)).resolves.toMatchObject({ id: note.id });
  });

  it("restores notes linked to the project's tasks", async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    const task = await tasks.createTask({
      title: 'Task',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const taskNote = await notesService.createNote({ linkedTaskId: task.id });
    archive.archiveProject(project.id);
    archive.restoreProject(project.id);
    await expect(notesService.getById(taskNote.id)).resolves.toMatchObject({ id: taskNote.id });
  });

  it('does not restore notes belonging to a different project', async () => {
    const projectA = await projects.createProject({ title: 'A', dueDate: TOMORROW });
    const projectB = await projects.createProject({ title: 'B', dueDate: TOMORROW });
    const noteInB = await notesService.createNote({ projectId: projectB.id });
    archive.archiveNote(noteInB.id);
    archive.archiveProject(projectA.id);
    archive.restoreProject(projectA.id);
    // noteInB was archived independently, restoring project A shouldn't touch it
    await expect(notesService.getById(noteInB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown project id', async () => {
    expect(() => archive.restoreProject(generateId('project'))).toThrow(NotFoundError);
  });

  it('throws NotArchivedError when the project is not archived', async () => {
    const project = await projects.createProject({ title: 'Never archived', dueDate: TOMORROW });
    expect(() => archive.restoreProject(project.id)).toThrow(NotArchivedError);
  });
});

describe('ProjectService — cursor pagination', () => {
  async function collect(sort: Parameters<ProjectService['listProjects']>[1], limit: number) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await projects.listProjects({}, sort, { limit, cursor });
      expect(page.items.length).toBeLessThanOrEqual(limit);
      ids.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  async function seed(n: number) {
    const created = [];
    for (let i = 0; i < n; i++) {
      created.push(
        await projects.createProject({
          title: `P${i}`,
          dueDate: new Date(Date.now() + (i % 3) * 86_400_000),
          status: ((i % 4) + 1) as ProjectStatus,
        }),
      );
    }
    return created;
  }

  it('returns a null nextCursor when everything fits', async () => {
    await seed(2);
    const page = await projects.listProjects();
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('paginated order matches unpaginated order for every sort and direction', async () => {
    await seed(9);
    for (const sortBy of ['dueDate', 'createdAt', 'updatedAt', 'status'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        const full = (await projects.listProjects({}, { sortBy, direction }, { limit: 200 })).items;
        expect(await collect({ sortBy, direction }, 2)).toEqual(full.map((p) => p.id));
      }
    }
  });

  it('does not return archived projects on later pages', async () => {
    const created = await seed(4);
    const first = await projects.listProjects({}, { sortBy: 'createdAt' }, { limit: 2 });
    archive.archiveProject(created[0].id);
    const second = await projects.listProjects(
      {},
      { sortBy: 'createdAt' },
      { limit: 2, cursor: first.nextCursor! },
    );
    expect(second.items.map((p) => p.id)).toEqual([created[1].id]);
  });

  it('rejects invalid limit, garbage cursor and mismatched-sort cursor', async () => {
    await seed(3);
    await expect(projects.listProjects({}, undefined, { limit: 0 })).rejects.toThrow(RangeError);
    await expect(projects.listProjects({}, undefined, { cursor: 'x' })).rejects.toThrow(
      InvalidCursorError,
    );
    const page = await projects.listProjects({}, { sortBy: 'createdAt' }, { limit: 1 });
    await expect(
      projects.listProjects({}, { sortBy: 'status' }, { cursor: page.nextCursor! }),
    ).rejects.toThrow(InvalidCursorError);
  });
});

describe('ProjectService — undated projects', () => {
  // local projects always get a due date; synced ones may not, so tests clear it on the row directly
  async function undated(title: string) {
    const project = await projects.createProject({ title, dueDate: TOMORROW });
    await db.update(projectsTable).set({ dueDate: null }).where(eq(projectsTable.id, project.id));
    return { ...project, dueDate: null };
  }

  async function collect(direction: 'asc' | 'desc', limit: number) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await projects.listProjects(
        {},
        { sortBy: 'dueDate', direction },
        { limit, cursor },
      );
      ids.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  it('reads back a null dueDate', async () => {
    const project = await undated('No date');
    expect((await projects.getById(project.id)).dueDate).toBeNull();
  });

  it.each(['asc', 'desc'] as const)(
    'pages %s with undated projects last, without skipping or repeating',
    async (direction) => {
      const all = [];
      for (let i = 0; i < 3; i++) {
        all.push(
          await projects.createProject({ title: `D${i}`, dueDate: i ? TOMORROW : NEXT_WEEK }),
        );
        all.push(await undated(`U${i}`));
      }
      const sign = direction === 'asc' ? 1 : -1;
      const byId = (a: { id: string }, b: { id: string }) => sign * (a.id < b.id ? -1 : 1);
      const expected = [
        ...all
          .filter((p) => p.dueDate !== null)
          .sort((a, b) => sign * (a.dueDate!.getTime() - b.dueDate!.getTime()) || byId(a, b)),
        ...all.filter((p) => p.dueDate === null).sort(byId),
      ].map((p) => p.id);

      for (const limit of [1, 2, 4]) {
        expect(await collect(direction, limit)).toEqual(expected);
      }
    },
  );

  it('excludes undated projects from dueBefore, dueAfter and dueOn', async () => {
    const before = await projects.createProject({ title: 'Yesterday', dueDate: YESTERDAY });
    const after = await projects.createProject({ title: 'Next week', dueDate: NEXT_WEEK });
    const on = await projects.createProject({ title: 'Tomorrow', dueDate: TOMORROW });
    await undated('No date');

    const ids = async (filter: Parameters<ProjectService['listProjects']>[0]) =>
      (await projects.listProjects(filter, undefined, { limit: 200 })).items.map((p) => p.id);

    expect(await ids({ dueBefore: new Date() })).toEqual([before.id]);
    expect(await ids({ dueAfter: TOMORROW })).toEqual([after.id]);
    expect(await ids({ dueOn: TOMORROW })).toEqual([on.id]);
  });

  it('getProjectStats does not count an undated incomplete task as overdue', async () => {
    const project = await projects.createProject({ title: 'Project', dueDate: TOMORROW });
    await tasks.createTask({ title: 'Overdue', dueDate: YESTERDAY, projectId: project.id });
    const task = await tasks.createTask({
      title: 'Undated',
      dueDate: YESTERDAY,
      projectId: project.id,
    });
    await db.update(tasksSchema).set({ dueDate: null }).where(eq(tasksSchema.id, task.id));

    const stats = await projects.getProjectStats(project.id);
    expect(stats.numOfOverdue).toBe(1);
    expect(stats.totalTasks).toBe(2);
  });
});
