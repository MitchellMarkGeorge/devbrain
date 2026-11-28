import { afterEach, describe, expect, it } from 'vitest';
import type { EventId, NoteId, ProjectId, TaskId, WorkspaceId } from '@common/ids';
import { TaskStatus, type Mention } from '@common/types';
import { FakeMain, workspace } from '../../routing/fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from '../../routing/fake-tasks';
import { byText, click, eventually, startApp, stopApps } from '../../routing/harness';

// What mentions a task, note or project, on its page ("n mentions", opening a popover) and in its
// sheet ("Mentioned in", folded), over a fake main's mentions.list.

const WORK = 'wsp_work' as WorkspaceId;
const TASK = 'tsk_pkce' as TaskId;
const NOTE = 'nte_adr' as NoteId;
const PROJECT = 'prj_auth' as ProjectId;

afterEach(() => stopApps());

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

const BY_NOTE: Mention = {
  source: { type: 'note', id: NOTE, title: 'Architecture ADR #4', linkedEventId: null },
  updatedAt: hoursAgo(2.5),
};
const BY_TASK: Mention = {
  source: {
    type: 'task',
    id: 'tsk_guide' as TaskId,
    title: 'Write the migration guide',
    status: TaskStatus.NOT_STARTED,
  },
  updatedAt: hoursAgo(30),
};
const BY_EVENT: Mention = {
  source: {
    type: 'event',
    id: 'evt_review' as EventId,
    title: 'Security review',
    startAt: new Date(2026, 5, 24, 10),
    color: null,
  },
  updatedAt: hoursAgo(50),
};

function app(url: string, mentions: Record<string, Mention[]> = {}) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(
    WORK,
    new FakeTasks(
      [
        fakeTask(TASK, 'Implement PKCE flow', {
          status: TaskStatus.IN_PROGRESS,
          linkedNoteId: NOTE,
        }),
        fakeTask('tsk_guide', 'Write the migration guide'),
      ],
      [fakeProject(PROJECT, 'Auth Overhaul')],
      [fakeNote(NOTE, 'Architecture ADR #4')],
    ),
  );
  for (const [id, list] of Object.entries(mentions)) main.mentions.set(id, list);
  return { main, app: startApp(main, { url }) };
}

