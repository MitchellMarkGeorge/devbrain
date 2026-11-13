// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteId, ProjectId, TaskId, WorkspaceId } from '@common/ids';
import {
  LinkState,
  Provider,
  ProjectStatus,
  TaskStatus,
  type ArchivedEntity,
  type EmptyTrashResult,
} from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The trash page: its rows by tab (in the URL), Restore with its Open toast, Delete asking first
// when the setting says so, Empty Trash with its result, and the empty state.

const WORK = 'wsp_work' as WorkspaceId;
const TRASHED = new Date(2026, 10, 9, 9);

afterEach(() => stopApps());

// a row as archive.listArchived returns it, of the kind its id names
function archived(id: string, title: string, extra: Partial<ArchivedEntity> = {}): ArchivedEntity {
  const base = { title, archivedAt: TRASHED };
  const row: ArchivedEntity = id.startsWith('tsk')
    ? {
        ...base,
        id: id as TaskId,
        entityType: 'tasks',
        status: TaskStatus.NOT_STARTED,
        project: null,
        external: null,
      }
    : id.startsWith('prj')
      ? {
          ...base,
          id: id as ProjectId,
          entityType: 'projects',
          status: ProjectStatus.ACTIVE,
          color: null,
          external: null,
        }
      : { ...base, id: id as NoteId, entityType: 'notes', preview: null, project: null };
  return { ...row, ...extra } as ArchivedEntity;
}

function trashPage(search = '', items = SAMPLE, confirm = true) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.settings.confirmBeforeDeleting = confirm;
  const trash = items.map((item) => ({ ...item }));
  const drop = (id: unknown) =>
    trash.splice(
      trash.findIndex((item) => item.id === id),
      1,
    );
  main.routes.set('archive.listArchived', (args) => [
    {
      items: trash.filter(
        (item) =>
          !args.entityType || args.entityType === 'all' || item.entityType === args.entityType,
      ),
      nextCursor: null,
    },
    [],
  ]);
  for (const kind of ['Task', 'Project', 'Note']) {
    main.routes.set(`archive.restore${kind}`, (args) => {
      drop(args.id);
      return [undefined, [kind.toLowerCase() as 'task']];
    });
  }
  for (const kind of ['tasks', 'projects', 'notes']) {
    main.routes.set(`${kind}.delete`, (args) => {
      drop(args.id);
      return [{}, [kind.slice(0, -1) as 'task']];
    });
  }
  main.routes.set('archive.emptyTrash', () => {
    const result: EmptyTrashResult = {
      taskIds: trash
        .filter((i) => i.entityType === 'tasks' && i.id !== 'tsk_kept')
        .map((i) => i.id) as never,
      projectIds: trash.filter((i) => i.entityType === 'projects').map((i) => i.id) as never,
      noteIds: trash.filter((i) => i.entityType === 'notes').map((i) => i.id) as never,
      keptTaskIds: trash.filter((i) => i.id === 'tsk_kept').map((i) => i.id) as never,
      filesNotRemoved: [],
    };
    trash.splice(0, trash.length, ...trash.filter((i) => i.id === 'tsk_kept'));
    return [result, ['task', 'project', 'note']];
  });
  const app = startApp(main, { url: `/app/${WORK}/trash${search}` });
  return { main, app };
}

const SAMPLE = [
  archived('prj_ai', 'AI Action Items'),
  archived('tsk_summary', 'Summarise sprint feedback'),
  archived('nte_retro', 'Sprint 14 retro'),
];

const row = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-trash-id]')].find((el) =>
    el.textContent?.includes(title),
  );

