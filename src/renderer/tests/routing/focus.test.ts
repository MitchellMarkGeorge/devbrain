// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { FakeMain, workspace } from './fake-main';
import { fakeTask, FakeTasks } from './fake-tasks';
import { eventually, startApp, stopApps } from './harness';

// Where focus goes as pages and sheets come and go (docs/accessibility.md): a new page takes
// focus when the old one took it away, so the list keys work at once, and a sheet gives focus
// back to the card that opened it.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

function app(url: string) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(
    WORK,
    new FakeTasks([fakeTask('tsk_plan', 'Plan the launch'), fakeTask('tsk_build', 'Build it')]),
  );
  return startApp(main, { url });
}

const card = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('section[aria-label] [data-task-id]')].find((el) =>
    el.textContent?.includes(title),
  );
const focusedTask = () =>
  document.activeElement?.closest('[data-task-id]')?.getAttribute('data-task-id');

function press(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('page focus', () => {
  it('focuses the list’s row when a list page opens with focus nowhere', async () => {
    app(`/app/${WORK}/tasks`);
    await eventually(() => expect(focusedTask()).toBe('tsk_plan'));
  });

  it('focuses the task page after a row opens it, and the list again on Back', async () => {
    const started = app(`/app/${WORK}/tasks`);
    await eventually(() => expect(focusedTask()).toBe('tsk_plan'));
    press(document.activeElement!, 'Enter');
    await eventually(() => expect(started.path()).toBe(`/app/${WORK}/tasks/tsk_plan`));
    await eventually(() => {
      const active = document.activeElement;
      expect(active).not.toBe(document.body);
      expect(active?.closest('main')).not.toBeNull();
    });
    started.router.history.back();
    await eventually(() => expect(started.path()).toBe(`/app/${WORK}/tasks`));
    await eventually(() => expect(focusedTask()).toBeDefined());
  });

  it('leaves focus alone when only the search changes', async () => {
    const started = app(`/app/${WORK}/tasks`);
    await eventually(() => expect(focusedTask()).toBe('tsk_plan'));
    const button = document.querySelector<HTMLElement>('[aria-label="Grouped"]')!;
    button.focus();
    button.click();
    await eventually(() => expect(started.path()).toContain('view=group'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(button);
  });
});

describe('the board’s sheet', () => {
  it('gives focus back to the card that opened it when it closes', async () => {
    const started = app(`/app/${WORK}/tasks?view=board`);
    await eventually(() => expect(card('Plan the launch')).toBeDefined());
    card('Plan the launch')!.focus();
    press(card('Plan the launch')!, 'Enter');
    await eventually(() => expect(started.path()).toContain('open=tsk_plan'));
    const sheet = () => document.querySelector('[data-testid="task-sheet"]');
    await eventually(() => expect(sheet()?.contains(document.activeElement)).toBe(true));
    started.router.history.back();
    await eventually(() => expect(sheet()).toBeNull());
    await eventually(() => expect(focusedTask()).toBe('tsk_plan'));
    expect(document.activeElement?.closest('section[aria-label]')).not.toBeNull();
  });
});
