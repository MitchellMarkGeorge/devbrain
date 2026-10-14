import nodePath from 'node:path';
import { SettingsService } from './settings/service';
import { WorkspaceService } from './workspace/service';
import type { WorkspaceOptions } from './workspace/types';
import { devBrainFolderState, validateDevBrainFolderStructure } from './local/validate';
import { scaffoldDevBrain } from './local/scaffold';
import { DevBrainFolderError } from './shared/errors';

export interface OpenDevBrainOptions {
  // the DevBrain folder: settings.json, workspaces.json and the workspaces; must be absolute
  path: string;
  // creates a DevBrain folder when there is none at `path`, or only an empty directory; without
  // it, a missing folder is refused
  createIfMissing?: boolean;
  // the secret cipher, fetch and provider registry every workspace gets
  workspace?: WorkspaceOptions;
}

export class DevBrain {
  readonly settings: SettingsService;
  readonly workspaces: WorkspaceService;

  // through DevBrain.open only, so a DevBrain always sits on a valid folder
  private constructor(rootPath: string, options: WorkspaceOptions) {
    this.settings = new SettingsService(rootPath);
    this.workspaces = new WorkspaceService(rootPath, options);
  }

  /**
   * Opens the DevBrain folder at `path`. Nothing there, or an empty directory, is created as a new
   * folder when `createIfMissing` is set, and refused otherwise (reason `missing`). Anything else
   * must be a valid DevBrain folder (reason `invalid` when not). Never deletes or overwrites
   * anything. Throws DevBrainFolderError.
   */
  static async open({
    path,
    createIfMissing = false,
    workspace = {},
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
    } else if (createIfMissing) {
      await scaffoldDevBrain(path);
    } else {
      throw new DevBrainFolderError('missing', `No DevBrain folder at ${path}`);
    }
    return new DevBrain(path, workspace);
  }

  public get currentWorkspace() {
    return this.workspaces.currentWorkspace;
  }

  // closes the open workspace, waiting for its sync runs to settle; see WorkspaceService.close
  async close(): Promise<void> {
    await this.workspaces.close();
  }
}