describe('the trash page', () => {
  it('lists every kind, and one kind in ?tab', async () => {
    const { app, main } = trashPage();
    await eventually(() => expect(row('Sprint 14 retro')).toBeDefined());
    expect(app.text()).toContain('AI Action Items');
    expect(app.text()).toContain('Trashed');
    expect(app.text()).toContain('Items in the trash are kept until you delete them.');
    click(
      app.container.querySelector('[aria-label="Tasks"]') ??
        byText(app.container, 'button', 'Tasks'),
    );
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/trash?tab=tasks`));
    await eventually(() => expect(row('AI Action Items')).toBeUndefined());
    expect(row('Summarise sprint feedback')).toBeDefined();
    expect(main.callsTo('archive.listArchived').map((call) => call.input)).toContainEqual(
      expect.objectContaining({ entityType: 'tasks' }),
    );
  });

  it('falls back to every kind for a bad tab', async () => {
    const { app } = trashPage('?tab=everything');
    await eventually(() => expect(row('Sprint 14 retro')).toBeDefined());
    expect(app.text()).toContain('AI Action Items');
  });

  it('restores a row and offers to open it', async () => {
    const { app, main } = trashPage();
    await eventually(() => expect(row('Summarise sprint feedback')).toBeDefined());
    click(byText(row('Summarise sprint feedback')!, 'button', 'Restore'));
    await eventually(() => expect(main.callsTo('archive.restoreTask')).toHaveLength(1));
    await eventually(() =>
      expect(document.body.textContent).toContain('Restored “Summarise sprint feedback”'),
    );
    await eventually(() => expect(row('Summarise sprint feedback')).toBeUndefined());
    click(byText(document.body, 'button', 'Open'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/tsk_summary`));
  });

  it('asks before deleting for good, saying what happens to what links to it', async () => {
    const { main } = trashPage();
    await eventually(() => expect(row('AI Action Items')).toBeDefined());
    click(byText(row('AI Action Items')!, 'button', 'Delete'));
    await eventually(() =>
      expect(document.body.textContent).toContain('Delete project permanently?'),
    );
    expect(document.body.textContent).toContain('Its tasks and notes are kept');
    expect(main.callsTo('projects.delete')).toHaveLength(0);
    click(byText(document.body, 'button', 'Delete Project'));
    await eventually(() => expect(main.callsTo('projects.delete')).toHaveLength(1));
    expect(main.callsTo('projects.delete')[0].input).toEqual({ id: 'prj_ai' });
    await eventually(() => expect(row('AI Action Items')).toBeUndefined());
  });

  it('deletes at once when the setting says not to ask', async () => {
    const { main } = trashPage('', SAMPLE, false);
    await eventually(() => expect(row('Sprint 14 retro')).toBeDefined());
    click(byText(row('Sprint 14 retro')!, 'button', 'Delete'));
    await eventually(() => expect(main.callsTo('notes.delete')).toHaveLength(1));
  });

  it('empties the trash after asking, and says what stayed', async () => {
    const { app, main } = trashPage('', [
      ...SAMPLE,
      archived('tsk_kept', 'Parent with live subtasks'),
    ]);
    await eventually(() => expect(row('Sprint 14 retro')).toBeDefined());
    click(byText(app.container, 'button', 'Empty Trash'));
    await eventually(() => expect(document.body.textContent).toContain('Empty the trash?'));
    click(byText(document.querySelector('[role="alertdialog"]')!, 'button', 'Empty Trash'));
    await eventually(() => expect(main.callsTo('archive.emptyTrash')).toHaveLength(1));
    await eventually(() => expect(document.body.textContent).toContain('Deleted 3 items'));
    expect(document.body.textContent).toContain('1 task stayed');
    await eventually(() => expect(row('Sprint 14 retro')).toBeUndefined());
    expect(row('Parent with live subtasks')).toBeDefined();
  });

  it('opens a row’s item read-only, with Restore', async () => {
    const { app, main } = trashPage();
    main.taskStores.set(
      WORK,
      new FakeTasks([
        fakeTask('tsk_summary', 'Summarise sprint feedback', { archivedAt: TRASHED }),
      ]),
    );
    await eventually(() => expect(row('Summarise sprint feedback')).toBeDefined());
    click(row('Summarise sprint feedback')!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/tsk_summary`));
    await eventually(() => expect(app.text()).toContain('This task is in the trash'));
    expect(app.container.querySelector('[data-trashed]')?.hasAttribute('inert')).toBe(true);
    click(byText(app.container, 'button', 'Restore'));
    await eventually(() => expect(main.callsTo('archive.restoreTask')).toHaveLength(1));
  });

  it('draws each row’s own fields and pills from the list', async () => {
    const project = { id: 'prj_api' as ProjectId, title: 'API Gateway v2', color: '#f59e0b' };
    trashPage('', [
      archived('prj_ai', 'AI Action Items', { status: ProjectStatus.ON_HOLD, color: '#22c55e' }),
      archived('tsk_gateway', 'Set up API Gateway', {
        status: TaskStatus.COMPLETED,
        project,
        external: {
          provider: Provider.LINEAR,
          state: LinkState.DETACHED,
          key: 'ENG-102',
          url: 'https://linear.app/x/issue/ENG-102',
          statusLabel: null,
          priorityLabel: null,
          lastSyncedAt: TRASHED,
        },
      }),
      archived('nte_retro', 'Sprint 14 retro', {
        preview: 'What went well, and what to change.',
        project,
      }),
    ]);
    await eventually(() => expect(row('Sprint 14 retro')).toBeDefined());
    const task = row('Set up API Gateway')!;
    expect(task.textContent).toContain('ENG-102');
    expect(task.textContent).toContain('API Gateway v2');
    expect(task.querySelector('[aria-label="Completed"]')).not.toBeNull();
    const projectRow = row('AI Action Items')!;
    expect(projectRow.textContent).toContain('On hold');
    expect(projectRow.innerHTML).toContain('#22c55e');
    const note = row('Sprint 14 retro')!;
    expect(note.textContent).toContain('What went well, and what to change.');
    expect(note.textContent).toContain('API Gateway v2');
  });

  it('opens a trashed project read-only, with Restore', async () => {
    const { app, main } = trashPage();
    main.taskStores.set(
      WORK,
      new FakeTasks([], [fakeProject('prj_ai', 'AI Action Items', { archivedAt: TRASHED })]),
    );
    await eventually(() => expect(row('AI Action Items')).toBeDefined());
    click(row('AI Action Items')!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/projects/prj_ai`));
    await eventually(() => expect(app.text()).toContain('This project is in the trash'));
    expect(app.container.querySelector('[data-trashed]')?.hasAttribute('inert')).toBe(true);
    expect(app.text()).toContain('AI Action Items');
    click(byText(app.container, 'button', 'Restore'));
    await eventually(() => expect(main.callsTo('archive.restoreProject')).toHaveLength(1));
    expect(main.callsTo('archive.restoreProject')[0].input).toEqual({ id: 'prj_ai' });
  });

  it('opens a trashed note read-only, with its body and Restore', async () => {
    const { app, main } = trashPage();
    const store = new FakeTasks(
      [],
      [],
      [fakeNote('nte_retro', 'Sprint 14 retro', { archivedAt: TRASHED })],
    );
    store.contents.set('nte_retro' as NoteId, 'Ship smaller pull requests.');
    main.taskStores.set(WORK, store);
    await eventually(() => expect(row('Sprint 14 retro')).toBeDefined());
    click(row('Sprint 14 retro')!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/nte_retro`));
    await eventually(() => expect(app.text()).toContain('This note is in the trash'));
    await eventually(() => expect(app.text()).toContain('Ship smaller pull requests.'));
    expect(app.container.querySelector('[data-trashed]')?.hasAttribute('inert')).toBe(true);
    const editor = app.container.querySelector('[role="textbox"][aria-label="Note"]');
    expect(editor?.getAttribute('contenteditable')).toBe('false');
    click(byText(app.container, 'button', 'Restore'));
    await eventually(() => expect(main.callsTo('archive.restoreNote')).toHaveLength(1));
    expect(main.callsTo('notes.updateContent')).toHaveLength(0);
  });

  it('offers Empty Trash on a tab of one kind from the first frame it draws', async () => {
    const { app } = trashPage('?tab=tasks');
    // the loader has the whole trash too, so the button never draws off and then on
    await eventually(() => expect(row('Summarise sprint feedback')).toBeDefined());
    expect(byText(app.container, 'button', 'Empty Trash')).toHaveProperty('disabled', false);
  });

  it('says when the trash is empty, with Empty Trash off', async () => {
    const { app } = trashPage('', []);
    await eventually(() => expect(app.text()).toContain('Nothing in the trash'));
    expect(byText(app.container, 'button', 'Empty Trash')).toHaveProperty('disabled', true);
  });
});
