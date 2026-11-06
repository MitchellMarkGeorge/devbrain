import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
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

  function attach() {
    const window = fakeApp();
    saveLastPageOnClose(window.app, devBrain);
    window.openWindow();
    return window;
  }

  const savedPage = (id: WorkspaceId) => devBrain.workspaces.getById(id).lastPage;

  it("saves the page the window was on in the workspace's manifest when it closes", async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    await devBrain.workspaces.open(work);

    window.navigate('http://localhost:5173/#/app/calendar?view=month');
    // navigating saves nothing
    expect(savedPage(work)).toBeNull();

    await devBrain.close();
    expect(savedPage(work)).toBe('/app/calendar?view=month');
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(devBrain.workspaces.getById(work).path, 'workspace.json'),
        'utf8',
      ),
    );
    expect(manifest.lastPage).toBe('/app/calendar?view=month');
  });

  it('saves the page the window is on, after a load and filter changes', async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    await devBrain.workspaces.open(work);

    window.navigate('http://localhost:5173/#/app/home', false);
    window.navigate('http://localhost:5173/#/app/tasks?view=list');
    window.navigate('http://localhost:5173/#/app/tasks?view=board');
    await devBrain.close();
    expect(savedPage(work)).toBe('/app/tasks?view=board');
  });

  it('keeps a page for each workspace across a switch', async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    window.navigate('http://localhost:5173/#/app/tasks/tsk_1');

    const opened = await devBrain.workspaces.open(home);
    expect(savedPage(work)).toBe('/app/tasks/tsk_1');
    expect(opened.info.lastPage).toBeNull();

    window.navigate('http://localhost:5173/#/app/notes');
    const reopened = await devBrain.workspaces.open(work);
    expect(savedPage(home)).toBe('/app/notes');
    // the workspace opened says where it was
    expect(reopened.info.lastPage).toBe('/app/tasks/tsk_1');
  });

  it("doesn't give a workspace that never showed a page the one before's", async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    window.navigate('http://localhost:5173/#/app/projects');
    await devBrain.workspaces.open(home);
    // the window never reached a page of Home's before it closed
    await devBrain.close();
    expect(savedPage(work)).toBe('/app/projects');
    expect(savedPage(home)).toBeNull();
  });
});
