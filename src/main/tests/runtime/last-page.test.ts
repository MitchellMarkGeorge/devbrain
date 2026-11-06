import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DevBrain } from '@main/core';
import { lastPageOf, saveLastPageOnClose } from '@main/runtime/last-page';
import { createWorkspace, tempDevBrain } from '../ipc/helpers';

// "Reopen last page": the page read from the window's URL, and saved when the workspace closes.

describe('lastPageOf', () => {
  it('reads the page from the hash of the built and the dev server URLs', () => {
    expect(lastPageOf('file:///Applications/DevBrain/index.html#/app/tasks?view=board')).toBe(
      '/app/tasks?view=board',
    );
    expect(lastPageOf('http://localhost:5173/#/app/notes/nte_1')).toBe('/app/notes/nte_1');
    expect(lastPageOf('http://localhost:5173/#/app')).toBe('/app');
  });

  it('is null for a URL that shows no page in the app', () => {
    expect(lastPageOf('http://localhost:5173/')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/onboarding/new_workspace')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/application')).toBeNull();
    expect(lastPageOf(`http://localhost:5173/#/app/${'a'.repeat(2048)}`)).toBeNull();
    expect(lastPageOf('not a url')).toBeNull();
  });
});

// an app whose one window navigates when told
function fakeApp() {
  const app = new EventEmitter();
  const contents = new EventEmitter();
  return {
    app: app as unknown as Parameters<typeof saveLastPageOnClose>[0],
    openWindow: () => app.emit('browser-window-created', {}, { webContents: contents }),
    navigate: (url: string, inPage = true) =>
      contents.emit(inPage ? 'did-navigate-in-page' : 'did-navigate', {}, url),
  };
}

describe('saveLastPageOnClose', () => {
  let devBrain: DevBrain;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ devBrain, cleanup } = await tempDevBrain());
  });

  afterEach(async () => {
    await cleanup();
  });

  it('saves the page the window was on when the workspace closes', async () => {
    const window = fakeApp();
    saveLastPageOnClose(window.app, devBrain);
    window.openWindow();
    await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));

    window.navigate('http://localhost:5173/#/app/calendar?view=month');
    // navigating saves nothing
    expect(devBrain.settings.get('state.lastPage')).toBeNull();

    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/calendar?view=month');
  });

  it('saves the last page in the app, through a load, a page outside the app and filters', async () => {
    const window = fakeApp();
    saveLastPageOnClose(window.app, devBrain);
    window.openWindow();
    await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));

    window.navigate('http://localhost:5173/#/app/home', false);
    window.navigate('http://localhost:5173/#/app/tasks?view=list');
    window.navigate('http://localhost:5173/#/app/tasks?view=board');
    window.navigate('http://localhost:5173/#/onboarding');
    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/tasks?view=board');
  });

  it("saves the old workspace's page on a switch, then the new one's at the next close", async () => {
    const window = fakeApp();
    saveLastPageOnClose(window.app, devBrain);
    window.openWindow();
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    window.navigate('http://localhost:5173/#/app/tasks/tsk_1');

    await devBrain.workspaces.open(home);
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/tasks/tsk_1');

    window.navigate('http://localhost:5173/#/app/home');
    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/home');
  });

  it("keeps the saved page when the closing workspace never showed one, so it isn't taken for the old one's", async () => {
    const window = fakeApp();
    saveLastPageOnClose(window.app, devBrain);
    window.openWindow();
    devBrain.settings.set('state.lastPage', '/app/notes');
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    window.navigate('http://localhost:5173/#/app/projects');
    await devBrain.workspaces.open(home);
    // the window never reached a page of Home's before it closed
    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/projects');
  });
});
