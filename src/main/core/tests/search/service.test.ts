import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSQLiteDatabase } from '@main/db/node-sqlite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SearchService } from '../../search/service';
import { NoteService } from '../../notes/service';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { createDb } from '../utils';

const TOMORROW = new Date(Date.now() + 86_400_000);

let db: NodeSQLiteDatabase;
let workspacePath: string;
let searchService: SearchService;
let noteService: NoteService;
let taskService: TaskService;
let projectService: ProjectService;
let eventService: EventService;

beforeEach(async () => {
  db = await createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-search-service-'));
  searchService = new SearchService(db, workspacePath);
  noteService = new NoteService(db, workspacePath);
  taskService = new TaskService(db);
  projectService = new ProjectService(db);
  eventService = new EventService(db);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SearchService — indexTask', () => {
  it('indexes a task so it is findable by title', async () => {
    const task = await taskService.createTask({
      title: 'Refactor payment pipeline',
      dueDate: TOMORROW,
    });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'pipeline', entityType: [] });
    expect(results).toHaveLength(1);
    // the matched term is highlighted in place, so the title comes back
    // wrapped rather than as the raw stored string
    expect(results[0]).toMatchObject({
      title: 'Refactor payment <b>pipeline</b>',
      entityId: task.id,
      entityType: 'task',
    });
  });

  it('indexes a task so it is findable by description', async () => {
    const task = await taskService.createTask({
      title: 'Ship release',
      description: 'Coordinate with the infrastructure team on rollout',
      dueDate: TOMORROW,
    });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'infrastructure', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe(task.id);
  });

  it('indexes with an empty body when description is null', async () => {
    const task = await taskService.createTask({ title: 'Untitled work item', dueDate: TOMORROW });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'Untitled', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toBe('');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const task = await taskService.createTask({ title: 'Original title', dueDate: TOMORROW });
    await searchService.indexTask(task);
    await searchService.indexTask({ ...task, title: 'Updated title' });

    expect(await searchService.search({ query: 'Original', entityType: [] })).toHaveLength(0);

    const updated = await searchService.search({ query: 'Updated', entityType: [] });
    expect(updated).toHaveLength(1);
    expect(updated[0].entityId).toBe(task.id);
  });
});

describe('SearchService — indexProject', () => {
  it('indexes a project so it is findable by title and description', async () => {
    const project = await projectService.createProject({
      title: 'Q3 Roadmap',
      description: 'Plan the migration to the new billing provider',
      dueDate: TOMORROW,
    });
    await searchService.indexProject(project);

    expect(await searchService.search({ query: 'Roadmap', entityType: [] })).toHaveLength(1);
    const byDescription = await searchService.search({ query: 'billing', entityType: [] });
    expect(byDescription).toHaveLength(1);
    expect(byDescription[0].entityType).toBe('project');
  });

  it('indexes with an empty body when description is null', async () => {
    const project = await projectService.createProject({
      title: 'Untitled project',
      dueDate: TOMORROW,
    });
    await searchService.indexProject(project);

    const results = await searchService.search({ query: 'Untitled', entityType: [] });
    expect(results[0].body).toBe('');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const project = await projectService.createProject({ title: 'Alpha', dueDate: TOMORROW });
    await searchService.indexProject(project);
    await searchService.indexProject({ ...project, title: 'Beta' });

    expect(await searchService.search({ query: 'Alpha', entityType: [] })).toHaveLength(0);
    expect(await searchService.search({ query: 'Beta', entityType: [] })).toHaveLength(1);
  });
});

