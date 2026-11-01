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
import type { TaskFileFormat } from '@main/core/transfer/types';
import type { Desktop } from '../ipc/desktop';

// The app's menu bar: the platform's standard menus, plus DevBrain's own commands. Each command runs
// in main against core, as its IPC route would, and core announces what it changed, so the
// renderer refetches through the ChangeTracker as for any background change. The template is built
// from plain state, so tests can check it without Electron; installAppMenu rebuilds it whenever the
// open workspace changes, which enables or disables the workspace's commands.

// what the menu shows depends on
export interface MenuState {
  // false when DevBrain could not be loaded: every DevBrain command is disabled
  devBrainLoaded: boolean;
  // the open workspace's name, or null when none is open
  workspaceName: string | null;
}

// What each DevBrain command does. None rejects: a failure is shown to the user and logged.
export interface MenuActions {
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

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: 'about' },
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
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
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
    { role: 'editMenu' },
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
  // the window the dialogs are modal to: the focused one when a command runs, or null
  window: () => BrowserWindow | null;
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

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// how many were left out, refused and imported with a warning, as lines under the count
function issueLines(summary: { skipped: unknown[]; errors: unknown[]; warnings: unknown[] }) {
  return [
    summary.skipped.length ? `${summary.skipped.length} skipped (already in the workspace)` : '',
    summary.errors.length ? `${summary.errors.length} could not be imported` : '',
    summary.warnings.length ? `${summary.warnings.length} imported with warnings` : '',
  ].filter(Boolean);
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
      const result = await stillOpen(workspace).transfer.importTasksFromFile(files[0]);
      await showMessage({
        type: result.errors.length ? 'warning' : 'info',
        message: `Imported ${plural(result.created, 'task')}`,
        detail: issueLines(result).join('\n') || undefined,
      });
    }),

    importNotes: guard('importNotes', async () => {
      const workspace = currentWorkspace();
      const files = await desktop().chooseFiles({
        title: 'Import notes',
        filters: [{ name: 'Markdown', extensions: NOTE_EXTENSIONS }],
        multiple: true,
      });
      if (files === null) return;
      const result = await stillOpen(workspace).transfer.importNotesFromFiles(files);
      await showMessage({
        type: result.errors.length ? 'warning' : 'info',
        message: `Imported ${plural(result.created, 'note')}`,
        detail: issueLines(result).join('\n') || undefined,
      });
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
        await showMessage({
          type: 'info',
          message: `Exported ${plural(result.count, 'task')}`,
          detail: result.path,
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
      const left = result.errors.length
        ? `\n${plural(result.errors.length, 'note')} could not be read and were left out`
        : '';
      await showMessage({
        type: result.errors.length ? 'warning' : 'info',
        message: `Exported ${plural(result.count, 'note')}`,
        detail: `${result.path}${left}`,
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
