import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DevBrain } from '@main/core';
import { lastPageOf, PageTracker, saveLastPageOnClose } from '@main/runtime/last-page';
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

function fakeContents() {
  const emitter = new EventEmitter();
  return {
    on: (event: string, listener: (event: unknown, url: string) => void) =>
      emitter.on(event, listener),
    navigate: (url: string, inPage = true) =>
      emitter.emit(inPage ? 'did-navigate-in-page' : 'did-navigate', {}, url),
  };
}

describe('PageTracker', () => {
  it('keeps the last page in the app the window navigated to', () => {
    const contents = fakeContents();
    const pages = new PageTracker();
    pages.follow(contents);
    expect(pages.current).toBeNull();

    contents.navigate('http://localhost:5173/#/app/home', false);
    contents.navigate('http://localhost:5173/#/app/tasks?view=list');
    contents.navigate('http://localhost:5173/#/app/tasks?view=board');
    expect(pages.current).toBe('/app/tasks?view=board');
  });

  it('keeps the page it had through a page outside the app', () => {
    const contents = fakeContents();
    const pages = new PageTracker();
    pages.follow(contents);
    contents.navigate('http://localhost:5173/#/app/notes');
    contents.navigate('http://localhost:5173/#/onboarding');
    expect(pages.current).toBe('/app/notes');
  });
});

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
    const contents = fakeContents();
    const pages = new PageTracker();
    pages.follow(contents);
    saveLastPageOnClose(devBrain, pages);
    await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));

    contents.navigate('http://localhost:5173/#/app/calendar?view=month');
    // navigating saves nothing
    expect(devBrain.settings.get('state.lastPage')).toBeNull();

    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/calendar?view=month');
  });

  it("saves the old workspace's page on a switch, then the new one's at the next close", async () => {
    const contents = fakeContents();
    const pages = new PageTracker();
    pages.follow(contents);
    saveLastPageOnClose(devBrain, pages);
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    contents.navigate('http://localhost:5173/#/app/tasks/tsk_1');

    await devBrain.workspaces.open(home);
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/tasks/tsk_1');

    contents.navigate('http://localhost:5173/#/app/home');
    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/home');
  });

  it("keeps the saved page when the closing workspace never showed one, so it isn't taken for the old one's", async () => {
    const contents = fakeContents();
    const pages = new PageTracker();
    pages.follow(contents);
    saveLastPageOnClose(devBrain, pages);
    devBrain.settings.set('state.lastPage', '/app/notes');
    const work = await createWorkspace(devBrain, 'Work');
    const home = await createWorkspace(devBrain, 'Home');
    await devBrain.workspaces.open(work);
    contents.navigate('http://localhost:5173/#/app/projects');
    await devBrain.workspaces.open(home);
    // the window never reached a page of Home's before it closed
    await devBrain.close();
    expect(devBrain.settings.get('state.lastPage')).toBe('/app/projects');
  });
});