describe('SearchService — indexEvent', () => {
  it('indexes an event so it is findable by title and description', async () => {
    const event = await eventService.createEvent({
      title: 'Design review',
      description: 'Walk through the new onboarding flow mockups',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    await searchService.indexEvent(event);

    expect(await searchService.search({ query: 'review', entityType: [] })).toHaveLength(1);
    const byDescription = await searchService.search({ query: 'onboarding', entityType: [] });
    expect(byDescription).toHaveLength(1);
    expect(byDescription[0].entityType).toBe('event');
  });

  it('indexes with an empty body when description is null', async () => {
    const event = await eventService.createEvent({
      title: 'Quick sync',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    await searchService.indexEvent(event);

    const results = await searchService.search({ query: 'sync', entityType: [] });
    expect(results[0].body).toBe('');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const event = await eventService.createEvent({
      title: 'Old title',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    await searchService.indexEvent(event);
    await searchService.indexEvent({ ...event, title: 'New title' });

    expect(await searchService.search({ query: 'Old', entityType: [] })).toHaveLength(0);
    expect(await searchService.search({ query: 'New', entityType: [] })).toHaveLength(1);
  });
});

describe('SearchService — indexNote', () => {
  it('indexes the note title even when the file body is empty', async () => {
    const note = await noteService.createNote({ title: 'Untitled Note Alpha' });
    await searchService.indexNote(note);

    const results = await searchService.search({ query: 'Alpha', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ entityId: note.id, entityType: 'note', body: '' });
  });

  it('reads the backing file and strips markdown formatting from the body', async () => {
    const note = await noteService.createNote({ title: 'Recipe' });
    const updated = await noteService.updateNoteContent(
      note.id,
      '# Heading\n\nSome **bold** casserole instructions.',
    );

    await searchService.indexNote(updated);

    const results = await searchService.search({ query: 'casserole', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe(note.id);
    expect(results[0].body).not.toContain('**');
    expect(results[0].body).not.toContain('#');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const note = await noteService.createNote({ title: 'Draft' });
    await searchService.indexNote(note);
    await noteService.updateNoteContent(note.id, 'finalized content');
    const updated = await noteService.getById(note.id);
    await searchService.indexNote(updated);

    const results = await searchService.search({ query: 'Draft', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('finalized content');
  });
});

describe('SearchService — search', () => {
  beforeEach(async () => {
    const task = await taskService.createTask({
      title: 'Widget sprint planning',
      dueDate: TOMORROW,
    });
    await searchService.indexTask(task);

    const project = await projectService.createProject({
      title: 'Widget launch',
      dueDate: TOMORROW,
    });
    await searchService.indexProject(project);

    const event = await eventService.createEvent({
      title: 'Widget kickoff meeting',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    await searchService.indexEvent(event);
  });

  it('returns matches across all entity types when no filter is given', async () => {
    const results = await searchService.search({ query: 'Widget', entityType: [] });
    expect(results).toHaveLength(3);
  });

  it('filters results down to the requested entity types', async () => {
    const results = await searchService.search({ query: 'Widget', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].entityType).toBe('task');
  });

  it('respects the limit option', async () => {
    const results = await searchService.search({ query: 'Widget', entityType: [], limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('returns an empty array for a blank query', async () => {
    expect(await searchService.search({ query: '   ', entityType: [] })).toEqual([]);
  });

  it('returns an empty array when nothing matches', async () => {
    expect(await searchService.search({ query: 'nonexistentterm', entityType: [] })).toEqual([]);
  });

  it('matches on a prefix of an indexed term', async () => {
    const results = await searchService.search({ query: 'Widg', entityType: [] });
    expect(results).toHaveLength(3);
  });

  it('returns an empty body snippet when there is no content', async () => {
    // the 'Widget sprint planning' task from the outer beforeEach has no description
    const results = await searchService.search({ query: 'Widget', entityType: ['task'] });
    expect(results[0].body).toBe('');
  });
});

describe('SearchService — search highlighting', () => {
  it('highlights the matched term found in the body', async () => {
    const task = await taskService.createTask({
      title: 'Task with a description',
      description: 'This paragraph mentions gadget somewhere in the middle of it.',
      dueDate: TOMORROW,
    });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'gadget', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>gadget</b>');
  });

  it('highlights the matched term found in the title', async () => {
    const task = await taskService.createTask({
      title: 'Investigate the gadget recall',
      dueDate: TOMORROW,
    });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'gadget', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Investigate the <b>gadget</b> recall');
  });

  it('highlights every occurrence of the matched term in the title', async () => {
    const project = await projectService.createProject({
      title: 'Widget planning for the widget launch',
      dueDate: TOMORROW,
    });
    await searchService.indexProject(project);

    const results = await searchService.search({ query: 'widget', entityType: ['project'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>Widget</b> planning for the <b>widget</b> launch');
  });

  it('highlights the full matched word in the title for a prefix query', async () => {
    const event = await eventService.createEvent({
      title: 'Widget kickoff meeting',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    await searchService.indexEvent(event);

    // 'Widg' is short enough to be treated as a prefix query (see toFtsQuery)
    const results = await searchService.search({ query: 'Widg', entityType: ['event'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>Widget</b> kickoff meeting');
  });

  it('highlights the matched term in the title for a note', async () => {
    const note = await noteService.createNote({ title: 'Casserole recipe notes' });
    await searchService.indexNote(note);

    const results = await searchService.search({ query: 'casserole', entityType: ['note'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>Casserole</b> recipe notes');
  });

  it('truncates a long body into a snippet with an ellipsis around the match', async () => {
    const words = Array.from({ length: 40 }, (_, i) => `filler${i}`);
    words.splice(20, 0, 'gizmo');
    const description = words.join(' ');

    const project = await projectService.createProject({
      title: 'Long body project',
      description,
      dueDate: TOMORROW,
    });
    await searchService.indexProject(project);

    const results = await searchService.search({ query: 'gizmo', entityType: ['project'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>gizmo</b>');
    expect(results[0].body).toContain('…');
    expect(results[0].body.length).toBeLessThan(description.length);
  });

  it('highlights the matched term for a note indexed from its file content', async () => {
    const note = await noteService.createNote({ title: 'Recipe' });
    const updated = await noteService.updateNoteContent(
      note.id,
      '# Heading\n\nSome **bold** casserole instructions.',
    );
    await searchService.indexNote(updated);

    const results = await searchService.search({ query: 'casserole', entityType: ['note'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>casserole</b>');
  });
});

describe('SearchService — special characters', () => {
  it('finds and highlights a title containing "++" (e.g. C++)', async () => {
    const task = await taskService.createTask({ title: 'Learn C++ properly', dueDate: TOMORROW });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'C++', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Learn <b>C++</b> properly');
  });

  it('finds and highlights a title containing "#" (e.g. C#)', async () => {
    const project = await projectService.createProject({
      title: 'C# style guide',
      dueDate: TOMORROW,
    });
    await searchService.indexProject(project);

    const results = await searchService.search({ query: 'C#', entityType: ['project'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>C#</b> style guide');
  });

  it('finds and highlights a body containing an underscored identifier', async () => {
    const task = await taskService.createTask({
      title: 'Rename a variable',
      description: 'Rename snake_case to camelCase throughout the module.',
      dueDate: TOMORROW,
    });
    await searchService.indexTask(task);

    const results = await searchService.search({ query: 'snake_case', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>snake_case</b>');
  });

  it('does not conflate two different symbol-suffixed terms (C++ vs C#)', async () => {
    const cpp = await taskService.createTask({ title: 'Learn C++', dueDate: TOMORROW });
    const csharp = await taskService.createTask({ title: 'Learn C#', dueDate: TOMORROW });
    await searchService.indexTasks([cpp, csharp]);

    const results = await searchService.search({ query: 'C++', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe(cpp.id);
  });
});
