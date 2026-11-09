// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { FakeMain, workspace } from './fake-main';
import { eventually, startApp, stopApps } from './harness';

// The keyboard layer as the app mounts it: the default keymap's app-wide keys in a workspace.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

function key(key: string, options: KeyboardEventInit = {}) {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  );
}

async function onWorkHome() {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  const app = startApp(main, { url: `/app/${WORK}/home` });
  await eventually(() => expect(app.text()).toContain('Work recents.list'));
  return app;
}

describe('the app-wide keys', () => {
  it('go to a page with G and a letter', async () => {
    const app = await onWorkHome();
    key('g');
    key('t');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
    key('g');
    key('n');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes`));
  });

  it('show the shortcuts with ?, listing the keys that work', async () => {
    await onWorkHome();
    key('?', { shiftKey: true });
    await eventually(() => expect(document.body.textContent).toContain('Keyboard shortcuts'));
    expect(document.body.textContent).toContain('Go to Tasks');
    // not built yet, so not listed
    expect(document.body.textContent).not.toContain('Search');
  });

  it('toggle the sidebar with ⌘\\', async () => {
    await onWorkHome();
    // the test window is compact, where the sidebar rests hidden: ⌘\ opens it as a drawer
    const drawer = () => document.querySelector('[aria-label="Sidebar"]');
    expect(drawer()).toBeNull();
    key('\\', { metaKey: true });
    await eventually(() => expect(drawer()).not.toBeNull());
  });
});
