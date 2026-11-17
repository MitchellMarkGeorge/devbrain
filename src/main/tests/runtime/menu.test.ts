import { describe, it, expect, vi } from 'vitest';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import type { DevBrain } from '@main/core';
import { NotFoundError } from '@main/core/shared/errors';
import type { Desktop } from '../../ipc/desktop';
import {
  buildMenuTemplate,
  createMenuActions,
  installAppMenu,
  type MenuActionDeps,
  type MenuActions,
  type MenuState,
} from '../../runtime/menu';

function fakeActions(): MenuActions {
  return {
    runCommand: vi.fn(),
    openWorkspaceFolder: vi.fn(async () => undefined),
    syncNow: vi.fn(async () => undefined),
    showWorkspaceFolder: vi.fn(async () => undefined),
    showDevBrainFolder: vi.fn(async () => undefined),
    showLogFile: vi.fn(),
  };
}

const OPEN: MenuState = { devBrainLoaded: true, workspaceName: 'Work' };
const NONE_OPEN: MenuState = { devBrainLoaded: true, workspaceName: null };

function template(options: {
  platform?: NodeJS.Platform;
  isPackaged?: boolean;
  state?: MenuState;
  actions?: MenuActions;
}) {
  return buildMenuTemplate({
    platform: options.platform ?? 'darwin',
    appName: 'DevBrain',
    isPackaged: options.isPackaged ?? true,
    state: options.state ?? OPEN,
    actions: options.actions ?? fakeActions(),
  });
}

// every item of the menu, submenus included
function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

