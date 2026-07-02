import { SettingsService } from './settings/service';
import { WorkspaceService } from './workspace/service';

export class DevBrain {
  readonly settings: SettingsService;
  readonly workspaces: WorkspaceService;
  // currentWorkspace: Workspace | null = null;

  constructor(rootPath: string) {
    this.settings = new SettingsService(rootPath);
    this.workspaces = new WorkspaceService(rootPath);
  }

  public get currentWorkspace() {
    return this.workspaces.currentWorkspace;
  }
}
