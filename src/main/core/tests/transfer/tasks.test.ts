import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { createDb } from '../utils';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskChange, TaskService } from '../../tasks/service';
import { TaskPriority, TaskStatus, type Task } from '../../tasks/types';
import { AuthType, Provider, SourceType } from '../../integrations/types';
import { ImportFileError, InvalidInputError } from '../../shared/errors';
import type { TaskDefaults } from '../../tasks/defaults';
import { MAX_TASK_FILE_BYTES, MAX_TASK_DEPTH } from '../../transfer/limits';
import { TransferService } from '../../transfer/service';
import { collectPages } from '../../shared/pagination';

// every active task, oldest first, as the export reads them
function allTasks(service: TaskService) {
  return collectPages((page) =>
    service.listTasks({}, { sortBy: 'createdAt', direction: 'asc' }, page),
  );
}

// Importing and exporting tasks through TransferService, over real services and a database.

// a fixed afternoon, local time: the default due dates count from its day
const NOW = new Date(2026, 9, 31, 15, 30);
const day = (month: number, date: number) => new Date(2026, month - 1, date);

let db: BetterSQLite3Database;
let dir: string;
let tasks: TaskService;
let projects: ProjectService;
let defaults: TaskDefaults;
let transfer: TransferService;

function serviceOver(database: BetterSQLite3Database): {
  tasks: TaskService;
  projects: ProjectService;
  transfer: TransferService;
} {
  const t = new TaskService(database);
  const p = new ProjectService(database);
  const service = new TransferService({
    tasks: t,
    notes: new NoteService(database, dir),
    projects: p,
    taskDefaults: () => defaults,
    now: () => NOW,
  });
  return { tasks: t, projects: p, transfer: service };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-transfer-tasks-'));
  db = createDb();
  defaults = { defaultDueDate: 'today', defaultPriority: TaskPriority.LOW };
  ({ tasks, projects, transfer } = serviceOver(db));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

// what a round trip keeps of a task, its subtasks by title
function shape(all: Task[], projectTitle: (task: Task) => string | null = () => null) {
  const byParent = (parentId: TaskId | null): unknown[] =>
    all
      .filter((task) => task.parentTaskId === parentId)
      .map((task) => ({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        pullRequestUrl: task.pullRequestUrl,
        project: projectTitle(task),
        subtasks: byParent(task.id),
      }));
  return byParent(null);
}

function seed() {
  const website = projects.createProject({ title: 'Website', dueDate: day(12, 1) });
  const launch = tasks.createTask({
    title: 'Launch, "v2"',
    description: 'Line one\nLine two, with a comma',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    startDate: day(11, 1),
    dueDate: day(11, 5),
    projectId: website.id,
    pullRequestUrl: 'https://github.com/acme/site/pull/12',
  });
  const copy = tasks.createSubtask(launch.id, { title: '=Write copy', dueDate: day(11, 3) });
  tasks.createSubtask(copy.id, { title: 'Proofread', status: TaskStatus.COMPLETED });
  tasks.createTask({ title: 'Cancelled idea', status: TaskStatus.CANCELLED, dueDate: day(11, 9) });
  return { website, launch };
}

describe.each(['csv', 'json'] as const)('a %s export', (format) => {
  it('imports into another workspace as it was, subtasks included', async () => {
    seed();
    const { content, count } = transfer.exportTasks(format);
    expect(count).toBe(4);

    const other = serviceOver(createDb());
    other.projects.createProject({ title: 'website', dueDate: day(12, 1) });
    const summary = other.transfer.importTasks(content, format);

    expect(summary).toEqual({ created: 4, skipped: [], errors: [], warnings: [] });
    const titleOf = (all: Task[], ps: ProjectService) => (task: Task) =>
      task.projectId ? ps.getById(task.projectId).title.toLowerCase() : null;
    expect(shape(allTasks(other.tasks), titleOf(allTasks(other.tasks), other.projects))).toEqual(
      shape(allTasks(tasks), titleOf(allTasks(tasks), projects)),
    );
  });

  it('imports nothing again into the workspace it came from', () => {
    seed();
    const { content } = transfer.exportTasks(format);
    const summary = transfer.importTasks(content, format);
    expect(summary.created).toBe(0);
    expect(summary.skipped.map(({ message }) => message)).toEqual([
      'Already in this workspace',
      // the subtasks of a task already there
      expect.stringContaining('parent task (row'),
      expect.stringContaining('parent task (row'),
      'Already in this workspace',
    ]);
  });

  it('writes to the file chosen', async () => {
    seed();
    const filePath = path.join(dir, `out.${format}`);
    const result = await transfer.exportTasksToFile(filePath, format);
    expect(result).toEqual({ path: filePath, format, count: 4 });
    expect(await fs.readFile(filePath, 'utf8')).toBe(transfer.exportTasks(format).content);
  });
});

describe('the export', () => {
  it('leaves archived tasks out and marks synced ones with their source and key', () => {
    const archived = tasks.createTask({ title: 'Archived', dueDate: day(11, 1) });
    db.update(tasksTable).set({ archivedAt: NOW }).run();
    const synced = tasks.createTask({ title: 'From Linear', dueDate: day(11, 2) });
    linkToLinear(synced.id, 'ENG-124');

    const exported = JSON.parse(transfer.exportTasks('json').content);
    expect(exported).toMatchObject({ format: 'devbrain.tasks', version: 1 });
    expect(exported.tasks).toEqual([
      expect.objectContaining({
        id: synced.id,
        title: 'From Linear',
        source: 'linear',
        externalKey: 'ENG-124',
        externalUrl: 'https://linear.app/acme/issue/ENG-124',
      }),
    ]);
    expect(JSON.stringify(exported)).not.toContain(archived.id);

    const csv = transfer.exportTasks('csv').content;
    expect(csv.startsWith('﻿id,parent_id,title,')).toBe(true);
    expect(csv).toContain(',linear,ENG-124,');
  });

  it('skips synced tasks on import: their integration brings them back', () => {
    const summary = transfer.importTasks(
      'title,source,external_key\nFrom Linear,linear,ENG-124\nMine,local,\n',
      'csv',
    );
    expect(summary.created).toBe(1);
    expect(summary.skipped).toEqual([
      {
        row: 2,
        title: 'From Linear',
        message: expect.stringContaining('Synced from linear (ENG-124)'),
      },
    ]);
  });
});

describe('importing rows', () => {
  it('fills a missing due date from the default due date setting, and a subtask from its parent', () => {
    const csv = 'id,parent_id,title,due_date\na,,Today,\nb,a,Sub,\nc,,Dated,2026-12-24\n';
    transfer.importTasks(csv, 'csv');
    defaults = { defaultDueDate: 'tomorrow', defaultPriority: TaskPriority.HIGH };
    transfer.importTasks('title\nTomorrow\n', 'csv');
    defaults = { defaultDueDate: 'nextWeek', defaultPriority: TaskPriority.MEDIUM };
    transfer.importTasks('[{"title": "Next week"}]', 'json');

    const byTitle = new Map(allTasks(tasks).map((task) => [task.title, task]));
    expect(byTitle.get('Today')).toMatchObject({
      dueDate: day(10, 31),
      priority: TaskPriority.LOW,
    });
    expect(byTitle.get('Sub')).toMatchObject({ dueDate: day(10, 31) });
    expect(byTitle.get('Dated')).toMatchObject({ dueDate: day(12, 24) });
    expect(byTitle.get('Tomorrow')).toMatchObject({
      dueDate: day(11, 1),
      priority: TaskPriority.HIGH,
    });
    expect(byTitle.get('Next week')).toMatchObject({
      dueDate: day(11, 7),
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.NOT_STARTED,
    });
  });

  it('reports bad rows by row number and imports the rest', () => {
    const csv = [
      'id,parent_id,Title,Status,Priority,Due Date,Pull Request URL',
      'a,,Good,In Progress,high,2026-11-02,',
      ',,,,,,',
      'c,,   ,,,2026-11-02,',
      'd,,Bad status,blocked,,,',
      'e,d,Child of bad,,,,',
      'f,,Bad priority,,urgent,,',
      'g,,Bad date,,,11/02/2026,',
      'h,,Bad link,,,,javascript:alert(1)',
      'i,,Done,DONE,,,',
    ].join('\n');
    const summary = transfer.importTasks(csv, 'csv');

    expect(summary.created).toBe(2);
    expect(summary.errors).toEqual([
      { row: 4, title: null, message: 'Title is missing' },
      { row: 5, title: 'Bad status', message: expect.stringContaining('Unknown status "blocked"') },
      { row: 7, title: 'Bad priority', message: expect.stringContaining('Unknown priority') },
      { row: 8, title: 'Bad date', message: expect.stringContaining('YYYY-MM-DD') },
      { row: 9, title: 'Bad link', message: expect.stringContaining('http or https') },
    ]);
    expect(summary.skipped).toEqual([
      { row: 6, title: 'Child of bad', message: expect.stringContaining('(row 5)') },
    ]);
    // the blank row 3 is no row at all, and a title of spaces is none
    expect(allTasks(tasks).map(({ title, status }) => [title, status])).toEqual([
      ['Good', TaskStatus.IN_PROGRESS],
      ['Done', TaskStatus.COMPLETED],
    ]);
    expect(allTasks(tasks)[1].completedAt).not.toBeNull();
  });

  it('matches projects by title, ignoring case, and warns when none or several match', () => {
    const site = projects.createProject({ title: 'Website', dueDate: day(12, 1) });
    projects.createProject({ title: 'Twice', dueDate: day(12, 1) });
    projects.createProject({ title: 'twice', dueDate: day(12, 1) });
    const json = JSON.stringify({
      tasks: [
        { title: 'In site', project: ' WEBSITE ', subtasks: [{ title: 'Sub', project: 'Other' }] },
        { title: 'Unknown', project: 'Nope' },
        { title: 'Ambiguous', project: 'Twice' },
      ],
    });
    const summary = transfer.importTasks(json, 'json');

    expect(summary.created).toBe(4);
    expect(summary.warnings).toEqual([
      {
        row: 3,
        title: 'Unknown',
        message: 'No project is named "Nope"; imported without a project',
      },
      {
        row: 4,
        title: 'Ambiguous',
        message: '2 projects are named "Twice"; imported without a project',
      },
    ]);
    const byTitle = new Map(allTasks(tasks).map((task) => [task.title, task]));
    expect(byTitle.get('In site')!.projectId).toBe(site.id);
    // a subtask takes its top-level task's project
    expect(byTitle.get('Sub')!.projectId).toBe(site.id);
    expect(byTitle.get('Unknown')!.projectId).toBeNull();
  });

  it('keeps JSON subtasks at any depth, and numbers rows in document order', () => {
    const json = JSON.stringify([
      { title: 'Root', subtasks: [{ title: 'A', subtasks: [{ title: 'A1' }] }, { title: 'B' }] },
      { title: 'Second', priority: 'HIGH' },
      'not a task',
      { title: { nested: true } },
      { title: 'Third', status: 42 },
    ]);
    const summary = transfer.importTasks(json, 'json');
    expect(summary.created).toBe(5);
    expect(summary.errors).toEqual([
      { row: 6, title: null, message: 'It is not an object' },
      { row: 7, title: null, message: '"title" must be text' },
      // a number where a status goes is read as text, and "42" is no status
      { row: 8, title: 'Third', message: expect.stringContaining('Unknown status "42"') },
    ]);
    const all = allTasks(tasks);
    const id = (title: string) => all.find((task) => task.title === title)!.id;
    expect(all.find((task) => task.title === 'A1')!.parentTaskId).toBe(id('A'));
    expect(all.find((task) => task.title === 'A')!.parentTaskId).toBe(id('Root'));
    expect(all.find((task) => task.title === 'Second')!.priority).toBe(TaskPriority.HIGH);
  });

  it('reports CSV parent_id problems on the rows concerned', () => {
    const csv = [
      'id,parent_id,title',
      'a,missing,Orphan',
      'b,c,Loop one',
      'c,b,Loop two',
      'a,,Duplicate id',
    ].join('\n');
    const summary = transfer.importTasks(csv, 'csv');
    expect(summary.warnings).toEqual([
      { row: 2, title: 'Orphan', message: expect.stringContaining('imported as a top-level task') },
    ]);
    expect(summary.errors).toEqual([
      { row: 3, title: 'Loop one', message: 'Its parent_id chain loops back on itself' },
      { row: 4, title: 'Loop two', message: 'Its parent_id chain loops back on itself' },
      { row: 5, title: 'Duplicate id', message: 'Its id a is also on row 2' },
    ]);
    expect(summary.created).toBe(1);
  });

  it('refuses subtasks nested deeper than the limit', () => {
    const rows = ['id,parent_id,title'];
    for (let i = 0; i <= MAX_TASK_DEPTH + 2; i++)
      rows.push(`t${i},${i ? `t${i - 1}` : ''},Level ${i}`);
    const summary = transfer.importTasks(rows.join('\n'), 'csv');
    expect(summary.created).toBe(MAX_TASK_DEPTH + 1);
    expect(summary.errors).toHaveLength(2);
    expect(summary.errors[0].message).toContain(`more than ${MAX_TASK_DEPTH} levels`);
  });

  it('creates every row in one transaction, sending created as its last step', () => {
    const seen: TaskChange[] = [];
    let rowsWhenSent = -1;
    tasks.onChange((change) => {
      seen.push(change);
      if (rowsWhenSent < 0) rowsWhenSent = db.select().from(tasksTable).all().length;
    });
    const rows = Array.from({ length: 2000 }, (_, i) => `Task ${i}`);
    const summary = transfer.importTasks(`title\n${rows.join('\n')}\n`, 'csv');
    expect(summary.created).toBe(2000);
    expect(seen).toHaveLength(2000);
    expect(seen.every((change) => change.type === 'created')).toBe(true);
    // every row was in when the first change went out
    expect(rowsWhenSent).toBe(2000);
  });

  it('createTaskTrees creates nothing when one tree is refused', () => {
    expect(() =>
      tasks.createTaskTrees([
        { title: 'Fine', dueDate: NOW, subtasks: [{ title: 'Fine too' }] },
        {
          title: 'Both links',
          dueDate: NOW,
          linkedEventId: 'evt_x' as never,
          linkedNoteId: 'nte_x' as never,
        },
      ]),
    ).toThrow(InvalidInputError);
    expect(allTasks(tasks)).toEqual([]);
  });
});

describe('import files', () => {
  it('are read by extension, and anything else is refused', async () => {
    const csv = path.join(dir, 'Tasks.CSV');
    await fs.writeFile(csv, 'title\nFrom a file\n');
    expect((await transfer.importTasksFromFile(csv)).created).toBe(1);
    const other = path.join(dir, 'tasks.xlsx');
    await fs.writeFile(other, 'title\n');
    await expect(transfer.importTasksFromFile(other)).rejects.toMatchObject({
      code: 'import_file',
      reason: 'unsupported_type',
    });
  });

  it('over the size limit are refused before any row is read', async () => {
    const big = path.join(dir, 'big.csv');
    await fs.writeFile(big, `title\n${'x'.repeat(MAX_TASK_FILE_BYTES)}\n`);
    const error = await transfer.importTasksFromFile(big).catch((e) => e);
    expect(error).toBeInstanceOf(ImportFileError);
    expect(error).toMatchObject({ reason: 'too_large', fileName: 'big.csv' });
    expect(allTasks(tasks)).toEqual([]);
  });

  it('that do not parse fail as a whole', () => {
    const reasonOf = (text: string, format: 'csv' | 'json') => {
      try {
        transfer.importTasks(text, format);
        return null;
      } catch (error) {
        return (error as ImportFileError).reason;
      }
    };
    expect(reasonOf('name,due\nx,y\n', 'csv')).toBe('malformed');
    expect(reasonOf('title\n"unclosed\n', 'csv')).toBe('malformed');
    expect(reasonOf('{not json', 'json')).toBe('malformed');
    expect(reasonOf('{"tasks": {}}', 'json')).toBe('malformed');
    expect(reasonOf('{"format": "other", "tasks": []}', 'json')).toBe('malformed');
    expect(reasonOf('{"format": "devbrain.tasks", "version": 2, "tasks": []}', 'json')).toBe(
      'malformed',
    );
  });
});

let links = 0;
function linkToLinear(taskId: TaskId, key: string) {
  const integrationId = db
    .insert(integrations)
    .values({
      provider: Provider.LINEAR,
      authType: AuthType.API_KEY,
      accountId: `org:user-${links}`,
      accountLabel: 'Ada, Acme',
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  const sourceId = db
    .insert(externalSources)
    .values({ integrationId, sourceType: SourceType.TASKS })
    .returning()
    .get().id;
  links += 1;
  db.insert(externalLinks)
    .values({
      sourceId,
      provider: Provider.LINEAR,
      externalId: `item-${links}`,
      externalKey: key,
      externalUrl: `https://linear.app/acme/issue/${key}`,
      externalUpdatedAt: NOW,
      lastSyncedAt: NOW,
      taskId,
    })
    .run();
}