function item(items: MenuItemConstructorOptions[], id: string): MenuItemConstructorOptions {
  const found = flatten(items).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No menu item ${id}`);
  return found;
}

const click = (menuItem: MenuItemConstructorOptions) =>
  (menuItem.click as () => void | undefined)();

const roles = (items: MenuItemConstructorOptions[]) =>
  flatten(items).flatMap((candidate) => (candidate.role ? [candidate.role] : []));

describe('buildMenuTemplate', () => {
  it('starts with the app menu on macOS, and puts Quit in File elsewhere', () => {
    const mac = template({ platform: 'darwin' });
    expect(mac[0].label).toBe('DevBrain');
    expect(mac.map((menu) => menu.label ?? menu.role)).toEqual([
      'DevBrain',
      'File',
      'Edit',
      'View',
      'Workspace',
      'windowMenu',
      'help',
    ]);
    const windows = template({ platform: 'win32' });
    expect(windows[0].label).toBe('File');
    expect(roles(windows.slice(0, 1))).toContain('quit');
    expect(roles(mac.slice(1, 2))).toContain('close');
  });

  it('enables the workspace commands only while a workspace is open', () => {
    const ids = [
      'import-tasks',
      'import-notes',
      'export-tasks-csv',
      'export-tasks-json',
      'export-notes',
      'sync-now',
      'show-workspace-folder',
    ];
    for (const id of ids) {
      expect(item(template({ state: OPEN }), id).enabled).toBe(true);
      expect(item(template({ state: NONE_OPEN }), id).enabled).toBe(false);
    }
    expect(item(template({ state: NONE_OPEN }), 'open-workspace-folder').enabled).toBe(true);
    expect(item(template({ state: NONE_OPEN }), 'show-devbrain-folder').enabled).toBe(true);
  });

  it("enables the window's commands only while a workspace is open", () => {
    const ids = [
      'new-task',
      'new-note',
      'settings',
      'find',
      'go-to',
      'go-to-home',
      'go-to-tasks',
      'go-to-trash',
    ];
    for (const id of ids) {
      expect(item(template({ state: OPEN }), id).enabled).toBe(true);
      expect(item(template({ state: NONE_OPEN }), id).enabled).toBe(false);
    }
  });

  it.each(['win32', 'linux'] as const)(
    "shows the default keymap's keys on %s, leaving them to the window's keyboard layer",
    (platform) => {
      const items = template({ platform });
      const keys = (id: string) => {
        const found = item(items, id);
        return { accelerator: found.accelerator, registerAccelerator: found.registerAccelerator };
      };
      // C and N type in a field, and ⌘K is Link in the editor: the window decides
      expect(keys('new-task')).toEqual({ accelerator: 'C', registerAccelerator: false });
      expect(keys('new-note')).toEqual({ accelerator: 'N', registerAccelerator: false });
      expect(keys('find')).toEqual({ accelerator: 'CmdOrCtrl+K', registerAccelerator: false });
      // the keymap has no ⌘,: the menu owns it
      expect(keys('settings')).toEqual({
        accelerator: 'CmdOrCtrl+,',
        registerAccelerator: undefined,
      });
      // G T is a sequence, which an accelerator can't be
      expect(item(items, 'go-to-tasks').accelerator).toBeUndefined();
    },
  );

  it("shows none of the keymap's keys on macOS, where the menu would take them from the page", () => {
    // registerAccelerator is Linux and Windows only: a Mac menu item's key always fires, so C and
    // N would open New Task and New Note while typing, and ⌘K would open Find in the editor
    const items = template({ platform: 'darwin' });
    for (const id of ['new-task', 'new-note', 'find']) {
      expect(item(items, id).accelerator).toBeUndefined();
    }
    // ⌘, isn't in the keymap: the menu still owns it
    expect(item(items, 'settings').accelerator).toBe('CmdOrCtrl+,');
  });

  it('puts Settings in the app menu on macOS, and in File elsewhere', () => {
    const mac = template({ platform: 'darwin' });
    expect(flatten(mac.slice(0, 1)).map((entry) => entry.id)).toContain('settings');
    const windows = template({ platform: 'win32' });
    expect(flatten(windows.slice(0, 1)).map((entry) => entry.id)).toContain('settings');
    expect(flatten(windows).filter((entry) => entry.id === 'settings')).toHaveLength(1);
  });

  it('lists every page under Go to, and Find in Edit', () => {
    const items = template({});
    const goTo = item(items, 'go-to').submenu as MenuItemConstructorOptions[];
    expect(goTo.map((entry) => entry.label)).toEqual([
      'Home',
      'Tasks',
      'Projects',
      'Notes',
      'Calendar',
      'Integrations',
      'Trash',
    ]);
    const edit = items.find((menu) => menu.label === 'Edit')!;
    expect(flatten([edit]).map((entry) => entry.id)).toContain('find');
    expect(roles([edit])).toEqual(expect.arrayContaining(['undo', 'copy', 'paste', 'selectAll']));
  });

  it("runs the window's commands by their keyboard command id", () => {
    const actions = fakeActions();
    const items = template({ actions });
    for (const id of ['new-task', 'new-note', 'settings', 'find', 'go-to-calendar']) {
      click(item(items, id));
    }
    expect(vi.mocked(actions.runCommand).mock.calls).toEqual([
      ['task.new'],
      ['note.new'],
      ['nav.settings'],
      ['search.open'],
      ['nav.calendar'],
    ]);
  });

  it("runs Import and Export in the window, as the Settings page's buttons", () => {
    const actions = fakeActions();
    const items = template({ actions });
    for (const id of [
      'import-tasks',
      'import-notes',
      'export-tasks-csv',
      'export-tasks-json',
      'export-notes',
    ]) {
      click(item(items, id));
    }
    expect(vi.mocked(actions.runCommand).mock.calls).toEqual([
      ['transfer.importTasks'],
      ['transfer.importNotes'],
      ['transfer.exportTasksCsv'],
      ['transfer.exportTasksJson'],
      ['transfer.exportNotes'],
    ]);
  });

  it('disables every DevBrain command when DevBrain did not load', () => {
    const items = template({ state: { devBrainLoaded: false, workspaceName: null } });
    expect(item(items, 'open-workspace-folder').enabled).toBe(false);
    expect(item(items, 'show-devbrain-folder').enabled).toBe(false);
    expect(item(items, 'sync-now').enabled).toBe(false);
    // the log is still there to read
    expect(item(items, 'show-log-file').enabled).toBeUndefined();
  });

  it('shows the developer tools in development only', () => {
    expect(roles(template({ isPackaged: true }))).not.toContain('toggleDevTools');
    expect(roles(template({ isPackaged: false }))).toEqual(
      expect.arrayContaining(['toggleDevTools', 'forceReload']),
    );
  });

  it('names the platform file manager', () => {
    expect(item(template({ platform: 'darwin' }), 'show-workspace-folder').label).toBe(
      'Show Workspace in Finder',
    );
    expect(item(template({ platform: 'win32' }), 'show-workspace-folder').label).toBe(
      'Show Workspace in Explorer',
    );
    expect(item(template({ platform: 'linux' }), 'show-workspace-folder').label).toBe(
      'Show Workspace in File Manager',
    );
  });

  it('runs each command through its action', () => {
    const actions = fakeActions();
    const items = template({ actions });
    click(item(items, 'sync-now'));
    click(item(items, 'show-log-file'));
    expect(actions.syncNow).toHaveBeenCalledOnce();
    expect(actions.showLogFile).toHaveBeenCalledOnce();
  });
});

// --- Actions --------------------------------------------------------------

function fakeWorkspace(name = 'Work') {
  return {
    info: { id: 'workspace_1', name, path: `/devbrain/${name}` },
    sync: { syncNow: vi.fn(async () => undefined) },
  };
}

function fakeDesktop(): { [K in keyof Desktop]: ReturnType<typeof vi.fn> } {
  return {
    openFolder: vi.fn(async () => undefined),
    showItem: vi.fn(async () => undefined),
    chooseFiles: vi.fn(async () => ['/in/tasks.csv']),
    chooseFolder: vi.fn(async () => '/chosen'),
    chooseSaveFile: vi.fn(async () => '/out/tasks.csv'),
    showAppMenu: vi.fn(async () => undefined),
    showLogFile: vi.fn(async () => undefined),
  };
}

const WINDOW = { id: 'the window' } as unknown as BrowserWindow;

function setup() {
  const workspace = fakeWorkspace();
  const imported = fakeWorkspace('Imported');
  const devBrain = {
    path: '/devbrain',
    currentWorkspace: workspace as ReturnType<typeof fakeWorkspace> | null,
    settings: { set: vi.fn() },
    workspaces: {
      import: vi.fn(async () => imported.info),
      open: vi.fn(async () => {
        devBrain.currentWorkspace = imported;
        return imported;
      }),
    },
  };
  const desktop = fakeDesktop();
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })) };
  const deps = {
    devBrain: devBrain as unknown as DevBrain,
    window: () => WINDOW,
    send: vi.fn(),
    desktop: () => desktop as unknown as Desktop,
    dialog: dialog as unknown as MenuActionDeps['dialog'],
    showItemInFolder: vi.fn(),
    logFilePath: () => '/logs/main.log',
    logger: { warn: vi.fn() },
  };
  return { actions: createMenuActions(deps), devBrain, workspace, desktop, dialog, deps };
}

describe('createMenuActions', () => {
  it('adds the chosen folder as a workspace, opens it and remembers it', async () => {
    const { actions, devBrain, desktop } = setup();
    await actions.openWorkspaceFolder();
    expect(desktop.chooseFolder).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Open Workspace Folder' }),
    );
    expect(devBrain.workspaces.import).toHaveBeenCalledWith('/chosen');
    expect(devBrain.workspaces.open).toHaveBeenCalledWith('workspace_1');
    expect(devBrain.settings.set).toHaveBeenCalledWith('state.lastWorkspaceId', 'workspace_1');
  });

  it('does nothing when a dialog is cancelled', async () => {
    const { actions, devBrain, desktop, dialog } = setup();
    desktop.chooseFolder.mockResolvedValue(null);
    await actions.openWorkspaceFolder();
    expect(devBrain.workspaces.import).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('syncs and shows the open workspace', async () => {
    const { actions, workspace, desktop } = setup();
    await actions.syncNow();
    await actions.showWorkspaceFolder();
    await actions.showDevBrainFolder();
    expect(workspace.sync.syncNow).toHaveBeenCalledOnce();
    expect(desktop.openFolder.mock.calls).toEqual([['/devbrain/Work'], ['/devbrain']]);
  });

  it('sends a command to the window with the open workspace, and nothing without one', () => {
    const { actions, devBrain, deps } = setup();
    actions.runCommand('task.new');
    expect(deps.send).toHaveBeenCalledWith(WINDOW, 'app.command', {
      command: 'task.new',
      workspaceId: 'workspace_1',
    });
    devBrain.currentWorkspace = null;
    actions.runCommand('nav.home');
    expect(deps.send).toHaveBeenCalledOnce();
  });

  it("shows core's message for a core error, a generic one otherwise, and never rejects", async () => {
    const { actions, workspace, dialog, deps } = setup();
    workspace.sync.syncNow.mockRejectedValueOnce(new NotFoundError('task_x' as never));
    await expect(actions.syncNow()).resolves.toBeUndefined();
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      WINDOW,
      expect.objectContaining({ detail: 'No entity found with id: task_x' }),
    );

    workspace.sync.syncNow.mockRejectedValueOnce(new Error('secret token abc'));
    await expect(actions.syncNow()).resolves.toBeUndefined();
    const [, options] = dialog.showMessageBox.mock.lastCall as unknown as [
      unknown,
      { detail: string },
    ];
    expect(options.detail).not.toContain('secret');
    // the class only, never the message
    expect(deps.logger.warn).toHaveBeenLastCalledWith('Menu command syncNow failed error=Error');
  });

  it('shows the log file', () => {
    const { actions, deps } = setup();
    actions.showLogFile();
    expect(deps.showItemInFolder).toHaveBeenCalledWith('/logs/main.log');
  });
});

describe('installAppMenu', () => {
  it('sets the menu again whenever the workspaces change', () => {
    let listener: (() => void) | null = null;
    const devBrain = {
      currentWorkspace: null as { info: { name: string } } | null,
      workspaces: {
        onChange: vi.fn((next: () => void) => {
          listener = next;
          return () => (listener = null);
        }),
      },
    };
    const setApplicationMenu = vi.fn();
    const stop = installAppMenu({
      setApplicationMenu,
      platform: 'linux',
      appName: 'DevBrain',
      isPackaged: true,
      devBrain: devBrain as unknown as DevBrain,
      actions: fakeActions(),
    });
    const syncEnabled = () =>
      item(setApplicationMenu.mock.lastCall![0] as MenuItemConstructorOptions[], 'sync-now')
        .enabled;
    expect(syncEnabled()).toBe(false);

    devBrain.currentWorkspace = { info: { name: 'Work' } };
    listener!();
    expect(setApplicationMenu).toHaveBeenCalledTimes(2);
    expect(syncEnabled()).toBe(true);

    stop();
    expect(listener).toBeNull();
  });

  it('sets a menu with DevBrain commands disabled when DevBrain did not load', () => {
    const setApplicationMenu = vi.fn();
    installAppMenu({
      setApplicationMenu,
      platform: 'darwin',
      appName: 'DevBrain',
      isPackaged: true,
      devBrain: null,
      actions: fakeActions(),
    });
    const items = setApplicationMenu.mock.lastCall![0] as MenuItemConstructorOptions[];
    expect(item(items, 'open-workspace-folder').enabled).toBe(false);
  });
});
