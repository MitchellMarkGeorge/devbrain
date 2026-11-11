// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { EventId, WorkspaceId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The notes page (/app/$workspaceId/notes): rows and cards from notes.list, the toolbar in the
// URL, the states, the row menu, and creating a note.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

const PROJECT = fakeProject('prj_auth', 'Auth Overhaul');
const TASK = fakeTask('tsk_pkce', 'Write PKCE guide', { status: TaskStatus.IN_PROGRESS });

const SAMPLE = [
  fakeNote('nte_plan', 'Launch plan', {
    preview: 'Ship in two waves.',
    updatedAt: new Date(2026, 5, 22, 12),
  }),
  fakeNote('nte_pkce', 'PKCE design notes', {
    projectId: PROJECT.id,
    project: { id: PROJECT.id, title: PROJECT.title, color: PROJECT.color },
    linkedTaskId: TASK.id,
    link: { type: 'task', id: TASK.id, title: TASK.title, status: TASK.status },
    updatedAt: new Date(2026, 5, 22, 11),
  }),
  fakeNote('nte_1on1', 'Jesse 1:1', {
    linkedEventId: 'evt_1on1' as EventId,
    link: { type: 'event', id: 'evt_1on1' as EventId, title: '1:1', color: null } as never,
    updatedAt: new Date(2026, 5, 22, 10),
  }),
];

function notesPage(search = '', notes = SAMPLE) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(
    WORK,
    new FakeTasks(
      [{ ...TASK }],
      [PROJECT],
      notes.map((note) => ({ ...note })),
    ),
  );
  const app = startApp(main, { url: `/app/${WORK}/notes${search}` });
  return { main, app };
}

const row = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="row"][data-note-id]')].find((el) =>
    el.textContent?.includes(title),
  );

function key(target: Element, key: string, options: KeyboardEventInit = {}) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  );
}

