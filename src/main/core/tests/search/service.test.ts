import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SearchService } from '../../search/service';
import { NoteService } from '../../notes/service';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { EventService } from '../../events/service';
import { generateId } from '@common/ids';
import { AuthType, LinkState, Provider, SourceType, TaskStatus } from '@common/types';
import { eq, sql } from 'drizzle-orm';
import { tasks } from '@main/db/schema/tasks';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { createDb } from '../utils';

const TOMORROW = new Date(Date.now() + 86_400_000);

let db: BetterSQLite3Database;
let workspacePath: string;
let searchService: SearchService;
let noteService: NoteService;
let taskService: TaskService;
let projectService: ProjectService;
let eventService: EventService;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-search-service-'));
  searchService = new SearchService(db, workspacePath);
  noteService = new NoteService(db, workspacePath);
  taskService = new TaskService(db);
  projectService = new ProjectService(db, new TaskService(db));
  eventService = new EventService(db);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SearchService — untrusted text', () => {
  it('returns titles and bodies escaped, with only its own <b> tags', async () => {
    const task = taskService.createTask({
      title: '<img src=x onerror=alert(1)> widget & "co"',
      description: 'Body with <script>alert(1)</script> and a widget',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const [result] = searchService.search({ query: 'widget', entityType: [] });
    expect(result.title).toBe(
      '&lt;img src=x onerror=alert(1)&gt; <b>widget</b> &amp; &quot;co&quot;',
    );
    expect(result.body).toBe('Body with &lt;script&gt;alert(1)&lt;/script&gt; and a <b>widget</b>');
  });

  it('keeps text that holds the marker characters itself to escaped text and <b> tags', async () => {
    const task = taskService.createTask({
      title: '\u0002<i>odd</i>\u0003 widget',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const [result] = searchService.search({ query: 'widget', entityType: [] });
    expect(result.title).toBe('<b>&lt;i&gt;odd&lt;/i&gt;</b> <b>widget</b>');
  });
});

describe('SearchService — indexTask', () => {
  it('indexes a task so it is findable by title', async () => {
    const task = taskService.createTask({
      title: 'Refactor payment pipeline',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'pipeline', entityType: [] });
    expect(results).toHaveLength(1);
    // the matched term is highlighted in place, so the title comes back
    // wrapped rather than as the raw stored string
    expect(results[0]).toMatchObject({
      title: 'Refactor payment <b>pipeline</b>',
      entity: { id: task.id },
      entityType: 'task',
    });
  });

  it('indexes a task so it is findable by description', async () => {
    const task = taskService.createTask({
      title: 'Ship release',
      description: 'Coordinate with the infrastructure team on rollout',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'infrastructure', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].entity.id).toBe(task.id);
  });

  it('indexes with an empty body when description is null', async () => {
    const task = taskService.createTask({ title: 'Untitled work item', dueDate: TOMORROW });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'Untitled', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toBe('');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const task = taskService.createTask({ title: 'Original title', dueDate: TOMORROW });
    searchService.indexTask(task);
    searchService.indexTask({ ...task, title: 'Updated title' });

    expect(searchService.search({ query: 'Original', entityType: [] })).toHaveLength(0);

    const updated = searchService.search({ query: 'Updated', entityType: [] });
    expect(updated).toHaveLength(1);
    expect(updated[0].entity.id).toBe(task.id);
  });
});

describe('SearchService — indexProject', () => {
  it('indexes a project so it is findable by title and description', async () => {
    const project = projectService.createProject({
      title: 'Q3 Roadmap',
      description: 'Plan the migration to the new billing provider',
      dueDate: TOMORROW,
    });
    searchService.indexProject(project);

    expect(searchService.search({ query: 'Roadmap', entityType: [] })).toHaveLength(1);
    const byDescription = searchService.search({ query: 'billing', entityType: [] });
    expect(byDescription).toHaveLength(1);
    expect(byDescription[0].entityType).toBe('project');
  });

  it('indexes with an empty body when description is null', async () => {
    const project = projectService.createProject({
      title: 'Untitled project',
      dueDate: TOMORROW,
    });
    searchService.indexProject(project);

    const results = searchService.search({ query: 'Untitled', entityType: [] });
    expect(results[0].body).toBe('');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const project = projectService.createProject({ title: 'Alpha', dueDate: TOMORROW });
    searchService.indexProject(project);
    searchService.indexProject({ ...project, title: 'Beta' });

    expect(searchService.search({ query: 'Alpha', entityType: [] })).toHaveLength(0);
    expect(searchService.search({ query: 'Beta', entityType: [] })).toHaveLength(1);
  });
});

describe('SearchService — removeFromIndex', () => {
  it('removes only the given entities, across entity types', async () => {
    const kept = taskService.createTask({ title: 'Deploy kept', dueDate: TOMORROW });
    const task = taskService.createTask({ title: 'Deploy removed', dueDate: TOMORROW });
    const project = projectService.createProject({
      title: 'Deploy project',
      dueDate: TOMORROW,
    });
    searchService.indexTasks([kept, task]);
    searchService.indexProject(project);

    searchService.removeFromIndex([task.id, project.id]);

    const results = searchService.search({ query: 'Deploy', entityType: [] });
    expect(results.map((r) => r.entity.id)).toEqual([kept.id]);
  });

  it('ignores ids with no entry and an empty list', async () => {
    const task = taskService.createTask({ title: 'Still here', dueDate: TOMORROW });
    searchService.indexTask(task);

    searchService.removeFromIndex([]);
    searchService.removeFromIndex([generateId('task')]);

    expect(searchService.search({ query: 'Still', entityType: [] })).toHaveLength(1);
  });

  it('an entity removed and indexed again is findable again', async () => {
    const task = taskService.createTask({ title: 'Boomerang', dueDate: TOMORROW });
    searchService.indexTask(task);
    searchService.removeFromIndex([task.id]);
    expect(searchService.search({ query: 'Boomerang', entityType: [] })).toHaveLength(0);

    searchService.indexTask(task);

    expect(searchService.search({ query: 'Boomerang', entityType: [] })).toHaveLength(1);
  });
});

describe('SearchService — indexEvent', () => {
  it('indexes an event so it is findable by title and description', async () => {
    const event = eventService.createEvent({
      title: 'Design review',
      description: 'Walk through the new onboarding flow mockups',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    searchService.indexEvent(event);

    expect(searchService.search({ query: 'review', entityType: [] })).toHaveLength(1);
    const byDescription = searchService.search({ query: 'onboarding', entityType: [] });
    expect(byDescription).toHaveLength(1);
    expect(byDescription[0].entityType).toBe('event');
  });

  it('indexes with an empty body when description is null', async () => {
    const event = eventService.createEvent({
      title: 'Quick sync',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    searchService.indexEvent(event);

    const results = searchService.search({ query: 'sync', entityType: [] });
    expect(results[0].body).toBe('');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const event = eventService.createEvent({
      title: 'Old title',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    searchService.indexEvent(event);
    searchService.indexEvent({ ...event, title: 'New title' });

    expect(searchService.search({ query: 'Old', entityType: [] })).toHaveLength(0);
    expect(searchService.search({ query: 'New', entityType: [] })).toHaveLength(1);
  });
});

describe('SearchService — indexNote', () => {
  it('indexes the note title even when the file body is empty', async () => {
    const note = await noteService.createNote({ title: 'Untitled Note Alpha' });
    await searchService.indexNote(note);

    const results = searchService.search({ query: 'Alpha', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ entity: { id: note.id }, entityType: 'note', body: '' });
  });

  it('reads the backing file and strips markdown formatting from the body', async () => {
    const note = await noteService.createNote({ title: 'Recipe' });
    const updated = await noteService.updateNoteContent(
      note.id,
      '# Heading\n\nSome **bold** casserole instructions.',
    );

    await searchService.indexNote(updated);

    const results = searchService.search({ query: 'casserole', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].entity.id).toBe(note.id);
    expect(results[0].body).not.toContain('**');
    expect(results[0].body).not.toContain('#');
  });

  it('re-indexing replaces the previous entry instead of duplicating it', async () => {
    const note = await noteService.createNote({ title: 'Draft' });
    await searchService.indexNote(note);
    await noteService.updateNoteContent(note.id, 'finalized content');
    const updated = noteService.getById(note.id);
    await searchService.indexNote(updated);

    const results = searchService.search({ query: 'Draft', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('finalized content');
  });
});

describe('SearchService — indexNoteContent', () => {
  it('indexes the given markdown with its formatting stripped, without reading the file', async () => {
    const note = await noteService.createNote({ title: 'Recipe' });
    // the file is still empty: the body comes from the content passed in
    searchService.indexNoteContent(note, '# Heading\n\nSome **bold** casserole instructions.');

    const results = searchService.search({ query: 'casserole', entityType: ['note'] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      entity: { id: note.id },
      entityType: 'note',
      title: 'Recipe',
    });
    expect(results[0].body).not.toContain('**');
    expect(results[0].body).not.toContain('#');
  });

  it('replaces the previous entry instead of duplicating it', async () => {
    const note = await noteService.createNote({ title: 'Draft' });
    searchService.indexNoteContent(note, 'first');
    searchService.indexNoteContent(note, 'second');

    const results = searchService.search({ query: 'Draft', entityType: [] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toBe('second');
  });
});

describe('SearchService — indexCreatedTask and indexCreatedNote', () => {
  it('index a new row, and a later edit replaces that entry rather than adding one', async () => {
    const task = taskService.createTask({ title: 'Quarterly report', dueDate: new Date() });
    searchService.indexCreatedTask(task);
    searchService.indexTask({ ...task, description: 'revenue figures' });
    expect(searchService.search({ query: 'Quarterly', entityType: ['task'] })).toEqual([
      expect.objectContaining({
        entity: expect.objectContaining({ id: task.id }),
        body: 'revenue figures',
      }),
    ]);

    const note = await noteService.createNote({ title: 'Retro' });
    searchService.indexCreatedNote(note, '# What went **well**');
    expect(searchService.search({ query: 'well', entityType: ['note'] })).toEqual([
      expect.objectContaining({ entity: expect.objectContaining({ id: note.id }), title: 'Retro' }),
    ]);
    searchService.indexNoteContent(note, 'replaced');
    expect(searchService.search({ query: 'Retro', entityType: ['note'] })).toEqual([
      expect.objectContaining({ body: 'replaced' }),
    ]);
  });
});

describe('SearchService — updateIndexedTitle', () => {
  it('changes the title and keeps the body', async () => {
    const note = await noteService.createNote({ title: 'Old' });
    searchService.indexNoteContent(note, 'kept body');

    searchService.updateIndexedTitle(note.id, 'New');

    expect(searchService.search({ query: 'Old', entityType: [] })).toEqual([]);
    expect(searchService.search({ query: 'New', entityType: [] })).toMatchObject([
      { entity: { id: note.id }, body: 'kept body' },
    ]);
  });

  it('ignores an entity with no entry', () => {
    searchService.updateIndexedTitle(generateId('note'), 'Nothing');

    expect(searchService.search({ query: 'Nothing', entityType: [] })).toEqual([]);
  });
});

describe('SearchService — the index map (search_index_entries)', () => {
  const entries = () =>
    db.all<{ entity_id: string; row_id: number; fts_entity: string | null }>(
      sql`SELECT e.entity_id, e.row_id, s.entity_id AS fts_entity
          FROM search_index_entries e LEFT JOIN search_index s ON s.rowid = e.row_id
          ORDER BY e.entity_id`,
    );
  const ftsRows = () => db.all<{ n: number }>(sql`SELECT count(*) AS n FROM search_index`)[0].n;

  it('keeps one entry per entity, its FTS row under the rowid it records', () => {
    const a = taskService.createTask({ title: 'Alpha', dueDate: TOMORROW });
    const b = taskService.createTask({ title: 'Beta', dueDate: TOMORROW });
    searchService.indexTasks([a, b]);
    searchService.indexTask({ ...a, title: 'Alpha renamed' });
    searchService.updateIndexedTitle(b.id, 'Beta renamed');

    expect(entries().map(({ entity_id, fts_entity }) => [entity_id, fts_entity])).toEqual(
      [a.id, b.id].sort().map((id) => [id, id]),
    );
    expect(ftsRows()).toBe(2);
    expect(
      searchService
        .search({ query: 'renamed', entityType: [] })
        .map((r) => r.entity.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());

    searchService.removeFromIndex([a.id]);
    expect(entries().map(({ entity_id }) => entity_id)).toEqual([b.id]);
    expect(ftsRows()).toBe(1);
  });

  it('indexes and removes more entries at once than SQLite binds in one statement', () => {
    // 9,000 entries take 45,000 values to insert, past SQLite's 32,766
    const many = Array.from({ length: 9_000 }, (_, i) => ({
      id: generateId('task'),
      title: `Bulk ${i}`,
      description: null,
    })) as unknown as Parameters<SearchService['indexTasks']>[0];
    searchService.indexTasks(many);
    searchService.indexTasks(many);
    expect(ftsRows()).toBe(9_000);
    expect(entries()).toHaveLength(9_000);

    searchService.removeFromIndex(many.map((task) => task.id));
    expect(ftsRows()).toBe(0);
    expect(entries()).toHaveLength(0);
  });
});

describe('SearchService — search', () => {
  beforeEach(async () => {
    const task = taskService.createTask({
      title: 'Widget sprint planning',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const project = projectService.createProject({
      title: 'Widget launch',
      dueDate: TOMORROW,
    });
    searchService.indexProject(project);

    const event = eventService.createEvent({
      title: 'Widget kickoff meeting',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    searchService.indexEvent(event);
  });

  it('returns matches across all entity types when no filter is given', () => {
    const results = searchService.search({ query: 'Widget', entityType: [] });
    expect(results).toHaveLength(3);
  });

  it('filters results down to the requested entity types', () => {
    const results = searchService.search({ query: 'Widget', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].entityType).toBe('task');
  });

  it('respects the limit option', () => {
    const results = searchService.search({ query: 'Widget', entityType: [], limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('returns an empty array for a blank query', () => {
    expect(searchService.search({ query: '   ', entityType: [] })).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchService.search({ query: 'nonexistentterm', entityType: [] })).toEqual([]);
  });

  it('matches on a prefix of an indexed term', () => {
    const results = searchService.search({ query: 'Widg', entityType: [] });
    expect(results).toHaveLength(3);
  });

  it('returns an empty body snippet when there is no content', () => {
    // the 'Widget sprint planning' task from the outer beforeEach has no description
    const results = searchService.search({ query: 'Widget', entityType: ['task'] });
    expect(results[0].body).toBe('');
  });
});

describe('SearchService — the entities found', () => {
  it('gives a task as the task list returns it, as it is now', () => {
    const project = projectService.createProject({ title: 'Launch', dueDate: TOMORROW });
    // a subtask takes its parent's project
    const parent = taskService.createTask({
      title: 'Parent',
      dueDate: TOMORROW,
      projectId: project.id,
    });
    const task = taskService.createSubtask(parent.id, { title: 'Widget task' });
    searchService.indexTask(task);
    taskService.updateStatus(task.id, TaskStatus.IN_PROGRESS);

    expect(searchService.search({ query: 'widget', entityType: [] })).toMatchObject([
      {
        entityType: 'task',
        entity: {
          id: task.id,
          status: TaskStatus.IN_PROGRESS,
          parentTaskId: parent.id,
          parentTask: { id: parent.id, title: 'Parent' },
          project: { id: project.id, title: 'Launch' },
          external: null,
        },
      },
    ]);
  });

  it('gives a project with its colour and task counts, as the projects list does', () => {
    const coloured = projectService.createProject({
      title: 'Widget red',
      dueDate: TOMORROW,
      color: '#ff0000',
    });
    taskService.createTask({ title: 'Its task', dueDate: TOMORROW, projectId: coloured.id });
    searchService.indexProjects([coloured]);

    expect(searchService.search({ query: 'widget', entityType: ['project'] })).toMatchObject([
      {
        entityType: 'project',
        entity: { id: coloured.id, color: '#ff0000', stats: { totalTasks: 1 } },
      },
    ]);
  });

  it('gives a note and an event as their lists do', async () => {
    const note = await noteService.createNote({ title: 'Widget note' });
    searchService.indexNoteContent(note, '');
    const event = eventService.createEvent({
      title: 'Widget review',
      startAt: TOMORROW,
      endAt: TOMORROW,
      color: '#0000ff',
    });
    searchService.indexEvent(event);

    const results = searchService.search({ query: 'widget', entityType: [] });
    expect(results.find(({ entityType }) => entityType === 'note')).toMatchObject({
      entity: { id: note.id, title: 'Widget note', project: null, link: null },
    });
    expect(results.find(({ entityType }) => entityType === 'event')).toMatchObject({
      entity: { id: event.id, startAt: TOMORROW, color: '#0000ff', exdates: [] },
    });
  });

  it('leaves out an entry whose row is gone or archived', () => {
    // deleted without its entry: this service alone doesn't hear of the delete
    const gone = taskService.createTask({ title: 'Widget gone', dueDate: TOMORROW });
    const archived = taskService.createTask({ title: 'Widget archived', dueDate: TOMORROW });
    const kept = taskService.createTask({ title: 'Widget kept', dueDate: TOMORROW });
    searchService.indexTasks([gone, archived, kept]);
    db.delete(tasks).where(eq(tasks.id, gone.id)).run();
    db.update(tasks).set({ archivedAt: new Date() }).where(eq(tasks.id, archived.id)).run();

    expect(
      searchService.search({ query: 'widget', entityType: [] }).map(({ entity }) => entity.id),
    ).toEqual([kept.id]);
  });

  it("gives a synced task's provider link, and null for a local one", () => {
    const synced = taskService.createTask({ title: 'Widget synced', dueDate: TOMORROW });
    const local = taskService.createTask({ title: 'Widget local', dueDate: TOMORROW });
    searchService.indexTasks([synced, local]);
    const integrationId = db
      .insert(integrations)
      .values({
        provider: Provider.LINEAR,
        authType: AuthType.API_KEY,
        accountId: 'org:user',
        accountLabel: 'Ada',
        credentials: Buffer.from('ciphertext'),
      })
      .returning()
      .get().id;
    const sourceId = db
      .insert(externalSources)
      .values({ integrationId, sourceType: SourceType.TASKS })
      .returning()
      .get().id;
    db.insert(externalLinks)
      .values({
        sourceId,
        provider: Provider.LINEAR,
        externalId: 'issue-1',
        externalKey: 'ENG-124',
        externalUrl: 'https://linear.app/acme/issue/ENG-124',
        externalUpdatedAt: TOMORROW,
        lastSyncedAt: TOMORROW,
        taskId: synced.id,
      })
      .run();

    const results = searchService.search({ query: 'widget', entityType: ['task'] });
    expect(results.find(({ entity }) => entity.id === synced.id)).toMatchObject({
      entity: { external: { provider: Provider.LINEAR, state: LinkState.SYNCED, key: 'ENG-124' } },
    });
    expect(results.find(({ entity }) => entity.id === local.id)).toMatchObject({
      entity: { external: null },
    });
  });

  it('keeps the best-first order across types, and the limit', () => {
    const inBody = taskService.createTask({
      title: 'Body match',
      description: 'about the widget',
      dueDate: TOMORROW,
    });
    const inTitle = projectService.createProject({ title: 'Widget', dueDate: TOMORROW });
    searchService.indexTask(inBody);
    searchService.indexProject(inTitle);

    // the title weighs ten times the body (bm25 in search)
    expect(
      searchService.search({ query: 'widget', entityType: [] }).map(({ entity }) => entity.id),
    ).toEqual([inTitle.id, inBody.id]);
    expect(searchService.search({ query: 'widget', entityType: [], limit: 1 })).toMatchObject([
      { entityType: 'project', entity: { id: inTitle.id } },
    ]);
  });

  it('reads many matches of a type at once', () => {
    const created = Array.from({ length: 600 }, (_, i) =>
      taskService.createTask({ title: `Widget ${i}`, dueDate: TOMORROW }),
    );
    searchService.indexTasks(created);
    taskService.updateStatus(created[599].id, TaskStatus.COMPLETED);

    const results = searchService.search({ query: 'widget', entityType: ['task'] });
    expect(results).toHaveLength(600);
    expect(results.find(({ entity }) => entity.id === created[599].id)).toMatchObject({
      entity: { status: TaskStatus.COMPLETED },
    });
  });
});

describe('SearchService — counts', () => {
  it('counts every match of each type, past any limit search would apply', async () => {
    const created = Array.from({ length: 250 }, (_, i) =>
      taskService.createTask({ title: `Widget ${i}`, dueDate: TOMORROW }),
    );
    searchService.indexTasks(created);
    searchService.indexProject(
      projectService.createProject({ title: 'Widget', dueDate: TOMORROW }),
    );
    const note = await noteService.createNote({ title: 'Widget notes' });
    searchService.indexNoteContent(note, 'about the widget');
    searchService.indexTask(taskService.createTask({ title: 'Other', dueDate: TOMORROW }));

    expect(searchService.counts('widget')).toEqual({ task: 250, note: 1, project: 1, event: 0 });
  });

  it('agrees with what search returns with no limit', () => {
    searchService.indexTask(taskService.createTask({ title: 'Widget a', dueDate: TOMORROW }));
    searchService.indexEvent(
      eventService.createEvent({ title: 'Widget b', startAt: TOMORROW, endAt: TOMORROW }),
    );
    const results = searchService.search({ query: 'wid', entityType: [] });
    const counts = searchService.counts('wid');
    expect(counts.task + counts.event).toBe(results.length);
    expect(counts).toMatchObject({ task: 1, event: 1 });
  });

  it('counts nothing for a blank query or one with no matches', () => {
    searchService.indexTask(taskService.createTask({ title: 'Widget', dueDate: TOMORROW }));
    const none = { task: 0, note: 0, project: 0, event: 0 };
    expect(searchService.counts('   ')).toEqual(none);
    expect(searchService.counts('nonexistentterm')).toEqual(none);
  });
});

describe('SearchService — search highlighting', () => {
  it('highlights the matched term found in the body', async () => {
    const task = taskService.createTask({
      title: 'Task with a description',
      description: 'This paragraph mentions gadget somewhere in the middle of it.',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'gadget', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>gadget</b>');
  });

  it('highlights the matched term found in the title', async () => {
    const task = taskService.createTask({
      title: 'Investigate the gadget recall',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'gadget', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Investigate the <b>gadget</b> recall');
  });

  it('highlights every occurrence of the matched term in the title', async () => {
    const project = projectService.createProject({
      title: 'Widget planning for the widget launch',
      dueDate: TOMORROW,
    });
    searchService.indexProject(project);

    const results = searchService.search({ query: 'widget', entityType: ['project'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>Widget</b> planning for the <b>widget</b> launch');
  });

  it('highlights the full matched word in the title for a prefix query', async () => {
    const event = eventService.createEvent({
      title: 'Widget kickoff meeting',
      startAt: TOMORROW,
      endAt: TOMORROW,
    });
    searchService.indexEvent(event);

    // 'Widg' is short enough to be treated as a prefix query (see toFtsQuery)
    const results = searchService.search({ query: 'Widg', entityType: ['event'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>Widget</b> kickoff meeting');
  });

  it('highlights the matched term in the title for a note', async () => {
    const note = await noteService.createNote({ title: 'Casserole recipe notes' });
    await searchService.indexNote(note);

    const results = searchService.search({ query: 'casserole', entityType: ['note'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>Casserole</b> recipe notes');
  });

  it('truncates a long body into a snippet with an ellipsis around the match', async () => {
    const words = Array.from({ length: 40 }, (_, i) => `filler${i}`);
    words.splice(20, 0, 'gizmo');
    const description = words.join(' ');

    const project = projectService.createProject({
      title: 'Long body project',
      description,
      dueDate: TOMORROW,
    });
    searchService.indexProject(project);

    const results = searchService.search({ query: 'gizmo', entityType: ['project'] });
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

    const results = searchService.search({ query: 'casserole', entityType: ['note'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>casserole</b>');
  });
});

describe('SearchService — special characters', () => {
  it('finds and highlights a title containing "++" (e.g. C++)', async () => {
    const task = taskService.createTask({ title: 'Learn C++ properly', dueDate: TOMORROW });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'C++', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Learn <b>C++</b> properly');
  });

  it('finds and highlights a title containing "#" (e.g. C#)', async () => {
    const project = projectService.createProject({
      title: 'C# style guide',
      dueDate: TOMORROW,
    });
    searchService.indexProject(project);

    const results = searchService.search({ query: 'C#', entityType: ['project'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('<b>C#</b> style guide');
  });

  it('finds and highlights a body containing an underscored identifier', async () => {
    const task = taskService.createTask({
      title: 'Rename a variable',
      description: 'Rename snake_case to camelCase throughout the module.',
      dueDate: TOMORROW,
    });
    searchService.indexTask(task);

    const results = searchService.search({ query: 'snake_case', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].body).toContain('<b>snake_case</b>');
  });

  it('does not conflate two different symbol-suffixed terms (C++ vs C#)', async () => {
    const cpp = taskService.createTask({ title: 'Learn C++', dueDate: TOMORROW });
    const csharp = taskService.createTask({ title: 'Learn C#', dueDate: TOMORROW });
    searchService.indexTasks([cpp, csharp]);

    const results = searchService.search({ query: 'C++', entityType: ['task'] });
    expect(results).toHaveLength(1);
    expect(results[0].entity.id).toBe(cpp.id);
  });
});
