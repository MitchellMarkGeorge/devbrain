// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { NoteId, WorkspaceId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { queryClient } from '../../ipc';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

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

function notePage(content = 'The implicit flow leaks tokens.', id: string = NOTE) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  const store = new FakeTasks(
    [{ ...LINKED }, { ...OTHER }],
    [PROJECT],
    [
      fakeNote(NOTE, 'Architecture ADR #4', {
        projectId: PROJECT.id,
        project: { id: PROJECT.id, title: PROJECT.title, color: PROJECT.color },
      }),
    ],
  );
  store.contents.set(NOTE, content);
  main.taskStores.set(WORK, store);
  const app = startApp(main, { url: `/app/${WORK}/notes/${id}` });
  return { main, app, store };
}

const editorOf = (container: HTMLElement) =>
  (
    container.querySelector('[role="textbox"][aria-label="Note"]') as HTMLElement & {
      editor: Editor;
    }
  ).editor;

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

  it('saves the body as it is typed, and never puts back older text from its own save', async () => {
    const { main, app, store } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    const editor = editorOf(app.container);

    // the save's refetch is held until more has been typed
    const release = main.hold('notes.readContent');
    editor.chain().focus('end').insertContent(' one').run();
    await eventually(() =>
      expect(main.callsTo('notes.updateContent').map((call) => call.input)).toEqual([
        { id: NOTE, content: 'Draft one' },
      ]),
    );
    await eventually(() => expect(main.callsTo('notes.readContent').length).toBeGreaterThan(1));
    editor.chain().focus('end').insertContent(' two').run();
    release();
    // the refetch answers "Draft one"; the editor keeps what was typed after it
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(editor.getMarkdown()).toBe('Draft one two');
    await eventually(() => expect(store.contents.get(NOTE)).toBe('Draft one two'));
    expect(editor.getMarkdown()).toBe('Draft one two');
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

  it('saves what is still pending when the window loses focus', async () => {
    const { main, app } = notePage('Draft');
    await eventually(() => expect(app.text()).toContain('Draft'));
    editorOf(app.container).chain().focus('end').insertContent('!').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('notes.updateContent')).toHaveLength(1));
  });

  it('shows the current title of a task its pills link to', async () => {
    const { app } = notePage(`See [Old title](devbrain://task/${OTHER.id})`);
    await eventually(() => expect(app.text()).toContain('Audit token storage'));
    expect(app.text()).not.toContain('Old title');
  });

  it('offers the menu’s actions, with Duplicate and Copy as Markdown not built yet', async () => {
    const { main, app } = notePage();
    await eventually(() => expect(app.text()).toContain('The implicit flow leaks tokens.'));
    click(document.querySelector('[aria-label="More actions"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Show in Finder')).not.toBeNull(),
    );
    for (const label of ['Duplicate', 'Copy as Markdown']) {
      expect(byText(document.body, '[role="menuitem"]', label)!.hasAttribute('data-disabled')).toBe(
        true,
      );
    }
    click(byText(document.body, '[role="menuitem"]', 'Show in Finder'));
    await eventually(() =>
      expect(main.callsTo('notes.showInFolder').map((call) => call.input)).toEqual([{ id: NOTE }]),
    );
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
});
