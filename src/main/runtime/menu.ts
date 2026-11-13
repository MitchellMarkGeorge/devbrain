import path from 'node:path';
import type {
  BrowserWindow,
  Dialog,
  MenuItemConstructorOptions,
  MessageBoxOptions,
} from 'electron';
import type { DevBrain, Workspace } from '@main/core';
import { toDateString } from '@main/core/shared/dates';
import { CoreError } from '@main/core/shared/errors';
import { NOTE_EXTENSIONS } from '@main/core/transfer/service';
import type { AppEventName, AppEvents, MenuCommandId, MenuPage } from '@common/events';
import type { TaskFileFormat, TransferReport } from '@common/types';
import type { Desktop } from '../ipc/desktop';

// The app's menu bar: the platform's standard menus, plus DevBrain's own commands, of two kinds.
//
// - The window's commands (New Task, New Note, Settings…, Find…, Go to › a page) run in the window:
//   the item sends `app.command` with the keyboard layer's command id, and the window runs that
//   command from its registry, as its keys would. Their accelerators show the default keymap's
//   keys; the window's keyboard layer handles those keys itself (registerAccelerator: false), so
//   C and N still type in a field and ⌘K is still Link in the editor. Sequences (G T) can't be
//   accelerators, so Go to's items show none. Settings… (⌘,) has no key in the keymap, so the
//   menu owns that one.
// - Workspace commands (import, export, sync, show a folder) run in main against core, as their
//   IPC routes would, and core announces what it changed, so the renderer refetches through the
//   ChangeTracker as for any background change. An import or export then sends its summary to the
//   window (`transfer.completed`), which shows the same dialog or toast as the Settings buttons.
//
// The template is built from plain state, so tests can check it without Electron; installAppMenu
// rebuilds it whenever the open workspace changes, which enables or disables the commands that
// need one. On Windows the title bar's menu button pops up this same menu (app.showMenu).

// what the menu shows depends on
export interface MenuState {
  // false when DevBrain could not be loaded: every DevBrain command is disabled
  devBrainLoaded: boolean;
  // the open workspace's name, or null when none is open
  workspaceName: string | null;
}

// What each DevBrain command does. None rejects: a failure is shown to the user and logged.
export interface MenuActions {
  // sends a command to the window, to run as its keys would; does nothing without a workspace
  runCommand(command: MenuCommandId): void;
  openWorkspaceFolder(): Promise<void>;
  syncNow(): Promise<void>;
  showWorkspaceFolder(): Promise<void>;
  showDevBrainFolder(): Promise<void>;
  importTasks(): Promise<void>;
  importNotes(): Promise<void>;
  exportTasks(format: TaskFileFormat): Promise<void>;
  exportNotes(): Promise<void>;
  showLogFile(): void;
}

export interface MenuTemplateOptions {
  platform: NodeJS.Platform;
  appName: string;
  // the developer tools and force reload are shown in development only
  isPackaged: boolean;
  state: MenuState;
  actions: MenuActions;
}

// Finder, Explorer, or the file manager, as each platform names it
function fileManagerName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'Finder';
  if (platform === 'win32') return 'Explorer';
  return 'File Manager';
}

// Go to's pages, in the sidebar's order
const GO_TO: { page: MenuPage; label: string }[] = [
  { page: 'home', label: 'Home' },
  { page: 'tasks', label: 'Tasks' },
  { page: 'projects', label: 'Projects' },
  { page: 'notes', label: 'Notes' },
  { page: 'calendar', label: 'Calendar' },
  { page: 'integrations', label: 'Integrations' },
  { page: 'trash', label: 'Trash' },
];

