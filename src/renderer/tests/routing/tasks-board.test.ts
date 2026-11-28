import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeTask, FakeTasks } from './fake-tasks';
import { click, eventually, menuItem, rightClick, startApp, stopApps } from './harness';

// The tasks board (?view=board): a column per status, and the task sheet at ?sheet=tsk_….

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

// dnd-kit starts a drag a render after the key that picks the card up, and listens for the next
// keys a moment after that: wait for the drag's first announcement ("Picked up …", replaced at
// once by "… is over Not started."), then that moment, rather than a fixed delay, which a busy
// machine can outrun
async function pickedUp(title: string) {
  await eventually(() =>
    expect(document.body.textContent).toMatch(new RegExp(`Picked up ${title}\\.|${title} is over`)),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('the board', () => {
  it('opens a card’s menu on a right-click, the board itself being the right-click area', async () => {
    const { main } = board();
    await eventually(() => expect(card('Build the page')).toBeDefined());
    rightClick(card('Build the page')!);
    const favorite = await menuItem('Favorite');
    // one element is the board, its key scope and the right-click area: the columns are its own
    const trigger = document.querySelector('[data-popup-open]')!;
    expect(trigger.getAttribute('data-key-scope')).toBe('board');
    expect(trigger.querySelectorAll(':scope > section[aria-label]')).toHaveLength(2);
    click(favorite);
    await eventually(() =>
      expect(main.callsTo('tasks.setFavorite').map((call) => call.input)).toEqual([
        { id: 'tsk_build', favorite: true },
      ]),
    );
  });

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
    await eventually(() => expect(app.path()).toContain('sheet=tsk_plan'));
    const sheet = () => document.querySelector('[data-testid="task-sheet"]');
    await eventually(() =>
      expect(sheet()?.querySelector('input[aria-label="Title"]')).toHaveProperty(
        'value',
        'Plan the launch',
      ),
    );
    app.router.history.back();
    await eventually(() => expect(app.path()).not.toContain('sheet='));
    await eventually(() => expect(sheet()).toBeNull());
  });

  it('closes the sheet with × or Esc after another card, as an entry of its own', async () => {
    const sheet = () => document.querySelector<HTMLElement>('[data-testid="task-sheet"]');
    const title = () =>
      sheet()?.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value;
    for (const how of ['button', 'key'] as const) {
      const { app } = board();
      await eventually(() => expect(card('Plan the launch')).toBeDefined());
      card('Plan the launch')!.click();
      await eventually(() => expect(title()).toBe('Plan the launch'));
      card('Build the page')!.click();
      await eventually(() => expect(title()).toBe('Build the page'));
      // the card already shown adds no entry
      const entries = app.router.history.length;
      card('Build the page')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(app.router.history.length).toBe(entries);

      if (how === 'button') click(sheet()!.querySelector('button[aria-label="Close"]'));
      else press(document.body, 'Escape');
      // closed, not back at the card before
      await eventually(() => expect(app.path()).not.toContain('sheet='));
      await eventually(() => expect(sheet()).toBeNull());
      expect(app.router.history.length).toBe(entries + 1);
      // Back undoes the close, then each card
      app.router.history.back();
      await eventually(() => expect(app.path()).toContain('sheet=tsk_build'));
      app.router.history.back();
      await eventually(() => expect(app.path()).toContain('sheet=tsk_plan'));
      stopApps();
    }
  });

  it('keeps the sheet through a toolbar change, and closes the same way after', async () => {
    const { app } = board();
    await eventually(() => expect(card('Plan the launch')).toBeDefined());
    card('Plan the launch')!.click();
    await eventually(() => expect(app.path()).toContain('sheet=tsk_plan'));
    const sheet = () => document.querySelector<HTMLElement>('[data-testid="task-sheet"]');
    await eventually(() => expect(sheet()).not.toBeNull());
    // a filter, as the toolbar writes one: in place of this entry
    await app.router.navigate({
      to: '.',
      search: (previous: object) => ({ ...previous, status: 'all' }),
      replace: true,
    } as never);
    await eventually(() => expect(app.path()).toContain('status=all'));
    expect(app.path()).toContain('sheet=tsk_plan');
    click(sheet()!.querySelector('button[aria-label="Close"]'));
    await eventually(() => expect(app.path()).not.toContain('sheet='));
    expect(app.path()).toContain('status=all');
    app.router.history.back();
    await eventually(() => expect(app.path()).toContain('sheet=tsk_plan'));
    expect(app.path()).toContain('status=all');
  });

  it('shows no sheet in the list, whatever the URL says, or for a param sheets had before', async () => {
    const sheet = () => document.querySelector('[data-sheet]');
    const list = board(`/app/${WORK}/tasks?view=list&sheet=tsk_plan`);
    await eventually(() => expect(list.app.text()).toContain('Plan the launch'));
    expect(sheet()).toBeNull();
    stopApps();
    const older = board(`/app/${WORK}/tasks?view=board&open=tsk_plan`);
    await eventually(() => expect(card('Plan the launch')).toBeDefined());
    expect(sheet()).toBeNull();
    expect(older.app.router.state.location.search).not.toHaveProperty('sheet');
  });

  it('moves a card to another column from the keyboard, setting its status', async () => {
    const restore = layOutColumns();
    try {
      const { main } = board();
      await eventually(() => expect(cardIn('Not started', 'Plan the launch')).toBeDefined());
      const card = cardIn('Not started', 'Plan the launch')!;
      card.focus();
      press(card, 'Space');
      await pickedUp('Plan the launch');
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
      await pickedUp('Plan the launch');
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