const pill = () => document.querySelector<HTMLElement>('[data-testid="mentions-pill"]');
// the open popover (the sidebar's drawer is a dialog too, closed)
const popup = () => document.querySelector<HTMLElement>('[role="dialog"][data-side]');
const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-source-id="${id}"]`);

describe('a task page', () => {
  it('shows what mentions it as a pill on its links line, there on the first frame', async () => {
    const { main } = app(`/app/${WORK}/tasks/${TASK}`, { [TASK]: [BY_NOTE, BY_TASK] });
    await eventually(() =>
      expect(document.querySelector('[data-testid="task-page"]')).not.toBeNull(),
    );
    // the loader read it with the task
    expect(pill()?.textContent).toBe('2 mentions');
    expect(pill()!.closest('[aria-label="Links"]')).not.toBeNull();
    expect(main.callsTo('mentions.list').map((call) => call.input)).toContainEqual({
      targetId: TASK,
    });
  });

  it('opens the list in a popover, each row its source’s title and when it changed', async () => {
    app(`/app/${WORK}/tasks/${TASK}`, { [TASK]: [BY_NOTE, BY_TASK] });
    await eventually(() => expect(pill()).not.toBeNull());
    click(pill());
    await eventually(() => expect(popup()?.textContent).toContain('Mentioned in'));
    expect(rowOf(NOTE)?.textContent).toBe('Architecture ADR #4' + '2h ago');
    expect(rowOf('tsk_guide')?.textContent).toContain('Write the migration guide');
    expect(rowOf('tsk_guide')?.textContent).toContain('Yesterday');
  });

  it('opens a row’s source where it lives, closing the popover', async () => {
    const { app: running } = app(`/app/${WORK}/tasks/${TASK}`, { [TASK]: [BY_NOTE] });
    await eventually(() => expect(pill()).not.toBeNull());
    click(pill());
    await eventually(() => expect(rowOf(NOTE)).not.toBeNull());
    click(rowOf(NOTE));
    await eventually(() => expect(running.path()).toBe(`/app/${WORK}/notes/${NOTE}`));
  });

  it('has no pill while nothing mentions it, and gains one when a save adds a mention', async () => {
    const { main } = app(`/app/${WORK}/tasks/${TASK}`);
    await eventually(() =>
      expect(document.querySelector('[data-testid="task-page"]')).not.toBeNull(),
    );
    expect(pill()).toBeNull();

    main.mentions.set(TASK, [BY_NOTE]);
    main.push('db.changes', { entities: ['mention'] });
    await eventually(() => expect(pill()?.textContent).toBe('1 mention'));
  });
});

describe('a note page', () => {
  it('shows what mentions it in its header, an event opening on its day in the calendar', async () => {
    const { app: running } = app(`/app/${WORK}/notes/${NOTE}`, { [NOTE]: [BY_EVENT] });
    await eventually(() => expect(pill()?.textContent).toBe('1 mention'));
    click(pill());
    await eventually(() => expect(rowOf('evt_review')).not.toBeNull());
    click(rowOf('evt_review'));
    await eventually(() =>
      expect(running.path()).toBe(`/app/${WORK}/calendar?date=2026-06-24&sheet=evt_review`),
    );
  });

  it('opens its tasks in a popover from their pill, with Link and New', async () => {
    app(`/app/${WORK}/notes/${NOTE}`);
    const tasks = () => document.querySelector<HTMLElement>('[data-testid="note-tasks-pill"]');
    await eventually(() => expect(tasks()?.textContent).toBe('1 task · 1 in progress'));
    // nothing under the editor
    expect(document.querySelector('[data-testid="note-tasks"]')).toBeNull();
    click(tasks());
    await eventually(() =>
      expect(document.querySelector('[data-testid="note-tasks"]')?.textContent).toContain(
        'Implement PKCE flow',
      ),
    );
    expect(byText(popup()!, 'button', 'Link')).not.toBeNull();
    expect(byText(popup()!, 'button', 'New')).not.toBeNull();
  });
});

describe('a project page', () => {
  it('shows what mentions it after its dates', async () => {
    app(`/app/${WORK}/projects/${PROJECT}`, { [PROJECT]: [BY_NOTE, BY_TASK, BY_EVENT] });
    await eventually(() => expect(pill()?.textContent).toBe('3 mentions'));
  });
});

describe('a task sheet', () => {
  const section = () => document.querySelector<HTMLElement>('[data-testid="mentions-section"]');

  it('shows "Mentioned in" folded to its heading and count, opening to the rows', async () => {
    app(`/app/${WORK}/notes/${NOTE}?sheet=${TASK}`, { [TASK]: [BY_NOTE, BY_TASK] });
    await eventually(() => expect(section()).not.toBeNull());
    expect(section()!.closest('[data-testid="task-sheet"]')).not.toBeNull();
    expect(section()!.textContent).toContain('Mentioned in');
    expect(section()!.textContent).toContain('2');
    expect(rowOf('tsk_guide')).toBeNull();

    click(byText(section()!, 'button', 'Mentioned in'));
    await eventually(() => expect(rowOf('tsk_guide')).not.toBeNull());
  });

  it('leaves it out while nothing mentions the task', async () => {
    app(`/app/${WORK}/notes/${NOTE}?sheet=${TASK}`);
    await eventually(() =>
      expect(
        document.querySelector('[data-testid="task-sheet"] input[aria-label="Title"]'),
      ).not.toBeNull(),
    );
    expect(section()).toBeNull();
  });
});