export function buildMenuTemplate({
  platform,
  appName,
  isPackaged,
  state,
  actions,
}: MenuTemplateOptions): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin';
  const hasWorkspace = state.devBrainLoaded && state.workspaceName !== null;
  const fileManager = fileManagerName(platform);
  // a command's promise never rejects (MenuActions); this only drops it
  const run = (action: () => Promise<void>) => () => void action();

  // An item that runs one of the window's commands. `keys` is the default keymap's binding, shown
  // only: the window's keyboard layer handles it (see the top of this file).
  const command = (
    id: string,
    label: string,
    commandId: MenuCommandId,
    keys?: string,
  ): MenuItemConstructorOptions => ({
    id,
    label,
    enabled: hasWorkspace,
    ...(keys ? { accelerator: keys, registerAccelerator: false } : {}),
    click: () => actions.runCommand(commandId),
  });

  // ⌘, opens Settings: the menu's own key, as the keymap has none
  const settingsItem: MenuItemConstructorOptions = {
    id: 'settings',
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    enabled: hasWorkspace,
    click: () => actions.runCommand('nav.settings'),
  };

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      settingsItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      command('new-task', 'New Task', 'task.new', 'C'),
      command('new-note', 'New Note', 'note.new', 'N'),
      { type: 'separator' },
      {
        id: 'open-workspace-folder',
        label: 'Open Workspace Folder…',
        accelerator: 'CmdOrCtrl+O',
        enabled: state.devBrainLoaded,
        click: run(actions.openWorkspaceFolder),
      },
      { type: 'separator' },
      {
        id: 'import',
        label: 'Import',
        enabled: hasWorkspace,
        submenu: [
          {
            id: 'import-tasks',
            label: 'Tasks (CSV or JSON)…',
            enabled: hasWorkspace,
            click: run(actions.importTasks),
          },
          {
            id: 'import-notes',
            label: 'Notes (Markdown)…',
            enabled: hasWorkspace,
            click: run(actions.importNotes),
          },
        ],
      },
      {
        id: 'export',
        label: 'Export',
        enabled: hasWorkspace,
        submenu: [
          {
            id: 'export-tasks-csv',
            label: 'Tasks as CSV…',
            enabled: hasWorkspace,
            click: run(() => actions.exportTasks('csv')),
          },
          {
            id: 'export-tasks-json',
            label: 'Tasks as JSON…',
            enabled: hasWorkspace,
            click: run(() => actions.exportTasks('json')),
          },
          {
            id: 'export-notes',
            label: 'Notes as Markdown…',
            enabled: hasWorkspace,
            click: run(actions.exportNotes),
          },
        ],
      },
      { type: 'separator' },
      // Settings sits in the app menu on macOS
      ...(isMac ? [] : [settingsItem, { type: 'separator' } as const]),
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };

  // the platform's Edit menu (as role: 'editMenu' builds it), with Find… opening search
  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }] as const)
        : ([{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }] as const)),
      { type: 'separator' },
      command('find', 'Find…', 'search.open', 'CmdOrCtrl+K'),
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        id: 'go-to',
        label: 'Go to',
        enabled: hasWorkspace,
        submenu: GO_TO.map(({ page, label }) => command(`go-to-${page}`, label, `nav.${page}`)),
      },
      { type: 'separator' },
      { role: 'reload' },
      ...(isPackaged ? [] : ([{ role: 'forceReload' }, { role: 'toggleDevTools' }] as const)),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };

  const workspaceMenu: MenuItemConstructorOptions = {
    label: 'Workspace',
    submenu: [
      {
        id: 'sync-now',
        label: 'Sync Now',
        accelerator: 'CmdOrCtrl+Shift+S',
        enabled: hasWorkspace,
        click: run(actions.syncNow),
      },
      { type: 'separator' },
      {
        id: 'show-workspace-folder',
        label: `Show Workspace in ${fileManager}`,
        enabled: hasWorkspace,
        click: run(actions.showWorkspaceFolder),
      },
      {
        id: 'show-devbrain-folder',
        label: `Show DevBrain Folder in ${fileManager}`,
        enabled: state.devBrainLoaded,
        click: run(actions.showDevBrainFolder),
      },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      { id: 'show-log-file', label: 'Show Log File', click: () => actions.showLogFile() },
      // the About item lives in the app menu on macOS
      ...(isMac ? [] : ([{ type: 'separator' }, { role: 'about' }] as const)),
    ],
  };

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    workspaceMenu,
    { role: 'windowMenu' },
    helpMenu,
  ];
}

