import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { WorkspaceId } from '@common/ids';
import { LinkState, Provider, TaskPriority, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, menuItem, rightClick, startApp, stopApps } from './harness';

// The task page (/app/$workspaceId/tasks/$taskId) over a fake main's tasks.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

function mainWith(store: FakeTasks) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(WORK, store);
  return main;
}

const parent = fakeTask('tsk_pkce', 'Implement OAuth2 PKCE flow', {
  status: TaskStatus.IN_PROGRESS,
  description: 'Replace the implicit flow.',
});
const subtask = fakeTask('tsk_mobile', 'Mobile fallback', { parentTaskId: parent.id });

function store() {
  return new FakeTasks(
    [{ ...parent }, { ...subtask }],
    [],
    [fakeNote('nte_pkce', 'PKCE design notes', { linkedTaskId: parent.id })],
  );
}

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

describe('the task page', () => {
  it('shows the task, its properties, its subtasks and its note, and records the view', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    await eventually(() => expect(app.text()).toContain('Mobile fallback'));
    const page = app.container.querySelector('[data-testid="task-page"]')!;
    expect(page.textContent).toContain('Implement OAuth2 PKCE flow');
    expect(page.textContent).toContain('In progress');
    expect(page.textContent).toContain('Subtasks');
    await eventually(() => expect(page.textContent).toContain('PKCE design notes'));
    expect(main.callsTo('recents.recordView').map((call) => call.input)).toEqual([
      { id: parent.id },
    ]);
  });

  it("names the task's project from the task, though no picker lists it (completed)", async () => {
    const task = fakeTask('tsk_shipped', 'Write the launch post', {
      projectId: 'prj_done' as never,
      project: { id: 'prj_done' as never, title: 'Shipped launch', color: '#123456' },
    });
    const main = mainWith(new FakeTasks([task]));
    // the pickers' list holds open projects only
    main.routes.set('projects.list', () => [{ items: [], nextCursor: null }, []]);
    const app = startApp(main, { url: `/app/${WORK}/tasks/${task.id}` });
    await eventually(() =>
      expect(app.container.querySelector('[aria-label="Properties"]')?.textContent).toContain(
        'Shipped launch',
      ),
    );
  });

  it('shows not-found for a task that doesn’t exist', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/tasks/tsk_gone` });
    await eventually(() => expect(app.text()).toContain('There’s nothing here'));
  });

  it('changes the status through its pill', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/tasks/${subtask.id}` });
    await eventually(() => expect(app.text()).toContain('Not started'));
    const pill = [...app.container.querySelectorAll('[aria-label="Properties"] button')].find(
      (button) => button.textContent === 'Not started',
    ) as HTMLElement;
    pill.click();
    await eventually(() => expect(document.body.textContent).toContain('Completed'));
    const item = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')].find(
      (element) => element.textContent?.includes('Completed'),
    ) as HTMLElement;
    item.click();
    await eventually(() =>
      expect(main.callsTo('tasks.updateStatus').map((call) => call.input)).toEqual([
        { id: subtask.id, status: TaskStatus.COMPLETED },
      ]),
    );
  });

  it('sets a subtask’s status from its row without opening the subtask', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    await eventually(() => expect(app.text()).toContain('Mobile fallback'));
    const row = [...app.container.querySelectorAll('[role="row"]')].find((element) =>
      element.textContent?.includes('Mobile fallback'),
    )!;
    (row.querySelector('[aria-label^="Status"]') as HTMLElement).click();
    let item: HTMLElement | undefined;
    await eventually(() => {
      item = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')].find(
        (element) => element.textContent?.includes('In progress'),
      ) as HTMLElement | undefined;
      expect(item).toBeDefined();
    });
    // the menu is portalled out of the row, but React bubbles its click up to the row
    item!.click();
    await eventually(() =>
      expect(main.callsTo('tasks.updateStatus').map((call) => call.input)).toEqual([
        { id: subtask.id, status: TaskStatus.IN_PROGRESS },
      ]),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.path()).toBe(`/app/${WORK}/tasks/${parent.id}`);
  });

  it('opens a subtask’s menu on a right-click of its row', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    const selector = `[data-key-scope="list"] [data-task-id="${subtask.id}"]`;
    await eventually(() => expect(app.container.querySelector(selector)).not.toBeNull());
    const row = app.container.querySelector(selector)!;
    rightClick(row);
    const favorite = await menuItem('Favorite');
    // the trigger is the list's key scope
    expect(document.querySelector('[data-popup-open]')).toBe(
      row.closest('[data-key-scope="list"]'),
    );
    click(favorite);
    await eventually(() =>
      expect(main.callsTo('tasks.setFavorite').map((call) => call.input)).toEqual([
        { id: subtask.id, favorite: true },
      ]),
    );
  });

  it('shows a synced task’s fields read-only, with its provider’s labels', async () => {
    const synced = fakeTask('tsk_eng124', 'Synced from Linear', {
      status: TaskStatus.IN_PROGRESS,
      external: {
        provider: Provider.LINEAR,
        state: LinkState.SYNCED,
        key: 'ENG-124',
        url: 'https://linear.app/x/issue/ENG-124',
        statusLabel: 'In Review',
        priorityLabel: 'Urgent',
        lastSyncedAt: new Date(),
      },
    });
    const app = startApp(mainWith(new FakeTasks([synced])), {
      url: `/app/${WORK}/tasks/${synced.id}`,
    });
    await eventually(() => expect(app.text()).toContain('In Review'));
    expect(app.text()).toContain('ENG-124');
    const properties = app.container.querySelector('[aria-label="Properties"]')!;
    // no buttons: the provider's values aren't pickers, and there's no "+ Add"
    expect(properties.querySelectorAll('button')).toHaveLength(0);
    const title = app.container.querySelector('[aria-label="Title"]')!;
    expect(title.getAttribute('contenteditable')).toBe('false');
  });

  it('shows a synced task with no priority as none, not as Low', async () => {
    const synced = fakeTask('tsk_mit69', 'Re-run codegen', {
      priority: TaskPriority.NONE,
      external: {
        provider: Provider.LINEAR,
        state: LinkState.SYNCED,
        key: 'MIT-69',
        url: 'https://linear.app/x/issue/MIT-69',
        statusLabel: 'Backlog',
        priorityLabel: 'No priority',
        lastSyncedAt: new Date(),
      },
    });
    const app = startApp(mainWith(new FakeTasks([synced])), {
      url: `/app/${WORK}/tasks/${synced.id}`,
    });
    await eventually(() => expect(app.text()).toContain('No priority'));
    const properties = app.container.querySelector('[aria-label="Properties"]')!;
    expect(properties.querySelector('[aria-label="No priority"]')).not.toBeNull();
    expect(properties.querySelector('[aria-label="Low priority"]')).toBeNull();
  });

  it('shows the provider’s description again at once when a task is reattached after an edit', async () => {
    const external = (state: LinkState) => ({
      provider: Provider.LINEAR,
      state,
      key: 'MIT-1',
      url: 'https://linear.app/x/issue/MIT-1',
      statusLabel: null,
      priorityLabel: null,
      lastSyncedAt: new Date(),
    });
    const detached = fakeTask('tsk_mine', 'Detached task', {
      description: 'From Linear',
      external: external(LinkState.DETACHED),
    });
    const tasks = new FakeTasks([detached]);
    const main = mainWith(tasks);
    // a copy each time, as IPC sends one: never the stored row, which the edits change in place
    main.routes.set('tasks.get', (args) => [
      structuredClone(tasks.tasks.find((t) => t.id === args.id)),
      [],
    ]);
    // reattaching puts Linear's description back: the very text the page opened with
    main.routes.set('tasks.reattach', () => [
      tasks.patch(detached.id, {
        description: 'From Linear',
        external: external(LinkState.SYNCED),
      }),
      ['task'],
    ]);
    const app = startApp(main, { url: `/app/${WORK}/tasks/${detached.id}` });
    const description = () =>
      app.container.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]');
    await eventually(() => expect(description()?.textContent).toBe('From Linear'));

    (description() as unknown as { editor: Editor }).editor
      .chain()
      .focus('end')
      .insertContent(' edited')
      .run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('tasks.update')).toHaveLength(1));

    click(document.querySelector('[aria-label="More actions"]'));
    click(await menuItem('Reattach to Linear'));
    await eventually(() => expect(main.callsTo('tasks.reattach')).toHaveLength(1));
    await eventually(() => expect(description()?.textContent).toBe('From Linear'));
  });

  it('shows a synced task’s description once a sync gives it one', async () => {
    const synced = fakeTask('tsk_synced', 'From Linear', {
      description: null,
      external: {
        provider: Provider.LINEAR,
        state: LinkState.SYNCED,
        key: 'MIT-2',
        url: 'https://linear.app/x/issue/MIT-2',
        statusLabel: null,
        priorityLabel: null,
        lastSyncedAt: new Date(),
      },
    });
    const tasks = new FakeTasks([synced]);
    const main = mainWith(tasks);
    main.routes.set('tasks.get', (args) => [
      structuredClone(tasks.tasks.find((t) => t.id === args.id)),
      [],
    ]);
    const app = startApp(main, { url: `/app/${WORK}/tasks/${synced.id}` });
    const description = () =>
      app.container.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]');
    await eventually(() => expect(app.text()).toContain('From Linear'));
    // none yet: left out
    expect(description()).toBeNull();

    tasks.patch(synced.id, { description: 'Written in Linear' });
    main.push('db.changes', { entities: ['task'] });
    await eventually(() => expect(description()?.textContent).toBe('Written in Linear'));
  });

  it('shows a description rewritten from outside while the page was closed', async () => {
    const tasks = store();
    const main = mainWith(tasks);
    // a copy each time, as IPC sends one: never the stored row, which the edits change in place
    main.routes.set('tasks.get', (args) => [
      structuredClone(tasks.tasks.find((t) => t.id === args.id)),
      [],
    ]);
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    const description = () =>
      app.container.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]');
    await eventually(() => expect(description()?.textContent).toBe('Replace the implicit flow.'));

    await app.router.navigate({ to: '/app/$workspaceId/tasks', params: { workspaceId: WORK } });
    await eventually(() => expect(description()).toBeNull());
    // a sync rewrites it meanwhile
    tasks.patch(parent.id, { description: 'Use PKCE everywhere.' });
    main.push('db.changes', { entities: ['task'] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await app.router.navigate({
      to: '/app/$workspaceId/tasks/$taskId',
      params: { workspaceId: WORK, taskId: parent.id },
    });
    await eventually(() => expect(description()?.textContent).toBe('Use PKCE everywhere.'));
  });

  it('keeps what was typed when a save’s refetch answers while a later save is on its way', async () => {
    const tasks = store();
    const main = mainWith(tasks);
    // a copy each time, as IPC sends one, of the task as it was when the read came in; held back
    // while `held` is set
    let held: Promise<void> | null = null;
    main.routes.set('tasks.get', async (args) => {
      const read = structuredClone(tasks.tasks.find((t) => t.id === args.id));
      if (held) await held;
      return [read, []];
    });
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    const description = () =>
      app.container.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]');
    await eventually(() => expect(description()?.textContent).toBe('Replace the implicit flow.'));
    const editor = (description() as unknown as { editor: Editor }).editor;

    // the first save's refetch reads "… one", and is held
    let answer!: () => void;
    held = new Promise<void>((resolve) => (answer = resolve));
    const reads = main.callsTo('tasks.get').length;
    editor.chain().focus('end').insertContent(' one').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('tasks.get').length).toBeGreaterThan(reads));

    // a second save is on its way when the first one's refetch answers
    const release = main.hold('tasks.update');
    editor.chain().focus('end').insertContent(' two').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('tasks.update')).toHaveLength(2));
    held = null;
    answer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one two');

    release();
    await eventually(() =>
      expect(tasks.tasks.find((t) => t.id === parent.id)?.description).toBe(
        'Replace the implicit flow. one two',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one two');
  });

  // the task page on `parent`, its reads answered with a copy, as IPC sends one
  async function descriptionPage() {
    const tasks = store();
    const main = mainWith(tasks);
    main.routes.set('tasks.get', (args) => [
      structuredClone(tasks.tasks.find((t) => t.id === args.id)),
      [],
    ]);
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    const description = () =>
      app.container.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]');
    await eventually(() => expect(description()?.textContent).toBe('Replace the implicit flow.'));
    const editor = (description() as unknown as { editor: Editor }).editor;
    const stored = () => tasks.tasks.find((t) => t.id === parent.id)?.description;
    return { tasks, main, app, editor, stored };
  }

  it('keeps the caret where it is when its own save comes back, and reads the task again', async () => {
    const { main, editor, stored } = await descriptionPage();
    const reads = main.callsTo('tasks.get').length;
    editor.chain().focus(8).insertContent('X').run();
    const caret = editor.state.selection.from;
    const document = editor.state.doc;
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(stored()).toBe('ReplaceX the implicit flow.'));
    // the save reports the task, which is read again for everything else it shows
    await eventually(() => expect(main.callsTo('tasks.get').length).toBeGreaterThan(reads));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // nothing was loaded into the editor: the same document, the caret where it was
    expect(editor.state.doc).toBe(document);
    expect(editor.state.selection.from).toBe(caret);
  });

  it('keeps what was typed when a read sent before a save answers after it', async () => {
    const { tasks, main, editor, stored } = await descriptionPage();
    // a change elsewhere has the task read again, and the answer is held back
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    let hold = true;
    main.routes.set('tasks.get', async (args) => {
      const read = structuredClone(tasks.tasks.find((t) => t.id === args.id));
      if (hold) await answered;
      return [read, []];
    });
    const reads = main.callsTo('tasks.get').length;
    main.push('db.changes', { entities: ['task'] });
    await eventually(() => expect(main.callsTo('tasks.get').length).toBeGreaterThan(reads));
    hold = false;

    // the save is still on its way when the read answers
    const release = main.hold('tasks.update');
    editor.chain().focus('end').insertContent(' one').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('tasks.update')).toHaveLength(1));
    // once the page has drawn the save's text, with the text from before it: the save cancelled it
    await new Promise((resolve) => setTimeout(resolve, 20));
    answer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one');
    release();
    await eventually(() => expect(stored()).toBe('Replace the implicit flow. one'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one');
  });

  it('takes a change from outside while the page is open', async () => {
    const { tasks, main, editor } = await descriptionPage();
    editor.chain().focus('end').insertContent(' one').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('tasks.update')).toHaveLength(1));

    tasks.patch(parent.id, { description: 'Rewritten elsewhere.' });
    main.push('db.changes', { entities: ['task'] });
    await eventually(() => expect(editor.getMarkdown()).toBe('Rewritten elsewhere.'));
    // and back to the very text the editor saved before
    tasks.patch(parent.id, { description: 'Replace the implicit flow. one' });
    main.push('db.changes', { entities: ['task'] });
    await eventually(() => expect(editor.getMarkdown()).toBe('Replace the implicit flow. one'));
    expect(main.callsTo('tasks.update')).toHaveLength(1);
  });

  it('writes a change still waiting for its save over one from outside', async () => {
    const { tasks, main, editor, stored } = await descriptionPage();
    editor.chain().focus('end').insertContent(' one').run();
    const reads = main.callsTo('tasks.get').length;
    tasks.patch(parent.id, { description: 'Rewritten elsewhere.' });
    main.push('db.changes', { entities: ['task'] });
    await eventually(() => expect(main.callsTo('tasks.get').length).toBeGreaterThan(reads));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one');
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(stored()).toBe('Replace the implicit flow. one'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one');
  });

  it('keeps what was typed when its save fails, and saves again on the next edit', async () => {
    const { tasks, main, editor, stored } = await descriptionPage();
    let fail = true;
    main.routes.set('tasks.update', (args) => {
      if (fail) throw FakeMain.error('internal', 'Something went wrong');
      const { id, ...fields } = args;
      return [tasks.patch(id, fields as never), ['task']];
    });
    editor.chain().focus('end').insertContent(' one').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() =>
      expect(document.body.textContent).toContain('Couldn’t save the description'),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.getMarkdown()).toBe('Replace the implicit flow. one');
    expect(stored()).toBe('Replace the implicit flow.');

    fail = false;
    editor.chain().focus('end').insertContent(' two').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(stored()).toBe('Replace the implicit flow. one two'));
  });

  it('saves nothing for a text typed and undone', async () => {
    const { main, editor } = await descriptionPage();
    editor.chain().focus('end').insertContent(' one').run();
    editor.commands.undo();
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(main.callsTo('tasks.update')).toHaveLength(0);
  });

  it('saves an emptied description as none, and leaves the editor alone', async () => {
    const { main, editor, stored } = await descriptionPage();
    editor.commands.clearContent(true);
    const document = editor.state.doc;
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(stored()).toBeNull());
    expect(main.callsTo('tasks.update')[0].input).toEqual({ id: parent.id, description: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.state.doc).toBe(document);
  });

  it('loads the note it links to before it draws, so its pill is there on the first frame', async () => {
    const linked = fakeTask('tsk_linked', 'Write the guide', {
      linkedNoteId: 'nte_guide' as never,
    });
    const main = mainWith(new FakeTasks([linked], [], [fakeNote('nte_guide', 'Guide outline')]));
    const release = main.hold('notes.get');
    const app = startApp(main, { url: `/app/${WORK}/tasks/${linked.id}` });
    await eventually(() => expect(main.callsTo('notes.get')).toHaveLength(1));
    // the loader waits for the note: the page isn't drawn without it
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.container.querySelector('[data-testid="task-page"]')).toBeNull();
    const seen = firstFrameHas(app.container, 'task-page', 'Guide outline');
    release();
    await eventually(() =>
      expect(app.container.querySelector('[data-testid="task-page"]')).not.toBeNull(),
    );
    expect(seen()).toBe(true);
  });

  it('still opens when the event it links to can’t be read', async () => {
    const linked = fakeTask('tsk_linked', 'Prepare the demo', {
      linkedEventId: 'evt_gone' as never,
    });
    const main = mainWith(new FakeTasks([linked]));
    const app = startApp(main, { url: `/app/${WORK}/tasks/${linked.id}` });
    await eventually(() => expect(app.text()).toContain('Prepare the demo'));
    expect(main.callsTo('events.get').length).toBeGreaterThan(0);
  });

  it('opens its task note in the sheet beside the page, editable there', async () => {
    const main = mainWith(store());
    main.tasksOf(WORK).contents.set('nte_pkce', 'Draft');
    const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
    await eventually(() =>
      expect(byText(app.container, 'button', 'PKCE design notes')).not.toBeNull(),
    );
    click(byText(app.container, 'button', 'PKCE design notes'));
    await eventually(() =>
      expect(app.path()).toBe(`/app/${WORK}/tasks/${parent.id}?sheet=nte_pkce`),
    );
    let editor: HTMLElement | null = null;
    await eventually(() => {
      editor = document.querySelector(
        '[data-testid="note-sheet"] [role="textbox"][aria-label="Note"]',
      );
      expect(editor?.textContent).toBe('Draft');
    });
    (editor as unknown as { editor: Editor }).editor.chain().focus('end').insertContent('!').run();
    window.dispatchEvent(new Event('blur'));
    await eventually(() =>
      expect(main.callsTo('notes.updateContent').map((call) => call.input)).toEqual([
        { id: 'nte_pkce', content: 'Draft!' },
      ]),
    );
    expect(app.container.querySelector('[data-testid="task-page"]')).not.toBeNull();
    // a task's note has no meeting over it, and no way back to an event
    const sheet = document.querySelector<HTMLElement>('[data-testid="note-sheet"]')!;
    expect(sheet.querySelector('[data-testid="event-strip"]')).toBeNull();
    expect(byText(sheet, 'button', 'Event')).toBeNull();
    expect(sheet.textContent).not.toContain('Notes save as you type');
    // × closes it with an entry of its own; Back shows the note again
    click(sheet.querySelector('button[aria-label="Close"]'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/${parent.id}`));
    app.router.history.back();
    await eventually(() =>
      expect(app.path()).toBe(`/app/${WORK}/tasks/${parent.id}?sheet=nte_pkce`),
    );
  });

  it('opens a new task note in the sheet', async () => {
    const lone = fakeTask('tsk_lone', 'Lone task');
    const main = mainWith(new FakeTasks([lone]));
    const app = startApp(main, { url: `/app/${WORK}/tasks/${lone.id}` });
    await eventually(() =>
      expect(byText(app.container, 'button', 'Add a task note')).not.toBeNull(),
    );
    click(byText(app.container, 'button', 'Add a task note'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/${lone.id}?sheet=nte_new1`));
    expect(main.callsTo('notes.create').map((call) => call.input)).toEqual([
      { title: 'Lone task', linkedTaskId: lone.id, projectId: null },
    ]);
    await eventually(() =>
      expect(document.querySelector('[data-testid="note-sheet"]')).not.toBeNull(),
    );
  });

  it("files a new task note under the task's project", async () => {
    const filed = fakeTask('tsk_filed', 'Filed task', {
      projectId: 'prj_filed' as never,
      project: { id: 'prj_filed' as never, title: 'Filed project', color: '#123456' },
    });
    const main = mainWith(new FakeTasks([filed]));
    const app = startApp(main, { url: `/app/${WORK}/tasks/${filed.id}` });
    await eventually(() =>
      expect(byText(app.container, 'button', 'Add a task note')).not.toBeNull(),
    );
    click(byText(app.container, 'button', 'Add a task note'));
    await eventually(() => expect(main.callsTo('notes.create')).toHaveLength(1));
    expect(main.callsTo('notes.create')[0].input).toEqual({
      title: 'Filed task',
      linkedTaskId: filed.id,
      projectId: 'prj_filed',
    });
  });

  describe('its "…" menu', () => {
    // opens the page's "…" menu and clicks the item whose text starts with `label`
    async function choose(app: ReturnType<typeof startApp>, label: string) {
      await eventually(() => expect(app.text()).toContain('Implement OAuth2 PKCE flow'));
      const more = document.querySelector('[aria-label="More actions"]') as HTMLElement;
      more.click();
      let item: HTMLElement | undefined;
      await eventually(() => {
        item = [...document.querySelectorAll('[role="menuitem"]')].find((element) =>
          element.textContent?.startsWith(label),
        ) as HTMLElement | undefined;
        expect(item).toBeDefined();
      });
      item!.click();
    }

    it('converts the task to a project after a confirmation, then opens the project', async () => {
      const main = mainWith(store());
      const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
      await choose(app, 'Convert to project');
      await eventually(() => expect(document.body.textContent).toContain('Convert to project?'));
      expect(main.callsTo('tasks.convertToProject')).toEqual([]);
      const confirm = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'Convert',
      )!;
      confirm.click();
      await eventually(() => expect(main.callsTo('tasks.convertToProject')).toHaveLength(1));
      await eventually(() => expect(app.path()).toBe(`/app/${WORK}/projects/prj_pkce`));
      expect(main.callsTo('tasks.convertToProject').map((call) => call.input)).toEqual([
        { id: parent.id },
      ]);
    });

    it('duplicates the task and opens the copy', async () => {
      const main = mainWith(store());
      const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
      await choose(app, 'Duplicate');
      await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/tsk_new3`));
      await eventually(() => expect(app.text()).toContain('Copy of Implement OAuth2 PKCE flow'));
      expect(main.callsTo('tasks.duplicate').map((call) => call.input)).toEqual([
        { id: parent.id },
      ]);
    });

    it('copies the task as Markdown and says so', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const main = mainWith(store());
      const app = startApp(main, { url: `/app/${WORK}/tasks/${parent.id}` });
      await choose(app, 'Copy as Markdown');
      await eventually(() =>
        expect(writeText).toHaveBeenCalledWith('# Implement OAuth2 PKCE flow\n'),
      );
      await eventually(() => expect(document.body.textContent).toContain('Copied'));
    });

    it('can’t link a local subtask, which takes its parent’s links', async () => {
      const app = startApp(mainWith(store()), { url: `/app/${WORK}/tasks/${subtask.id}` });
      await eventually(() => expect(app.text()).toContain('Mobile fallback'));
      // "+ Add" offers no event or note
      click(document.querySelector<HTMLElement>('[aria-label="Add property"]')!);
      await eventually(() =>
        expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0),
      );
      const added = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
      expect(added).toContain('Pull request');
      expect(added).not.toContain('Event or note');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      // nor does the "…" menu
      (document.querySelector('[aria-label="More actions"]') as HTMLElement).click();
      await eventually(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((element) =>
          element.textContent?.startsWith('Link to event or note'),
        );
        expect(item?.getAttribute('aria-disabled')).toBe('true');
      });
    });

    it('links a top-level task from its "…" menu', async () => {
      const app = startApp(mainWith(store()), { url: `/app/${WORK}/tasks/${parent.id}` });
      await choose(app, 'Link to event or note');
      await eventually(() =>
        expect(document.querySelector('[aria-label="Search events and notes"]')).not.toBeNull(),
      );
    });

    it('shows a synced task’s pull request read-only', async () => {
      const synced = fakeTask('tsk_pkce', 'Implement OAuth2 PKCE flow', {
        pullRequestUrl: 'https://github.com/acme/app/pull/42',
        external: {
          provider: Provider.LINEAR,
          state: LinkState.SYNCED,
          key: 'ENG-1',
          url: 'https://linear.app/x/issue/ENG-1',
          statusLabel: 'Todo',
          priorityLabel: 'Low',
          lastSyncedAt: new Date(),
        },
      });
      const app = startApp(mainWith(new FakeTasks([synced])), {
        url: `/app/${WORK}/tasks/${synced.id}`,
      });
      await eventually(() => expect(app.text()).toContain('#42'));
      click(byText(app.container, 'button', '#42')!);
      await eventually(() => expect(document.body.textContent).toContain('Open pull request'));
      expect(document.body.textContent).not.toContain('Edit link');
      expect(document.body.textContent).not.toContain('Remove pull request');
    });

    it('can’t convert a synced task', async () => {
      const synced = fakeTask('tsk_pkce', 'Implement OAuth2 PKCE flow', {
        external: {
          provider: Provider.LINEAR,
          state: LinkState.SYNCED,
          key: 'ENG-1',
          url: 'https://linear.app/x/issue/ENG-1',
          statusLabel: 'Todo',
          priorityLabel: 'Low',
          lastSyncedAt: new Date(),
        },
      });
      const app = startApp(mainWith(new FakeTasks([synced])), {
        url: `/app/${WORK}/tasks/${synced.id}`,
      });
      await eventually(() => expect(app.text()).toContain('Implement OAuth2 PKCE flow'));
      (document.querySelector('[aria-label="More actions"]') as HTMLElement).click();
      await eventually(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((element) =>
          element.textContent?.startsWith('Convert to project'),
        );
        expect(item?.getAttribute('aria-disabled')).toBe('true');
      });
    });
  });
});
