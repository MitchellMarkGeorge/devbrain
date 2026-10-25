import { generateId, type IntegrationId, type WorkspaceId } from '@common/ids';
import type { CreateWorkspaceOptions, WorkspaceInfo, WorkspaceOptions } from './types';
import { workspaceRegistrySchema } from './schema';
import { Workspace } from './workspace';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { directoryExists, isNotFound } from '../local/utils';
import { NotFoundError, WorkspaceDataMissingError, WorkspaceNotOpenError } from '../shared/errors';
import { paginateArray, Page, PageOptions } from '../shared/pagination';

// TODO: opening a workspace again after it has been openedn should be as cheap as possible
// if possible, workspaces should be "cached" here

export class WorkspaceService {
  private current: Workspace | null = null;
  private transition: Promise<unknown> = Promise.resolve();
  private workspacesFilePath: string;

  get currentWorkspace(): Workspace | null {
    return this.current;
  }

  // Only lifecycle transitions queue. A rejected transition must not poison later calls.
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.transition.then(action);
    this.transition = result.catch(() => {});
    return result;
  }

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

  /**
   * Deletes the open workspace: disconnects its integrations, which revokes their grants at the
   * providers and needs the database open, then closes it and removes its directory and registry
   * entry. Throws NotFoundError for an unknown id, and WorkspaceNotOpenError for a workspace that
   * isn't the open one: open it first.
   */
  delete(id: WorkspaceId): Promise<void> {
    return this.serialize(() => this.deleteWorkspace(id));
  }

  private async deleteWorkspace(id: WorkspaceId): Promise<void> {
    // throws NotFoundError when the id is not in the registry
    const workspaceInfo = this.getById(id);
    const workspace = this.currentWorkspace;
    if (workspace === null || workspace.info.id !== id) throw new WorkspaceNotOpenError(id);

    // throw error if there is no workspace directory to delete
    if (!(await directoryExists(workspaceInfo.path))) {
      throw new WorkspaceDataMissingError(id, 'Workspace directory not found');
    }

    // disconnect its integrations while its database is open, then close it
    await this.disconnectAll(workspace);
    await this.closeCurrent();

    // delete worksapce directory and all its conents (db file and notes)
    await fs.rm(workspaceInfo.path, { recursive: true, force: true });

    const workspaces = this.readWorkspaceFile();

    // remove workspace from workspaces file
    delete workspaces[id];
    this.writeWorkspaceFile(workspaces);
  }

  /**
   * Disconnects every integration of a workspace about to be deleted, so each revokes its grant at
   * its provider. Keeping local copies is the least work, as the database goes next anyway. Best
   * effort: an integration that fails to disconnect does not stop the delete.
   */
  private async disconnectAll(workspace: Workspace): Promise<void> {
    let integrations: { id: IntegrationId }[];
    try {
      integrations = await workspace.integrations.list();
    } catch {
      return;
    }
    for (const { id } of integrations) {
      try {
        await workspace.integrations.disconnect(id, { keepLocalCopies: true });
      } catch {
        // the delete goes ahead
      }
    }
  }

  open(id: WorkspaceId): Promise<Workspace> {
    return this.serialize(() => this.openWorkspace(id));
  }

  private async openWorkspace(id: WorkspaceId): Promise<Workspace> {
    // 1. get info from the registry (throws NotFoundError when absent)
    const workspaceInfo = this.getById(id);

    // 2. make sure the workspace directory exists
    if (!(await directoryExists(workspaceInfo.path))) {
      throw new WorkspaceDataMissingError(id, 'No workspace data found');
    }

    // 3. close the workspace open now, if any: only one syncs at a time, and its runs settle first
    await this.closeCurrent();

    // 4. open/initalize the workspace object
    const workspace = await Workspace.open(workspaceInfo, this.workspaceOptions);

    try {
      const workspaces = this.readWorkspaceFile();
      workspaces[id] = { ...workspaceInfo, lastOpenedAt: Date.now() };
      this.writeWorkspaceFile(workspaces);
      workspace.sync.start();
      this.current = workspace;
      return workspace;
    } catch (error) {
      await workspace.close();
      throw error;
    }
  }

  async switch(id: WorkspaceId): Promise<Workspace> {
    // open closes the current workspace first
    return this.open(id);
  }

  /**
   * Closes the open workspace, if any, once its sync runs have settled, so nothing writes to its
   * database after this resolves. The app calls it on quit.
   */
  close(): Promise<void> {
    return this.serialize(() => this.closeCurrent());
  }

  // closes the current workspace, waiting for its sync runs to settle
  private async closeCurrent(): Promise<void> {
    const current = this.currentWorkspace;
    if (!current) return;
    this.current = null;
    await current.close();
  }
}
