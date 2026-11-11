// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { LinkState, Provider, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeTask, FakeTasks } from './fake-tasks';
import { eventually, startApp, stopApps } from './harness';

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
});
