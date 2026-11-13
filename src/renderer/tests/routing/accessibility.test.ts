// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import axe from 'axe-core';
import type { WorkspaceId } from '@common/ids';
import { TaskPriority, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { eventually, startApp, stopApps } from './harness';

// An axe check (WCAG 2.2 A and AA) of the app's key screens, drawn through the real routes over
// the fake main: names, roles, the rows' grid structure, headings and landmarks. happy-dom lays
// nothing out, so contrast and target sizes are left to the Storybook check in a real browser
// (docs/accessibility.md).

const WORK = 'wsp_work' as WorkspaceId;

// what src/renderer/index.html gives the window
document.documentElement.lang = 'en';
document.title = 'DevBrain';

afterEach(() => stopApps());

const PROJECT = fakeProject('prj_auth', 'Auth Overhaul');
const TASKS = [
  fakeTask('tsk_plan', 'Plan the launch', { priority: TaskPriority.HIGH, projectId: PROJECT.id }),
  fakeTask('tsk_build', 'Build the page', { status: TaskStatus.IN_PROGRESS }),
  fakeTask('tsk_review', 'Review the copy'),
];
const NOTES = [fakeNote('nte_pkce', 'PKCE design notes'), fakeNote('nte_retro', 'Sprint retro')];

function open(url: string) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(
    WORK,
    new FakeTasks(
      TASKS.map((task) => ({ ...task })),
      [{ ...PROJECT }],
      NOTES.map((note) => ({ ...note })),
    ),
  );
  return startApp(main, { url });
}

async function violations(): Promise<string[]> {
  const results = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: {
      // need layout, which happy-dom doesn't do: checked in a browser over Storybook instead
      'color-contrast': { enabled: false },
      'target-size': { enabled: false },
    },
  });
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.html.slice(0, 160)}`),
  );
}

describe('axe', () => {
  it.each([
    ['Home', '', 'Recent notes'],
    ['the tasks list', '/tasks', 'Plan the launch'],
    ['the tasks groups', '/tasks?view=group', 'Plan the launch'],
    ['the tasks board', '/tasks?view=board', 'Plan the launch'],
    ['the notes list', '/notes?view=list', 'PKCE design notes'],
    ['the projects list', '/projects?view=list', 'Auth Overhaul'],
    ['Settings', '/settings', 'Settings'],
  ])('finds nothing on %s', async (_name, path, text) => {
    const app = open(`/app/${WORK}${path}`);
    await eventually(() => expect(app.text()).toContain(text));
    expect(await violations()).toEqual([]);
  });

  it('fails a screen it should (axe runs in happy-dom)', async () => {
    const app = open(`/app/${WORK}/settings`);
    await eventually(() => expect(app.text()).toContain('Settings'));
    const orphan = document.createElement('div');
    orphan.setAttribute('role', 'row');
    orphan.innerHTML = '<button type="button"></button>';
    app.container.append(orphan);
    const found = await violations();
    expect(found.some((line) => line.startsWith('aria-required-parent'))).toBe(true);
    expect(found.some((line) => line.startsWith('button-name'))).toBe(true);
  });

  it('gives each list page one h1', async () => {
    for (const [path, title] of [
      ['/tasks', 'Tasks'],
      ['/notes', 'Notes'],
      ['/projects', 'Projects'],
      ['/trash', 'Trash'],
    ]) {
      const app = open(`/app/${WORK}${path}`);
      await eventually(() => expect(app.container.querySelectorAll('h1')).toHaveLength(1));
      expect(app.container.querySelector('h1')?.textContent).toBe(title);
      stopApps();
    }
  });
});
