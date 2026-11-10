// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { WorkspaceId } from '@common/ids';
import { LinkState, Provider, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

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
      expect(app.path()).toBe(`/app/${WORK}/tasks/${parent.id}?note=nte_pkce`),
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
  });

  it('opens a new task note in the sheet', async () => {
    const lone = fakeTask('tsk_lone', 'Lone task');
    const main = mainWith(new FakeTasks([lone]));
    const app = startApp(main, { url: `/app/${WORK}/tasks/${lone.id}` });
    await eventually(() =>
      expect(byText(app.container, 'button', 'Add a task note')).not.toBeNull(),
    );
    click(byText(app.container, 'button', 'Add a task note'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/${lone.id}?note=nte_new1`));
    expect(main.callsTo('notes.create').map((call) => call.input)).toEqual([
      { title: 'Lone task', linkedTaskId: lone.id },
    ]);
    await eventually(() =>
      expect(document.querySelector('[data-testid="note-sheet"]')).not.toBeNull(),
    );
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
