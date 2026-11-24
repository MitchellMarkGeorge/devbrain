import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { NoteId, WorkspaceId } from '@common/ids';
import { TaskStatus, type NoteListItem } from '@common/types';
import { queryClient } from '@renderer/ipc';
import { noteContentQuery } from '@renderer/features/notes/api/queries';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, menuItem, rightClick, startApp, stopApps } from './harness';

// The note page (/app/$workspaceId/notes/$noteId) over a fake main's notes: the title, pills,
// the body saved as it's typed, its tasks, and the "…" menu.

const WORK = 'wsp_work' as WorkspaceId;
const NOTE = 'nte_adr' as NoteId;

afterEach(() => stopApps());

const PROJECT = fakeProject('prj_auth', 'Auth Overhaul');
const LINKED = fakeTask('tsk_pkce', 'Implement PKCE flow', {
  status: TaskStatus.IN_PROGRESS,
  linkedNoteId: NOTE,
});
const OTHER = fakeTask('tsk_audit', 'Audit token storage');

function notePage(
  content = 'The implicit flow leaks tokens.',
  id: string = NOTE,
  note: Partial<NoteListItem> = {},
  before: (main: FakeMain) => void = () => {},
) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  const store = new FakeTasks(
    [{ ...LINKED }, { ...OTHER }],
    [PROJECT],
    [
      fakeNote(NOTE, 'Architecture ADR #4', {
        projectId: PROJECT.id,
        project: { id: PROJECT.id, title: PROJECT.title, color: PROJECT.color },
        ...note,
      }),
    ],
  );
  store.contents.set(NOTE, content);
  main.taskStores.set(WORK, store);
  before(main);
  const app = startApp(main, { url: `/app/${WORK}/notes/${id}` });
  return { main, app, store };
}

// the markdown of each save, in order
const savedTexts = (main: FakeMain) =>
  main.callsTo('notes.updateContent').map((call) => (call.input as { content: string }).content);

const editorOf = (container: HTMLElement) =>
  (
    container.querySelector('[role="textbox"][aria-label="Note"]') as HTMLElement & {
      editor: Editor;
    }
  ).editor;

// whether `text` was on the page in the frame `testId` first appeared in
function firstFrameHas(container: HTMLElement, testId: string, text: string) {
  let seen: boolean | undefined;
  const observer = new MutationObserver(() => {
    const page = container.querySelector(`[data-testid="${testId}"]`);
    if (page && seen === undefined) seen = (page.textContent ?? '').includes(text);
  });
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    return seen;
  };
}