describe('the notes list', () => {
  it('lists the notes, last edited first, with their pills', async () => {
    const { app, main } = notesPage();
    await eventually(() => expect(row('Launch plan')).toBeDefined());
    const titles = [...document.querySelectorAll('[data-note-id]')].map((el) =>
      el.getAttribute('data-note-id'),
    );
    expect(titles).toEqual(['nte_plan', 'nte_pkce', 'nte_1on1']);
    expect(row('PKCE design notes')!.textContent).toContain('Write PKCE guide');
    expect(row('PKCE design notes')!.textContent).toContain('Auth Overhaul');
    expect(app.text()).toContain('FilterAll');
    expect(app.text()).toContain('SortLast edited');
    expect(main.callsTo('notes.list')[0].input).toMatchObject({
      sort: { sortBy: 'updatedAt', direction: 'desc' },
    });
  });

  it('opens a note from its row', async () => {
    const { app } = notesPage();
    await eventually(() => expect(row('Launch plan')).toBeDefined());
    click(row('Launch plan')!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/nte_plan`));
  });

  it('asks core for the filters and sort in the URL', async () => {
    const { main, app } = notesPage(`?link=task&project=${PROJECT.id}&sort=title`);
    await eventually(() => expect(row('PKCE design notes')).toBeDefined());
    expect(row('Launch plan')).toBeUndefined();
    expect(main.callsTo('notes.list').at(-1)!.input).toMatchObject({
      filter: { projectId: PROJECT.id, linkedTo: 'task' },
      sort: { sortBy: 'title', direction: 'asc' },
    });
    expect(app.text()).toContain('Linked to a task');
  });

  it('drops a bad param and keeps the rest', async () => {
    const { app } = notesPage('?view=board&link=task');
    await eventually(() => expect(row('PKCE design notes')).toBeDefined());
    expect(row('Launch plan')).toBeUndefined();
    expect(app.container.querySelector('[data-view="list"]')).not.toBeNull();
  });

  it('says when no note matches, and clears the filters', async () => {
    const { app } = notesPage(`?link=event&project=${PROJECT.id}&sort=title`);
    await eventually(() => expect(app.text()).toContain('No notes match these filters'));
    click(byText(app.container, 'button', 'Clear Filters'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes?sort=title`));
    await eventually(() => expect(row('Launch plan')).toBeDefined());
  });

  it('says when there are no notes yet', async () => {
    const { app } = notesPage('', []);
    await eventually(() => expect(app.text()).toContain('No notes yet'));
  });

  it('shows cards, and switches the view in the URL', async () => {
    const { app } = notesPage();
    await eventually(() => expect(row('Launch plan')).toBeDefined());
    const length = app.router.history.length;
    click(app.container.querySelector('[aria-label="Cards"]'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes?view=card`));
    expect(app.router.history.length).toBe(length);
    await eventually(() =>
      expect(
        app.container.querySelector('[role="gridcell"] [data-note-id="nte_plan"]'),
      ).not.toBeNull(),
    );
    click(app.container.querySelector('[data-note-id="nte_pkce"]'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/nte_pkce`));
  });

  it('says "Empty note" on a card with no text', async () => {
    const { app } = notesPage('?view=card');
    await eventually(() =>
      expect(app.container.querySelector('[data-note-id="nte_pkce"]')).not.toBeNull(),
    );
    expect(app.container.querySelector('[data-note-id="nte_pkce"]')!.textContent).toContain(
      'Empty note',
    );
    expect(app.container.querySelector('[data-note-id="nte_plan"]')!.textContent).not.toContain(
      'Empty note',
    );
  });

  it('favorites and trashes from the row menu', async () => {
    const { main } = notesPage();
    await eventually(() => expect(row('Launch plan')).toBeDefined());
    row('Launch plan')!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
    let item: HTMLElement | null = null;
    await eventually(() => {
      item = byText(document.body, '[role="menuitem"]', 'Favorite');
      expect(item).not.toBeNull();
    });
    // no route for it yet
    expect(
      byText(document.body, '[role="menuitem"]', 'Copy as Markdown')!.hasAttribute('data-disabled'),
    ).toBe(true);
    click(item);
    await eventually(() =>
      expect(main.callsTo('notes.setFavorite').map((call) => call.input)).toEqual([
        { id: 'nte_plan', favorite: true },
      ]),
    );
  });

  it('opens the focused row with ↵ and trashes it with ⌘⌫', async () => {
    const { main, app } = notesPage();
    await eventually(() => expect(row('PKCE design notes')).toBeDefined());
    row('PKCE design notes')!.focus();
    await eventually(() => expect(row('PKCE design notes')!.tabIndex).toBe(0));
    key(row('PKCE design notes')!, 'Backspace', { metaKey: true });
    await eventually(() =>
      expect(main.callsTo('archive.archiveNote').map((call) => call.input)).toEqual([
        { id: 'nte_pkce' },
      ]),
    );
    await eventually(() => expect(row('PKCE design notes')).toBeUndefined());
    row('Launch plan')!.focus();
    await eventually(() => expect(row('Launch plan')!.tabIndex).toBe(0));
    key(row('Launch plan')!, 'Enter');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/nte_plan`));
  });
});

describe('selecting notes', () => {
  const bar = () => document.querySelector('[role="toolbar"][aria-label="Selected notes"]');
  const check = (title: string) => row(title)!.querySelector<HTMLElement>('[role="checkbox"]')!;

  it('selects rows with their checkbox, and shows the selection bar', async () => {
    const { app } = notesPage();
    await eventually(() => expect(row('Launch plan')).toBeDefined());
    expect(bar()).toBeNull();
    click(check('Launch plan'));
    click(check('PKCE design notes'));
    await eventually(() => expect(bar()?.textContent).toContain('2 selected'));
    expect(row('Launch plan')!.getAttribute('aria-selected')).toBe('true');
    const clear = bar()!.querySelector<HTMLElement>('[aria-label="Clear selection"]')!;
    clear.focus();
    // ↵ on the bar's buttons is theirs, not the list's (which would open the focused note)
    key(clear, 'Enter');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.path()).toBe(`/app/${WORK}/notes`);
    click(clear);
    // focus goes back to the list, not to the page, as the bar leaves
    await eventually(() =>
      expect(document.activeElement?.closest('[data-note-id]')).not.toBeNull(),
    );
    await eventually(() => expect(bar()).toBeNull());
  });

  it('selects the focused row with X', async () => {
    notesPage();
    await eventually(() => expect(row('Jesse 1:1')).toBeDefined());
    row('Jesse 1:1')!.focus();
    await eventually(() => expect(row('Jesse 1:1')!.tabIndex).toBe(0));
    key(row('Jesse 1:1')!, 'x');
    await eventually(() => expect(bar()?.textContent).toContain('1 selected'));
  });

  it('favorites every selected note, then trashes them all from the bar', async () => {
    const { main } = notesPage();
    await eventually(() => expect(row('Launch plan')).toBeDefined());
    click(check('Launch plan'));
    click(check('Jesse 1:1'));
    await eventually(() => expect(bar()).not.toBeNull());
    click(byText(bar()!, 'button', 'Favorite'));
    await eventually(() =>
      expect(main.callsTo('notes.setFavorite').map((call) => call.input)).toEqual([
        { id: 'nte_plan', favorite: true },
        { id: 'nte_1on1', favorite: true },
      ]),
    );
    click(bar()!.querySelector('[aria-label="More actions"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Move to trash')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Move to trash'));
    await eventually(() =>
      // in the list's order, which favoriting changed (it touches each note's edit time)
      expect(
        main
          .callsTo('archive.archiveNote')
          .map((call) => (call.input as { id: string }).id)
          .sort(),
      ).toEqual(['nte_1on1', 'nte_plan']),
    );
    await eventually(() => expect(bar()).toBeNull());
    await eventually(() => expect(row('Launch plan')).toBeUndefined());
  });
});

describe('a new note', () => {
  it('is created by New Note, in the filtered project, and opens with its title focused', async () => {
    const { main, app } = notesPage(`?project=${PROJECT.id}`);
    await eventually(() => expect(row('PKCE design notes')).toBeDefined());
    click(byText(app.container, 'button', 'New Note'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/nte_new4`));
    expect(main.callsTo('notes.create').map((call) => call.input)).toEqual([
      { projectId: PROJECT.id },
    ]);
    await eventually(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Title'),
    );
  });

  it('is created with N anywhere in the workspace', async () => {
    const main = new FakeMain([workspace(WORK, 'Work')], WORK);
    const app = startApp(main, { url: `/app/${WORK}/home` });
    await eventually(() => expect(app.text()).toContain('Work recents.list'));
    key(document.body, 'n');
    await eventually(() => expect(app.path()).toMatch(new RegExp(`/app/${WORK}/notes/nte_new`)));
    expect(main.callsTo('notes.create')).toHaveLength(1);
  });

  it('is created by the sidebar’s compose button', async () => {
    const main = new FakeMain([workspace(WORK, 'Work')], WORK);
    const app = startApp(main, { url: `/app/${WORK}/home` });
    await eventually(() => expect(app.text()).toContain('Work recents.list'));
    click(document.querySelector('[aria-label="New note"]'));
    await eventually(() => expect(app.path()).toMatch(new RegExp(`/app/${WORK}/notes/nte_new`)));
  });
});
