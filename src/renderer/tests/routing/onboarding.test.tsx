// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  at,
  failure,
  initialContext,
  MainError,
  none,
  open,
  opening,
  renderApp,
  splashShown,
  unmountAll,
  waitFor,
  workspace,
} from './harness';

// Welcome, Create workspace and Choose workspace over a fake main, and the in-app New workspace
// dialog that shares the create form.

afterEach(() => unmountAll());

const work = workspace('Work', { lastOpenedAt: Date.UTC(2026, 10, 1) });
const home = workspace('Home', { lastOpenedAt: Date.UTC(2026, 10, 5) });
const old = workspace('Old');
const fourth = workspace('Fourth', { lastOpenedAt: Date.UTC(2026, 9, 1) });

function click(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to click');
  act(() => (element as HTMLElement).click());
}

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button, a, [role="menuitem"]')].find(
    (element) => element.textContent?.trim() === name,
  ) as HTMLButtonElement | undefined;
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const withWorkspaces = (...items: ReturnType<typeof workspace>[]) =>
  initialContext(none(), { workspaces: { items, nextCursor: null } });

describe('Welcome', () => {
  it('offers to create a workspace or open a folder when there are none', async () => {
    const app = renderApp();
    await waitFor(() => expect(app.text()).toContain('Start with a workspace'));
    expect(button('Create Workspace')).toBeDefined();
    expect(button('Open Existing Folder…')).toBeDefined();
    expect(app.text()).not.toContain('Recent workspaces');
    // no help yet
    expect(button('What’s a workspace?')?.disabled).toBe(true);
  });

  it('lists the three most recently opened workspaces, and links to the rest', async () => {
    const context = withWorkspaces(work, home, old, fourth);
    const app = renderApp({
      context,
      handlers: { 'workspaces.list': () => context.workspaces },
    });
    await waitFor(() => expect(app.text()).toContain('Recent workspaces'));
    const names = [...document.querySelectorAll('[role="group"] button')].map(
      (item) => item.textContent,
    );
    expect(names.map((name) => name?.slice(1, 5))).toEqual(['Home', 'Work', 'Four']);
    expect(app.text()).toContain('Created Mar 2026');

    click(button('All Workspaces'));
    await waitFor(() => expect(at(app)).toBe('/onboarding/choose_workspace'));
    await waitFor(() => expect(app.text()).toContain('Old'));
  });

  it('opens a workspace picked, under the splash, then goes to its landing page', async () => {
    const app = renderApp({
      context: withWorkspaces(work),
      handlers: {
        'workspaces.open': () => {
          app.push(opening(work));
          app.push(open(work));
          return work;
        },
      },
    });
    await waitFor(() => expect(app.text()).toContain('Recent workspaces'));
    click(document.querySelector('[role="group"] button'));

    await waitFor(() => expect(splashShown()).toBe(true));
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    expect(app.inputs('workspaces.open')).toEqual([{ id: work.id }]);
  });

  it('shows a failed open once onboarding is back, from the workspace state', async () => {
    const app = renderApp({
      context: withWorkspaces(work),
      handlers: {
        'workspaces.open': () => {
          app.push(opening(work));
          app.push(none(failure('workspace_migration', 'The migration failed')));
          throw new MainError('workspace_migration', 'The migration failed');
        },
      },
    });
    await waitFor(() => expect(app.text()).toContain('Recent workspaces'));
    click(document.querySelector('[role="group"] button'));

    await waitFor(() => expect(app.text()).toContain('This workspace couldn’t be updated'));
    // one dialog: the call's own failure came back to a page that had gone
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  });

  it('shows a workspace missing from a stale list, which changes nothing', async () => {
    const app = renderApp({
      context: withWorkspaces(work),
      handlers: {
        'workspaces.open': () => {
          throw new MainError('not_found', 'Workspace wsp_work not found');
        },
      },
    });
    await waitFor(() => expect(app.text()).toContain('Recent workspaces'));
    click(document.querySelector('[role="group"] button'));

    await waitFor(() => expect(app.text()).toContain('Workspace wsp_work not found'));
    expect(at(app)).toBe('/onboarding');
  });

  it('explains a folder that is not a workspace, and offers another', async () => {
    const app = renderApp({
      handlers: {
        'workspaces.importFolder': () => {
          throw new MainError(
            'workspace_import',
            'Downloads is not a DevBrain workspace folder: it has no workspace database',
            { reason: 'not_a_workspace', workspaceId: null },
          );
        },
      },
    });
    await waitFor(() => expect(button('Open Existing Folder…')).toBeDefined());
    click(button('Open Existing Folder…'));

    await waitFor(() => expect(app.text()).toContain('This folder isn’t a DevBrain workspace'));
    expect(app.text()).toContain('Downloads is not a DevBrain workspace folder');
    click(button('Choose Another Folder'));
    await waitFor(() => expect(app.inputs('workspaces.importFolder')).toHaveLength(2));
  });

  it('offers to open a workspace that is already in the list', async () => {
    const app = renderApp({
      handlers: {
        'workspaces.importFolder': () => {
          throw new MainError('workspace_import', 'This folder is already in your list as "Work"', {
            reason: 'already_added',
            workspaceId: work.id,
          });
        },
        'workspaces.open': () => work,
      },
    });
    await waitFor(() => expect(button('Open Existing Folder…')).toBeDefined());
    click(button('Open Existing Folder…'));
    await waitFor(() => expect(app.text()).toContain('already in your list'));

    click(button('Open It'));
    await waitFor(() => expect(app.inputs('workspaces.open')).toEqual([{ id: work.id }]));
  });

  it('says a workspace needs a newer DevBrain', async () => {
    const app = renderApp({
      context: withWorkspaces(work),
      handlers: {
        'workspaces.open': () => {
          throw new MainError('workspace_too_new', 'Update DevBrain to open it');
        },
      },
    });
    await waitFor(() => expect(app.text()).toContain('Recent workspaces'));
    click(document.querySelector('[role="group"] button'));
    await waitFor(() => expect(app.text()).toContain('This workspace needs a newer DevBrain'));
    expect(at(app)).toBe('/onboarding');
  });
});

