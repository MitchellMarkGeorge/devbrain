import { generateId, type WorkspaceId } from '@common/ids';
import type { CreateWorkspaceOptions, WorkspaceInfo, WorkspaceOptions } from './types';
import { workspaceRegistrySchema } from './schema';
import { Workspace } from './workspace';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { directoryExists, isNotFound } from '../local/utils';
import { NotFoundError } from '../shared/errors';
import { paginateArray, Page, PageOptions } from '../shared/pagination';

// TODO: opening a workspace again after it has been openedn should be as cheap as possible
// if possible, workspaces should be "cached" here

export class WorkspaceService {
  // this should absolutely NOT be public. Should be copmputed instead (but still cheap like O(1))
  public currentWorkspace: Workspace | null = null;
  private workspacesFilePath: string;

  constructor(
    private rootPath: string,
    // handed to every workspace this opens or creates
    private readonly workspaceOptions: WorkspaceOptions = {},
  ) {
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

  listAll(page: PageOptions = {}): Page<WorkspaceInfo> {
    const sorted = Object.values(this.readWorkspaceFile()).sort(
      (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return paginateArray(
      sorted,
      'created',
      (w) => w.createdAt,
      (w) => w.id,
      page,
    );
  }

  getById(id: WorkspaceId): WorkspaceInfo {
    const workspaceInfo = this.readWorkspaceFile()[id];
    if (!workspaceInfo) throw new NotFoundError(id);
    return workspaceInfo;
  }

  getByName(name: string): WorkspaceInfo | null {
    return Object.values(this.readWorkspaceFile()).find((info) => info.name === name) ?? null;
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
    return await Workspace.create(workspaceInfo, this.workspaceOptions);
  }

  async delete(id: WorkspaceId): Promise<void> {
    let workspaceInfo: WorkspaceInfo;

    if (this.currentWorkspace?.info.id === id) {
      // close current workspace if it is to be deleted
      workspaceInfo = this.currentWorkspace.info;
      await this.closeCurrent();
    } else {
      // throws NotFoundError when the id is not in the registry
      workspaceInfo = this.getById(id);
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
    // 1. get info from the registry (throws NotFoundError when absent)
    const workspaceInfo = this.getById(id);

    // 2. make sure the workspace directory exists
    if (!(await directoryExists(workspaceInfo.path))) {
      throw new Error('No workspace data found');
    }

    // 3. close the workspace open now, if any: only one syncs at a time, and its runs settle first
    await this.closeCurrent();

    // 4. open/initalize the workspace object
    const workspace = await Workspace.open(workspaceInfo, this.workspaceOptions);

    // 5. update the `lastOpenedAt` timestamp in the registry
    const workspaces = this.readWorkspaceFile();
    workspaces[id] = { ...workspaceInfo, lastOpenedAt: Date.now() };
    this.writeWorkspaceFile(workspaces);

    // set the current workspace, and start syncing it: the open workspace is the one that syncs
    this.currentWorkspace = workspace;
    workspace.sync.start();
    return workspace;
  }

  async switch(id: WorkspaceId): Promise<Workspace> {
    // open closes the current workspace first
    return this.open(id);
  }

  // closes the current workspace, waiting for its sync runs to settle
  private async closeCurrent(): Promise<void> {
    const current = this.currentWorkspace;
    if (!current) return;
    this.currentWorkspace = null;
    await current.close();
  }
}
