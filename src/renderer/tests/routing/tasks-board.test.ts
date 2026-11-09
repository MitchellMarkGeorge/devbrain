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
});