// --- Actions --------------------------------------------------------------

export interface MenuActionDeps {
  // null when DevBrain could not be loaded
  devBrain: DevBrain | null;
  // the window the dialogs are modal to, and commands and reports go to: the focused one when a
  // command runs, or null
  window: () => BrowserWindow | null;
  // sends an event to that window, showing it first if it is hidden; nothing without a window
  send: <K extends AppEventName>(
    window: BrowserWindow | null,
    name: K,
    payload: AppEvents[K],
  ) => void;
  // the file manager and the system dialogs, modal to that window
  desktop: (window: BrowserWindow | null) => Desktop;
  dialog: Pick<Dialog, 'showMessageBox'>;
  // shows the log file in the file manager
  showItemInFolder: (fullPath: string) => void;
  logFilePath: () => string;
  logger: { warn(...params: unknown[]): void };
}

// the open workspace changed while a dialog was up (from the renderer, or another command)
class WorkspaceSwitchedError extends Error {
  constructor() {
    super('The workspace was closed or switched before the command could run.');
    this.name = 'WorkspaceSwitchedError';
  }
}

export function createMenuActions(deps: MenuActionDeps): MenuActions {
  const { devBrain, logger } = deps;

  const showMessage = async (options: MessageBoxOptions) => {
    const window = deps.window();
    await (window
      ? deps.dialog.showMessageBox(window, options)
      : deps.dialog.showMessageBox(options));
  };

  // Runs a command, showing its failure: core's message for a core error, else a generic one,
  // with only the error's class logged, as listeners do.
  const guard = (name: string, command: () => Promise<void>) => async (): Promise<void> => {
    try {
      await command();
    } catch (error) {
      const errorName = error instanceof Error ? error.name : typeof error;
      logger.warn(`Menu command ${name} failed error=${errorName}`);
      const detail =
        error instanceof CoreError || error instanceof WorkspaceSwitchedError
          ? error.message
          : 'Something went wrong. The log file has the details.';
      await showMessage({ type: 'error', message: 'The command failed', detail }).catch(
        () => undefined,
      );
    }
  };

  const desktop = () => deps.desktop(deps.window());

  // tells the window what an import or export did, in the workspace it ran in
  const report = (workspace: Workspace, transfer: TransferReport) =>
    deps.send(deps.window(), 'transfer.completed', {
      workspaceId: workspace.info.id,
      report: transfer,
    });

  const currentWorkspace = (): Workspace => {
    const workspace = devBrain?.currentWorkspace;
    if (!workspace) throw new WorkspaceSwitchedError();
    return workspace;
  };

  // the workspace a command started on, once its dialog has closed (as transferRouter's stillOpen)
  const stillOpen = (workspace: Workspace): Workspace => {
    if (devBrain?.currentWorkspace !== workspace) throw new WorkspaceSwitchedError();
    return workspace;
  };

  return {
    runCommand: (command) => {
      const workspace = devBrain?.currentWorkspace;
      if (!workspace) return;
      deps.send(deps.window(), 'app.command', { command, workspaceId: workspace.info.id });
    },

    // asks for a folder, adds it as a workspace, and opens it, remembering it as the last one
    // (as the workspaces.importFolder and workspaces.open routes do in turn)
    openWorkspaceFolder: guard('openWorkspaceFolder', async () => {
      if (!devBrain) return;
      const folder = await desktop().chooseFolder({
        title: 'Open Workspace Folder',
        buttonLabel: 'Open',
      });
      if (folder === null) return;
      const entry = await devBrain.workspaces.import(folder);
      await devBrain.workspaces.open(entry.id);
      devBrain.settings.set('state.lastWorkspaceId', entry.id);
    }),

    // every enabled source, with the reconcile pass; how each ended shows in the sync status
    syncNow: guard('syncNow', () => currentWorkspace().sync.syncNow()),

    showWorkspaceFolder: guard('showWorkspaceFolder', () =>
      desktop().openFolder(currentWorkspace().info.path),
    ),

    showDevBrainFolder: guard('showDevBrainFolder', async () => {
      if (devBrain) await desktop().openFolder(devBrain.path);
    }),

    importTasks: guard('importTasks', async () => {
      const workspace = currentWorkspace();
      const files = await desktop().chooseFiles({
        title: 'Import tasks',
        filters: [{ name: 'Tasks (CSV or JSON)', extensions: ['csv', 'json'] }],
      });
      if (files === null) return;
      const summary = await stillOpen(workspace).transfer.importTasksFromFile(files[0]);
      report(workspace, { type: 'tasksImported', summary });
    }),

    importNotes: guard('importNotes', async () => {
      const workspace = currentWorkspace();
      const files = await desktop().chooseFiles({
        title: 'Import notes',
        filters: [{ name: 'Markdown', extensions: NOTE_EXTENSIONS }],
        multiple: true,
      });
      if (files === null) return;
      const summary = await stillOpen(workspace).transfer.importNotesFromFiles(files);
      report(workspace, { type: 'notesImported', summary });
    }),

    exportTasks: (format) =>
      guard('exportTasks', async () => {
        const workspace = currentWorkspace();
        const filePath = await desktop().chooseSaveFile({
          title: 'Export tasks',
          defaultName: `DevBrain tasks ${toDateString(new Date())}.${format}`,
          filters: [{ name: format.toUpperCase(), extensions: [format] }],
        });
        if (filePath === null) return;
        const result = await stillOpen(workspace).transfer.exportTasksToFile(filePath, format);
        desktop().rememberExport(result.path);
        report(workspace, {
          type: 'tasksExported',
          name: path.basename(result.path),
          format: result.format,
          count: result.count,
        });
      })(),

    exportNotes: guard('exportNotes', async () => {
      const workspace = currentWorkspace();
      const dir = await desktop().chooseFolder({
        title: 'Export notes',
        buttonLabel: 'Export here',
      });
      if (dir === null) return;
      const result = await stillOpen(workspace).transfer.exportNotesToFolder(dir);
      desktop().rememberExport(result.path);
      report(workspace, {
        type: 'notesExported',
        name: path.basename(result.path),
        count: result.count,
        errors: result.errors.length,
      });
    }),

    showLogFile: () => deps.showItemInFolder(deps.logFilePath()),
  };
}

// --- Installing -----------------------------------------------------------

export interface AppMenuDeps {
  setApplicationMenu: (template: MenuItemConstructorOptions[]) => void;
  platform: NodeJS.Platform;
  appName: string;
  isPackaged: boolean;
  devBrain: Pick<DevBrain, 'currentWorkspace' | 'workspaces'> | null;
  actions: MenuActions;
}

/**
 * Sets the app's menu, and sets it again whenever a workspace opens, closes, or the open one is
 * renamed, so its commands are enabled only while one is open. Returns the function that stops
 * following the workspaces.
 */
export function installAppMenu(deps: AppMenuDeps): () => void {
  const { devBrain } = deps;
  const apply = () =>
    deps.setApplicationMenu(
      buildMenuTemplate({
        platform: deps.platform,
        appName: deps.appName,
        isPackaged: deps.isPackaged,
        actions: deps.actions,
        state: {
          devBrainLoaded: devBrain !== null,
          workspaceName: devBrain?.currentWorkspace?.info.name ?? null,
        },
      }),
    );
  apply();
  return devBrain ? devBrain.workspaces.onChange(() => apply()) : () => {};
}
