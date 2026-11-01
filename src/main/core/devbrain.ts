import nodePath from 'node:path';
import { SettingsService } from './settings/service';
import type { OpenSettingsStore } from './settings/store';
import { WorkspaceService } from './workspace/service';
import type { WorkspaceOptions } from './workspace/types';
import { devBrainFolderState, validateDevBrainFolderStructure } from './local/validate';
import { scaffoldDevBrain } from './local/scaffold';
import { recoverRegistry } from './workspace/registry';
import { DevBrainFolderError } from './shared/errors';

export interface OpenDevBrainOptions {
  // the DevBrain folder: settings.json, workspaces.json and the workspaces; must be absolute
  path: string;
  // opens the folder's settings file; the main process passes electron-store
  settingsStore: OpenSettingsStore;
  // creates a DevBrain folder when there is none at `path`, or only an empty directory; without
  // it, a missing folder is refused
  createIfMissing?: boolean;
  // the migrations folder, secret cipher, fetch and provider registry every workspace gets
  workspace: WorkspaceOptions;
}

export class DevBrain {
  readonly settings: SettingsService;
  readonly workspaces: WorkspaceService;
  // The DevBrain folder this was opened on: the data folder. Kept apart from the devBrainPath
  // setting, which the renderer can write, so what main opens in the file manager is never input.
  readonly path: string;

  // through DevBrain.open only, so a DevBrain always sits on a valid folder
  private constructor(
    rootPath: string,
    openSettingsStore: OpenSettingsStore,
    options: WorkspaceOptions,
  ) {
    this.path = rootPath;
    this.settings = new SettingsService(rootPath, openSettingsStore);
    const settings = this.settings;
    this.workspaces = new WorkspaceService(rootPath, {
      ...options,
      // what imports fill missing values from, read when one runs
      taskDefaults: () => {
        const { defaultDueDate, defaultPriority } = settings.get('settings.tasks');
        return { defaultDueDate, defaultPriority };
      },
    });
  }

  /**
   * Opens the DevBrain folder at `path`. Nothing there, or an empty directory, is created as a new
   * folder when `createIfMissing` is set, and refused otherwise (reason `missing`). Anything else
   * must be a valid DevBrain folder (reason `invalid` when not). Never deletes anything, and
   * overwrites only a missing or invalid workspaces.json, restoring it after keeping a copy (see
   * recoverRegistry). Throws DevBrainFolderError.
   */
  static async open({
    path,
    settingsStore,
    createIfMissing = false,
    workspace,
  }: OpenDevBrainOptions): Promise<DevBrain> {
    if (!nodePath.isAbsolute(path)) {
      throw new DevBrainFolderError(
        'invalid',
        `The DevBrain folder path must be absolute: ${path}`,
      );
    }
    const state = await devBrainFolderState(path);
    if (state === 'present') {
      const result = await validateDevBrainFolderStructure(path);
      if (!result.valid) throw new DevBrainFolderError('invalid', result.error);
      // a registry found missing or invalid is restored from its backup or the workspace directories
      await recoverRegistry(path);
    } else if (createIfMissing) {
      await scaffoldDevBrain(path);
    } else {
      throw new DevBrainFolderError('missing', `No DevBrain folder at ${path}`);
    }
    return new DevBrain(path, settingsStore, workspace);
  }

  public get currentWorkspace() {
    return this.workspaces.currentWorkspace;
  }

  // closes the open workspace, waiting for its sync runs to settle; see WorkspaceService.close
  async close(): Promise<void> {
    await this.workspaces.close();
  }
}
