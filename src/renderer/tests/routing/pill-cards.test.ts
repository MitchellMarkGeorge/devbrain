// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectId, WorkspaceId } from '@common/ids';
import { LinkState, Provider, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { eventually, startApp, stopApps } from './harness';

// The hover cards of the pills in a task row: pointing at a pill loads its item and, after the
// delay, opens its card below it with what the row does not show.

const WORK = 'wsp_work' as WorkspaceId;
const LAUNCH = fakeProject('prj_launch', 'Launch');

afterEach(() => stopApps());

function tasksPage() {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  const project = { id: LAUNCH.id as ProjectId, title: LAUNCH.title, color: LAUNCH.color };
  const tasks = [
    fakeTask('tsk_plan', 'Plan the launch', { projectId: LAUNCH.id, project }),
    fakeTask('tsk_ship', 'Ship it', {
      projectId: LAUNCH.id,
      project,
      status: TaskStatus.COMPLETED,
    }),
    fakeTask('tsk_fix', 'Fix the token refresh race', {
      external: {
        provider: Provider.LINEAR,
        state: LinkState.SYNCED,
        key: 'ENG-124',
        url: 'https://linear.app/devbrain/issue/ENG-124',
        statusLabel: 'In Review',
        priorityLabel: null,
        lastSyncedAt: new Date(),
      },
    }),
  ];
  main.taskStores.set(WORK, new FakeTasks(tasks, [LAUNCH]));
  const app = startApp(main, { url: `/app/${WORK}/tasks` });
  return { main, app };
}

const pill = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="row"] button')].find(
    (el) => el.textContent === text,
  );
const card = (title: string) => document.querySelector<HTMLElement>(`[aria-label="${title}"]`);

function point(element: HTMLElement) {
  element.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}

describe('a pill’s hover card', () => {
  it('opens on a project pill with its tasks done', async () => {
    const { main } = tasksPage();
    await eventually(() => expect(pill('Launch')).toBeDefined());
    point(pill('Launch')!);
    // loaded as the pill is pointed at, before the card opens
    await eventually(() => expect(main.callsTo('projects.get')).not.toHaveLength(0));
    await eventually(() => expect(card('Launch')?.textContent).toContain('1 of 2 tasks done'));
  });

  it('shows a synced task’s state at its provider from the row', async () => {
    tasksPage();
    await eventually(() => expect(pill('ENG-124')).toBeDefined());
    point(pill('ENG-124')!);
    const title = 'ENG-124 · Fix the token refresh race';
    await eventually(() => expect(card(title)?.textContent).toContain('In Review in Linear'));
    expect(card(title)?.textContent).toContain('Open in Linear');
  });
});
