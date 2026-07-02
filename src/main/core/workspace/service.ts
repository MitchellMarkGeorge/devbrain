import { generateId, type WorkspaceId } from '@common/ids';
import type { CreateWorkspaceOptions, WorkspaceInfo } from './types';
import { workspaceRegistrySchema } from './schema';
import { Workspace } from './workspace';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { directoryExists, isNotFound } from '../local/utils';

export class WorkspaceService {
  public currentWorkspace: Workspace | null = null;
  private workspacesFilePath: string;

  constructor(private rootPath: string) {
    this.workspacesFilePath = path.join(rootPath, 'workspaces.json');
  }

  private readWorkspaceFile(): Record<WorkspaceId, WorkspaceInfo> {
    try {
      const rawContent = fsSync.readFileSync(this.workspacesFilePath, 'utf8');
      const parsedContent = JSON.parse(rawContent);
      return workspaceRegistrySchema.parse(parsedContent) as Record<WorkspaceId, WorkspaceInfo>;
    } catch (error) {
      if (isNotFound(error)) return {} as Record<WorkspaceId, WorkspaceInfo>;
      throw error;
    }
  }

  private writeWorkspaceFile(registry: Record<WorkspaceId, WorkspaceInfo>): void {
    fsSync.writeFileSync(this.workspacesFilePath, JSON.stringify(registry, null, 2), 'utf8');
  }

  listAll(): WorkspaceInfo[] {
    return Object.values(this.readWorkspaceFile());
  }

  getById(id: WorkspaceId): WorkspaceInfo | null {
    return this.readWorkspaceFile()[id] ?? null;
  }

  getByName(name: string): WorkspaceInfo | null {
    return this.listAll().find((info) => info.name === name) ?? null;
  }

  async create(options: CreateWorkspaceOptions) {
    const id = generateId('workspace');
    const workspacePath = path.join(this.rootPath, 'workspaces', id);

    // create workspace path with workspace id
    await fs.mkdir(workspacePath, { recursive: true });

    const workspaceInfo: WorkspaceInfo = {
      id,
      name: options.name,
      color: options.color,
      path: workspacePath,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // add new workspace info to workspace file
    const workspaces = this.readWorkspaceFile();
    workspaces[id] = workspaceInfo;
    this.writeWorkspaceFile(workspaces);

    // create workspace db file and run migrations
    return await Workspace.create(workspaceInfo);
  }

  async delete(id: WorkspaceId): Promise<void> {
    let workspaceInfo: WorkspaceInfo | null = null;

    if (this.currentWorkspace?.info.id === id) {
      // close current workspace if it is to be deleted
      this.currentWorkspace.close();
      workspaceInfo = this.currentWorkspace.info;
      this.currentWorkspace = null;
    } else {
      workspaceInfo = this.getById(id);
      if (!workspaceInfo) throw new Error('No workspace matching provided id');
    }

    // throw error if there is no workspace directory to delete
    if (!(await directoryExists(workspaceInfo.path))) {
      throw new Error('Workspace directory not found');
    }

    // delete worksapce directory and all its conents (db file and notes)
    await fs.rm(workspaceInfo.path, { recursive: true, force: true });

    const workspaces = this.readWorkspaceFile();

    // remove workspace from workspaces file
    delete workspaces[id];
    this.writeWorkspaceFile(workspaces);
  }

  async open(id: WorkspaceId): Promise<Workspace> {
    // 1. get info from the registry
    const workspaceInfo = this.getById(id);
    if (!workspaceInfo) throw new Error('No workspace matching provided id');

    // 2. make sure the workspace directory exists
    if (!(await directoryExists(workspaceInfo.path))) {
      throw new Error('No workspace data found');
    }

    // 3. open/initalize the workspace object
    const workspace = await Workspace.open(workspaceInfo);

    // 4. update the `lastOpenedAt` timestamp in the registry
    const workspaces = this.readWorkspaceFile();
    workspaces[id] = { ...workspaceInfo, lastOpenedAt: Date.now() };
    this.writeWorkspaceFile(workspaces);

    // set the current workspace
    this.currentWorkspace = workspace;
    return workspace;
  }

  async switch(id: WorkspaceId): Promise<Workspace> {
    if (this.currentWorkspace) {
      this.currentWorkspace.close();
    }
    return this.open(id);
  }
}
