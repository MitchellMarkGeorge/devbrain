// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeTask, FakeTasks } from './fake-tasks';
import { eventually, startApp, stopApps } from './harness';

// The tasks board (?view=board): a column per status, and the task sheet at ?open=tsk_….

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

// happy-dom lays nothing out, and the harness measures every element as the whole window: lay the
// columns side by side instead (each 480 wide, 32 apart), with each card inside its column, so
// dnd-kit can tell which column a dragged card is over.
function layOutColumns() {
  const base = Element.prototype.getBoundingClientRect;
  const rect = (left: number) => {
    const box = {
      x: left,
      y: 0,
      top: 0,
      left,
      width: 480,
      height: 768,
      right: left + 480,
      bottom: 768,
    };
    return { ...box, toJSON: () => box } as DOMRect;
  };
  const columnRect = (section: Element) => {
    const all = [...document.querySelectorAll('section[aria-label]')];
    return rect(all.indexOf(section) * 512);
  };
  for (const prototype of [Element.prototype, HTMLElement.prototype]) {
    prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
      const section = this.closest('section[aria-label]');
      return section ? columnRect(section) : base.call(this);
    };
  }
  return () => {
    for (const prototype of [Element.prototype, HTMLElement.prototype]) {
      prototype.getBoundingClientRect = base;
    }
  };
}

function press(target: Element, code: string) {
  const key = code === 'Space' ? ' ' : code;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }),
  );
}

const cardIn = (column: string, title: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(`section[aria-label="${column}"] [data-task-id]`),
  ].find((el) => el.textContent?.includes(title));

function board(url = `/app/${WORK}/tasks?view=board`) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(
    WORK,
    new FakeTasks([
      fakeTask('tsk_plan', 'Plan the launch'),
      fakeTask('tsk_build', 'Build the page', { status: TaskStatus.IN_PROGRESS }),
      fakeTask('tsk_ship', 'Ship it', { status: TaskStatus.COMPLETED }),
    ]),
  );
  return { main, app: startApp(main, { url }) };
}

const columns = (container: HTMLElement) =>
  [...container.querySelectorAll('section[aria-label]')].map((column) =>
    column.getAttribute('aria-label'),
  );

const card = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((el) =>
    el.textContent?.includes(title),
  );

describe('the board', () => {
  it('shows the open statuses as columns, each with its tasks', async () => {
    const { app } = board();
    await eventually(() => expect(app.text()).toContain('Build the page'));
    expect(columns(app.container)).toEqual(['Not started', 'In progress']);
    expect(app.text()).toContain('Plan the launch');
    expect(app.text()).not.toContain('Ship it');
  });

  it('shows one column for a single status', async () => {
    const { app } = board(`/app/${WORK}/tasks?view=board&status=completed`);
    await eventually(() => expect(app.text()).toContain('Ship it'));
    expect(columns(app.container)).toEqual(['Completed']);
  });

  it('opens a card in the sheet, and Back closes it', async () => {
    const { app } = board();
    await eventually(() => expect(card('Plan the launch')).toBeDefined());
    card('Plan the launch')!.click();
    await eventually(() => expect(app.path()).toContain('open=tsk_plan'));
    const sheet = () => document.querySelector('[data-testid="task-sheet"]');
    await eventually(() =>
      expect(sheet()?.querySelector('input[aria-label="Title"]')).toHaveProperty(
        'value',
        'Plan the launch',
      ),
    );
    app.router.history.back();
    await eventually(() => expect(app.path()).not.toContain('open='));
    await eventually(() => expect(sheet()).toBeNull());
  });

  it('moves a card to another column from the keyboard, setting its status', async () => {
    const restore = layOutColumns();
    try {
      const { main } = board();
      await eventually(() => expect(cardIn('Not started', 'Plan the launch')).toBeDefined());
      const card = cardIn('Not started', 'Plan the launch')!;
      card.focus();
      press(card, 'Space');
      // dnd-kit listens for the keys after the one that picked the card up a moment later
      await new Promise((resolve) => setTimeout(resolve, 10));
      press(card, 'ArrowRight');
      await eventually(() =>
        expect(document.body.textContent).toContain('Plan the launch is over In progress.'),
      );
      press(card, 'Space');
      await eventually(() => expect(main.callsTo('tasks.updateStatus')).toHaveLength(1));
      expect(main.callsTo('tasks.updateStatus')[0].input).toEqual({
        id: 'tsk_plan',
        status: TaskStatus.IN_PROGRESS,
      });
      // the card moves at once, and stays once the columns refetch
      await eventually(() => expect(cardIn('In progress', 'Plan the launch')).toBeDefined());
      expect(cardIn('Not started', 'Plan the launch')).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('puts a picked-up card back with Escape', async () => {
    const restore = layOutColumns();
    try {
      const { main } = board();
      await eventually(() => expect(cardIn('Not started', 'Plan the launch')).toBeDefined());
      const card = cardIn('Not started', 'Plan the launch')!;
      card.focus();
      press(card, 'Space');
      await new Promise((resolve) => setTimeout(resolve, 10));
      press(card, 'ArrowRight');
      press(card, 'Escape');
      await eventually(() =>
        expect(document.body.textContent).toContain('Plan the launch was put back.'),
      );
      expect(main.callsTo('tasks.updateStatus')).toHaveLength(0);
      expect(cardIn('Not started', 'Plan the launch')).toBeDefined();
    } finally {
      restore();
    }
  });
});