describe('the note page', () => {
  it('shows the note, its pills, its body and its tasks, and records the view', async () => {
    const { main, app } = notePage();
    await eventually(() => expect(app.text()).toContain('The implicit flow leaks tokens.'));
    const page = app.container.querySelector('[data-testid="note-page"]')!;
    expect(page.querySelector('[aria-label="Title"]')!.textContent).toBe('Architecture ADR #4');
    expect(page.textContent).toContain('Edited');
    await eventually(() => expect(page.textContent).toContain('1 task · 1 in progress'));
    expect(page.querySelector('[data-testid="note-tasks"]')!.textContent).toContain(
      'Implement PKCE flow',
    );
    expect(main.callsTo('recents.recordView').map((call) => call.input)).toEqual([{ id: NOTE }]);
    expect(main.callsTo('tasks.list').at(-1)!.input).toMatchObject({ filter: { noteId: NOTE } });
  });

  it("names the note's project from the note, though no picker lists it (completed)", async () => {
    const { app } = notePage(undefined, NOTE, {}, (main) =>
      // the pickers' list holds open projects only
      main.routes.set('projects.list', () => [{ items: [], nextCursor: null }, []]),
    );
    await eventually(() =>
      expect(app.container.querySelector('[data-testid="note-page"]')?.textContent).toContain(
        'Auth Overhaul',
      ),
    );
  });

  it('shows not-found for a note that doesn’t exist, or an id of no note', async () => {
    const missing = notePage(undefined, 'nte_gone');
    await eventually(() => expect(missing.app.text()).toContain('There’s nothing here'));
    stopApps();
    const wrong = notePage(undefined, 'tsk_pkce');
    await eventually(() => expect(wrong.app.text()).toContain('There’s nothing here'));
  });

  it('renames the note as its title is left', async () => {
    const { main, app } = notePage();
    await eventually(() =>
      expect(app.container.querySelector('[aria-label="Title"]')).not.toBeNull(),
    );
    const title = app.container.querySelector<HTMLElement>('[aria-label="Title"]')!;
    title.focus();
    title.textContent = 'ADR #4: PKCE';
    title.dispatchEvent(new FocusEvent('blur'));
    title.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await eventually(() =>
      expect(main.callsTo('notes.update').map((call) => call.input)).toEqual([
        { id: NOTE, title: 'ADR #4: PKCE' },
      ]),
    );
  });

  it('saves the body as it is typed, without reading it back', async () => {
    const { main, app, store } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    const editor = editorOf(app.container);
    const reads = main.callsTo('notes.readContent').length;

    editor.chain().focus('end').insertContent(' one').run();
    await eventually(() => expect(savedTexts(main)).toEqual(['Draft one']));
    editor.chain().focus('end').insertContent(' two').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(savedTexts(main)).toEqual(['Draft one', 'Draft one two']));
    // each save reports the note, which refetches the note's rows, never its markdown: the save
    // wrote it to the cache
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(main.callsTo('notes.readContent')).toHaveLength(reads);
    expect(editor.getMarkdown()).toBe('Draft one two');
    expect(store.contents.get(NOTE)).toBe('Draft one two');
    expect(queryClient.getQueryData(noteContentQuery(NOTE).queryKey)).toBe('Draft one two');
  });

  it('keeps what was typed when a read of the file answers after a save', async () => {
    const { main, app, store } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    const editor = editorOf(app.container);
    const reads = main.callsTo('notes.readContent').length;

    // the markdown is read (nothing in the app reads it again today), and the answer held back
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    main.routes.set('notes.readContent', async () => {
      const read = store.contents.get(NOTE);
      await answered;
      return [read, []];
    });
    void queryClient.invalidateQueries();
    await eventually(() => expect(main.callsTo('notes.readContent')).toHaveLength(reads + 1));

    editor.chain().focus('end').insertContent(' one').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(savedTexts(main)).toEqual(['Draft one']));
    // the read answers "Draft", older than the save: the save cancelled it
    answer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Draft one');
  });

  it('shows the latest save when the note is opened again', async () => {
    const { main, app } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    const reads = main.callsTo('notes.readContent').length;
    // the save is still on its way when the note is opened again
    const release = main.hold('notes.updateContent');
    editorOf(app.container).chain().focus('end').insertContent(' one').run();

    // leaving saves what is pending
    await app.router.navigate({ to: '/app/$workspaceId/notes', params: { workspaceId: WORK } });
    await eventually(() => expect(main.callsTo('notes.updateContent')).toHaveLength(1));
    await app.router.navigate({
      to: '/app/$workspaceId/notes/$noteId',
      params: { workspaceId: WORK, noteId: NOTE },
    });
    await eventually(() => expect(editorOf(app.container).getMarkdown()).toBe('Draft one'));
    release();
    expect(main.callsTo('notes.readContent')).toHaveLength(reads);
  });

  it('takes a change made elsewhere (the file edited on disk)', async () => {
    const { app, store } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    store.contents.set(NOTE, 'Edited in another app');
    await queryClient.invalidateQueries();
    await eventually(() =>
      expect(editorOf(app.container).getMarkdown()).toBe('Edited in another app'),
    );
  });

  it('takes a change made elsewhere back to a text it saved earlier', async () => {
    const { main, app, store } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    const editor = editorOf(app.container);

    editor.chain().focus('end').insertContent(' one').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(savedTexts(main)).toEqual(['Draft one']));
    editor.chain().focus('end').insertContent(' two').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(savedTexts(main)).toEqual(['Draft one', 'Draft one two']));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // the file reverted on disk to the first save: a change from elsewhere, though the editor
    // saved that very text before
    store.contents.set(NOTE, 'Draft one');
    await queryClient.invalidateQueries();
    await eventually(() => expect(editor.getMarkdown()).toBe('Draft one'));
  });

  it('saves what is still pending when the window loses focus', async () => {
    const { main, app } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    editorOf(app.container).chain().focus('end').insertContent('!').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('notes.updateContent')).toHaveLength(1));
  });

  it('opens New task on "/task", connected to the note and its project', async () => {
    const { main, app } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    const editor = editorOf(app.container);
    editor.chain().focus('end').insertContent(' /task').run();
    await eventually(() => expect(byText(document.body, '[role="option"]', 'Task')).not.toBeNull());
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // the line's text is the title; the note keeps its text, less the "/task"
    const title = () => document.querySelector<HTMLInputElement>('input[aria-label="Title"]');
    await eventually(() => expect(title()?.value).toBe('Draft'));
    expect(editor.getMarkdown()).toBe('Draft');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(title()!, 'Write the docs');
    title()!.dispatchEvent(new Event('input', { bubbles: true }));
    click(byText(document.body, 'button', 'Create Task'));
    await eventually(() => expect(main.callsTo('tasks.create')).toHaveLength(1));
    expect(main.callsTo('tasks.create')[0].input).toMatchObject({
      title: 'Write the docs',
      projectId: PROJECT.id,
      linkedNoteId: NOTE,
    });
    // made, not linked in the text
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Draft');
  });

  it('shows the current title of a task its pills link to', async () => {
    const { app } = notePage(`See [Old title](devbrain://task/${OTHER.id})`);
    await eventually(() => expect(app.text()).toContain('Audit token storage'));
    expect(app.text()).not.toContain('Old title');
  });

  it('shows the note’s file in Finder from the menu', async () => {
    const { main, app } = notePage();
    await eventually(() => expect(app.text()).toContain('The implicit flow leaks tokens.'));
    click(document.querySelector('[aria-label="More actions"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Show in Finder')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Show in Finder'));
    await eventually(() =>
      expect(main.callsTo('notes.showInFolder').map((call) => call.input)).toEqual([{ id: NOTE }]),
    );
  });

  it('duplicates the note from the menu and opens the copy', async () => {
    const { main, app } = notePage();
    await eventually(() => expect(app.text()).toContain('The implicit flow leaks tokens.'));
    click(document.querySelector('[aria-label="More actions"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Duplicate')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Duplicate'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/nte_new2`));
    await eventually(() => expect(app.text()).toContain('Copy of Architecture ADR #4'));
    expect(main.callsTo('notes.duplicate').map((call) => call.input)).toEqual([{ id: NOTE }]);
  });

  it('copies the note as Markdown from the menu and says so', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { app } = notePage();
    await eventually(() => expect(app.text()).toContain('The implicit flow leaks tokens.'));
    click(document.querySelector('[aria-label="More actions"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Copy as Markdown')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Copy as Markdown'));
    await eventually(() =>
      expect(writeText).toHaveBeenCalledWith(
        '# Architecture ADR #4\n\nThe implicit flow leaks tokens.\n',
      ),
    );
    await eventually(() => expect(document.body.textContent).toContain('Copied'));
  });

  it('moves the note to the trash and goes back to the notes', async () => {
    const { main, app } = notePage();
    await eventually(() => expect(app.text()).toContain('The implicit flow leaks tokens.'));
    click(document.querySelector('[aria-label="More actions"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Move to trash')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Move to trash'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes`));
    expect(main.callsTo('archive.archiveNote').map((call) => call.input)).toEqual([{ id: NOTE }]);
  });

  it('links an existing task from Link Task', async () => {
    const { main, app } = notePage();
    await eventually(() => expect(byText(app.container, 'button', 'Link Task')).not.toBeNull());
    click(byText(app.container, 'button', 'Link Task'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Audit token storage')).not.toBeNull(),
    );
    // the task already made from the note isn't offered again
    expect(byText(document.body, '[role="menuitem"]', 'Implement PKCE flow')).toBeNull();
    click(byText(document.body, '[role="menuitem"]', 'Audit token storage'));
    await eventually(() =>
      expect(main.callsTo('tasks.updateLinks').map((call) => call.input)).toEqual([
        { id: OTHER.id, linkedNoteId: NOTE },
      ]),
    );
  });

  it('loads the task it links to before it draws, so its pill is there on the first frame', async () => {
    let release = () => {};
    const { main, app } = notePage(undefined, NOTE, { linkedTaskId: OTHER.id }, (fake) => {
      release = fake.hold('tasks.get');
    });
    await eventually(() => expect(main.callsTo('tasks.get').length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.container.querySelector('[data-testid="note-page"]')).toBeNull();
    const seen = firstFrameHas(app.container, 'note-page', 'Audit token storage');
    release();
    await eventually(() =>
      expect(app.container.querySelector('[data-testid="note-page"]')).not.toBeNull(),
    );
    expect(seen()).toBe(true);
  });

  it('loads the tasks made from it before it draws, so their pill and section are on the first frame', async () => {
    let release = () => {};
    const { main, app } = notePage(undefined, NOTE, {}, (fake) => {
      release = fake.hold('tasks.list');
    });
    await eventually(() => expect(main.callsTo('tasks.list').length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.container.querySelector('[data-testid="note-page"]')).toBeNull();
    const pill = firstFrameHas(app.container, 'note-page', '1 task · 1 in progress');
    const section = firstFrameHas(app.container, 'note-page', 'Implement PKCE flow');
    release();
    await eventually(() =>
      expect(app.container.querySelector('[data-testid="note-page"]')).not.toBeNull(),
    );
    expect(pill()).toBe(true);
    expect(section()).toBe(true);
  });

  it('opens a task’s menu on a right-click of its row, the list itself being the right-click area', async () => {
    const { main, app } = notePage();
    const selector = '[data-testid="note-tasks"] [data-task-id="tsk_pkce"]';
    await eventually(() => expect(app.container.querySelector(selector)).not.toBeNull());
    const row = app.container.querySelector(selector)!;
    rightClick(row);
    const favorite = await menuItem('Favorite');
    // the trigger is the list's key scope, not a wrapper of its own around it
    expect(document.querySelector('[data-popup-open]')).toBe(
      row.closest('[data-key-scope="list"]'),
    );
    click(favorite);
    await eventually(() =>
      expect(main.callsTo('tasks.setFavorite').map((call) => call.input)).toEqual([
        { id: 'tsk_pkce', favorite: true },
      ]),
    );
  });

  it('opens a task made from it in the sheet beside the page, and Back closes it', async () => {
    const { app } = notePage();
    await eventually(() =>
      expect(
        app.container.querySelector('[data-testid="note-tasks"] [data-task-id]'),
      ).not.toBeNull(),
    );
    click(app.container.querySelector('[data-testid="note-tasks"] [data-task-id="tsk_pkce"]'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/${NOTE}?open=tsk_pkce`));
    await eventually(() =>
      expect(
        document.querySelector<HTMLInputElement>(
          '[data-testid="task-sheet"] input[aria-label="Title"]',
        )?.value,
      ).toBe('Implement PKCE flow'),
    );
    // still on the note
    expect(app.container.querySelector('[data-testid="note-page"]')).not.toBeNull();
    app.router.history.back();
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes/${NOTE}`));
  });
});
