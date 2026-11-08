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
  it('reads the page, which names its workspace, from the hash of the built and the dev server URLs', () => {
    expect(lastPageOf('file:///Applications/DevBrain/index.html#/app/wsp_1/tasks?view=board')).toBe(
      '/app/wsp_1/tasks?view=board',
    );
    expect(lastPageOf('http://localhost:5173/#/app/wsp_1/notes/nte_1')).toBe(
      '/app/wsp_1/notes/nte_1',
    );
    expect(lastPageOf('http://localhost:5173/#/app/wsp_1')).toBe('/app/wsp_1');
  });

  it("is null for a URL that shows no workspace's page", () => {
    expect(lastPageOf('http://localhost:5173/')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/workspaces/new')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/application')).toBeNull();
    // no workspace in it, or not a workspace id
    expect(lastPageOf('http://localhost:5173/#/app/tasks')).toBeNull();
    expect(lastPageOf('http://localhost:5173/#/app/prj_1/tasks')).toBeNull();
    expect(lastPageOf(`http://localhost:5173/#/app/wsp_1/${'a'.repeat(2048)}`)).toBeNull();
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

  const url = (page: string) => `http://localhost:5173/#${page}`;

  it("saves the page the window was on in the workspace's manifest when it closes", async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    await devBrain.workspaces.open(work);

    window.navigate(url(`/app/${work}/calendar?view=month`));
    // navigating saves nothing
    expect(savedPage(work)).toBeNull();

    await devBrain.close();
    expect(savedPage(work)).toBe(`/app/${work}/calendar?view=month`);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(devBrain.workspaces.getById(work).path, 'workspace.json'),
        'utf8',
      ),
    );
    expect(manifest.lastPage).toBe(`/app/${work}/calendar?view=month`);
  });

  it('saves the last page the window showed, after a load and filter changes', async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    await devBrain.workspaces.open(work);

    window.navigate(url(`/app/${work}/home`), false);
    window.navigate(url(`/app/${work}/tasks?view=list`));
    window.navigate(url(`/app/${work}/tasks?view=board`));
    // onboarding shows no page of a workspace, and changes nothing
    window.navigate(url('/onboarding'));
    await devBrain.close();
    expect(savedPage(work)).toBe(`/app/${work}/tasks?view=board`);
  });

  it("saves the closing workspace's own page, though the window is on the next one's", async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    window.navigate(url(`/app/${work}/tasks/tsk_1`));

    // a switch: the router moves the URL to Home's page first, then Home opens (closing Work)
    window.navigate(url(`/app/${home}`));
    window.navigate(url(`/app/${home}/home`));
    const opened = await devBrain.workspaces.open(home);
    expect(savedPage(work)).toBe(`/app/${work}/tasks/tsk_1`);
    expect(opened.info.lastPage).toBeNull();

    window.navigate(url(`/app/${home}/notes`));
    // and back: Back moves the URL to Work's page before Work reopens
    window.navigate(url(`/app/${work}/tasks/tsk_1`));
    const reopened = await devBrain.workspaces.open(work);
    expect(savedPage(home)).toBe(`/app/${home}/notes`);
    // the workspace opened says where it was
    expect(reopened.info.lastPage).toBe(`/app/${work}/tasks/tsk_1`);
  });

  it("never gives a workspace another's page", async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    window.navigate(url(`/app/${work}/projects`));
    await devBrain.workspaces.open(home);
    // the window never reached a page of Home's before it closed
    await devBrain.close();
    expect(savedPage(work)).toBe(`/app/${work}/projects`);
    expect(savedPage(home)).toBeNull();
  });

  it('remembers the last page seen in each workspace, for the window made next', async () => {
    const window = fakeApp();
    const pages = saveLastPageOnClose(window.app, devBrain);
    window.openWindow();
    const work = await createWorkspace(devBrain, 'Work');
    expect(pages.of(work)).toBeNull();
    window.navigate(url(`/app/${work}/notes`));
    expect(pages.of(work)).toBe(`/app/${work}/notes`);
  });

  it('saves nothing for a deleted workspace', async () => {
    const window = attach();
    const work = await createWorkspace(devBrain, 'Work');
    await devBrain.workspaces.open(work);
    window.navigate(url(`/app/${work}/notes`));
    await expect(devBrain.workspaces.delete(work)).resolves.toBeUndefined();
  });
});