// Welcome's Create Workspace: onboarding's router always starts at Welcome
async function goToNewWorkspace(app: ReturnType<typeof renderApp>) {
  await waitFor(() => expect(button('Create Workspace')).toBeDefined());
  click(button('Create Workspace'));
  await waitFor(() => expect(at(app)).toBe('/onboarding/new_workspace'));
  await waitFor(() => expect(app.text()).toContain('Create a workspace'));
}

describe('Create workspace', () => {
  it('creates the workspace in the colour picked, then opens it', async () => {
    const created = workspace('Open source');
    const app = renderApp({
      handlers: {
        'workspaces.create': () => created,
        'workspaces.open': () => created,
      },
    });
    await goToNewWorkspace(app);

    type(document.querySelector('input[name="name"]')!, '  Open source ');
    click(document.querySelector('[aria-label="Blue"]'));
    click(button('Create Workspace'));

    await waitFor(() =>
      expect(app.inputs('workspaces.create')).toEqual([{ name: 'Open source', color: '#2b7fff' }]),
    );
    await waitFor(() => expect(app.inputs('workspaces.open')).toEqual([{ id: created.id }]));
  });

  it('asks for a name before creating anything', async () => {
    const app = renderApp();
    await goToNewWorkspace(app);
    click(button('Create Workspace'));
    await waitFor(() => expect(app.text()).toContain('Enter a name for the workspace.'));
    expect(app.calls()).not.toContain('workspaces.create');
  });

  it('goes back to Welcome', async () => {
    const app = renderApp();
    await goToNewWorkspace(app);
    click(button('Back'));
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
  });
});

describe('the New workspace dialog in the app', () => {
  it("opens from the sidebar's workspace menu and creates the workspace there", async () => {
    const created = workspace('Side');
    const app = renderApp({
      hash: '/app/home',
      context: initialContext(open(work)),
      handlers: {
        'workspaces.create': () => created,
        'workspaces.open': () => {
          app.push(opening(created));
          app.push(open(created));
          return created;
        },
      },
    });
    await waitFor(() => expect(app.text()).toContain('Work'));

    const trigger = document.querySelector('[aria-label="Workspace: Work"]')!;
    act(() => {
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      (trigger as HTMLElement).click();
    });
    await waitFor(() => expect(button('New workspace…')).toBeDefined());
    click(button('New workspace…'));

    await waitFor(() => expect(app.text()).toContain('It opens once it’s created.'));
    // no navigation: the dialog sits over the page
    expect(at(app)).toBe('/app/home');
    type(document.querySelector('input[name="name"]')!, 'Side');
    click(button('Create Workspace'));
    await waitFor(() => expect(app.inputs('workspaces.open')).toEqual([{ id: created.id }]));
    await waitFor(() => expect(app.text()).not.toContain('It opens once it’s created.'));
    await waitFor(() => expect(app.text()).toContain('Side'));
    expect(at(app)).toBe('/app/home');
  });
});
