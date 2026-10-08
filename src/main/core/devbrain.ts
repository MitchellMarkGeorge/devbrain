import { SettingsService } from './settings/service';
import { WorkspaceService } from './workspace/service';
import type { WorkspaceOptions } from './workspace/types';

export class DevBrain {
  readonly settings: SettingsService;
  readonly workspaces: WorkspaceService;
  // currentWorkspace: Workspace | null = null;

  // options reach every workspace: the secret cipher, fetch and provider registry core can't make
  constructor(rootPath: string, options: WorkspaceOptions = {}) {
    this.settings = new SettingsService(rootPath);
    this.workspaces = new WorkspaceService(rootPath, options);
  }

  public get currentWorkspace() {
    return this.workspaces.currentWorkspace;
  }
}
