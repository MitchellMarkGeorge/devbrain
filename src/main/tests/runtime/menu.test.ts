import { describe, it, expect, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
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
    openWorkspaceFolder: vi.fn(async () => undefined),
    syncNow: vi.fn(async () => undefined),
    showWorkspaceFolder: vi.fn(async () => undefined),
    showDevBrainFolder: vi.fn(async () => undefined),
    importTasks: vi.fn(async () => undefined),
    importNotes: vi.fn(async () => undefined),
    exportTasks: vi.fn(async () => undefined),
    exportNotes: vi.fn(async () => undefined),
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
      'editMenu',
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
    click(item(items, 'export-tasks-json'));
    click(item(items, 'show-log-file'));
    expect(actions.syncNow).toHaveBeenCalledOnce();
    expect(actions.exportTasks).toHaveBeenCalledWith('json');
    expect(actions.showLogFile).toHaveBeenCalledOnce();
  });
});

// --- Actions --------------------------------------------------------------

function fakeWorkspace(name = 'Work') {
  return {
    info: { id: 'workspace_1', name, path: `/devbrain/${name}` },
    sync: { syncNow: vi.fn(async () => undefined) },
    transfer: {
      importTasksFromFile: vi.fn(async () => ({
        created: 3,
        skipped: [{}],
        errors: [],
        warnings: [],
      })),
      importNotesFromFiles: vi.fn(async () => ({
        created: 1,
        skipped: [],
        errors: [{}],
        warnings: [],
      })),
      exportTasksToFile: vi.fn(async (path: string, format: string) => ({
        path,
        format,
        count: 2,
      })),
      exportNotesToFolder: vi.fn(async (dir: string) => ({
        path: `${dir}/notes`,
        count: 4,
        errors: [],
      })),
    },
  };
}

function fakeDesktop(): { [K in keyof Desktop]: ReturnType<typeof vi.fn> } {
  return {
    openFolder: vi.fn(async () => undefined),
    chooseFiles: vi.fn(async () => ['/in/tasks.csv']),
    chooseFolder: vi.fn(async () => '/chosen'),
    chooseSaveFile: vi.fn(async () => '/out/tasks.csv'),
  };
}

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
    window: () => null,
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
    const { actions, devBrain, desktop, workspace, dialog } = setup();
    desktop.chooseFolder.mockResolvedValue(null);
    desktop.chooseFiles.mockResolvedValue(null);
    await actions.openWorkspaceFolder();
    await actions.importTasks();
    expect(devBrain.workspaces.import).not.toHaveBeenCalled();
    expect(workspace.transfer.importTasksFromFile).not.toHaveBeenCalled();
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

  it('imports and exports, and reports the result', async () => {
    const { actions, workspace, dialog } = setup();
    await actions.importTasks();
    expect(workspace.transfer.importTasksFromFile).toHaveBeenCalledWith('/in/tasks.csv');
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'info',
        message: 'Imported 3 tasks',
        detail: '1 skipped (already in the workspace)',
      }),
    );

    await actions.importNotes();
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'warning', message: 'Imported 1 note' }),
    );

    await actions.exportTasks('csv');
    expect(workspace.transfer.exportTasksToFile).toHaveBeenCalledWith('/out/tasks.csv', 'csv');
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Exported 2 tasks', detail: '/out/tasks.csv' }),
    );

    await actions.exportNotes();
    expect(workspace.transfer.exportNotesToFolder).toHaveBeenCalledWith('/chosen');
  });

  it('writes nothing when the workspace switched while the dialog was up', async () => {
    const { actions, devBrain, desktop, workspace, dialog } = setup();
    desktop.chooseFiles.mockImplementation(async () => {
      devBrain.currentWorkspace = fakeWorkspace('Other');
      return ['/in/tasks.csv'];
    });
    await actions.importTasks();
    expect(workspace.transfer.importTasksFromFile).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', detail: expect.stringContaining('switched') }),
    );
  });

  it("shows core's message for a core error, a generic one otherwise, and never rejects", async () => {
    const { actions, workspace, dialog, deps } = setup();
    workspace.sync.syncNow.mockRejectedValueOnce(new NotFoundError('task_x' as never));
    await expect(actions.syncNow()).resolves.toBeUndefined();
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: 'No entity found with id: task_x' }),
    );

    workspace.sync.syncNow.mockRejectedValueOnce(new Error('secret token abc'));
    await expect(actions.syncNow()).resolves.toBeUndefined();
    const [options] = dialog.showMessageBox.mock.lastCall as unknown as [{ detail: string }];
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
