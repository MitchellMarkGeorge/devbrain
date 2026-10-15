import { generateId, type IntegrationId, type WorkspaceId } from '@common/ids';
import type { CreateWorkspaceOptions, WorkspaceInfo, WorkspaceOptions } from './types';
import { workspaceRegistrySchema } from './schema';
import { Workspace } from './workspace';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { directoryExists, isNotFound } from '../local/utils';
import { NotFoundError, WorkspaceNotOpenError } from '../shared/errors';
import { paginateArray, Page, PageOptions } from '../shared/pagination';

// TODO: opening a workspace again after it has been openedn should be as cheap as possible
// if possible, workspaces should be "cached" here

// Open, switch, close and delete run one at a time, in the order they were called: each waits for
// the one before it to settle, failed or not, and sees the state it left. Two opens at once both
// open their workspace, the second closing the first as a switch does, so each caller gets the
// workspace it asked for and only the last stays open. A close during an open waits for it and then
// closes what it opened.
export class WorkspaceService {
  private current: Workspace | null = null;
  // the last lifecycle operation queued; never rejects, so a failed one doesn't block the next
  private lifecycle: Promise<void> = Promise.resolve();
  private workspacesFilePath: string;

  constructor(
    private rootPath: string,
    // handed to every workspace this opens or creates
    private readonly workspaceOptions: WorkspaceOptions = {},
  ) {
    this.workspacesFilePath = path.join(rootPath, 'workspaces.json');
  }

  // The open workspace, syncing; null while none is, including while one is being opened, switched
  // or closed. Only open, switch, close and delete change it.
  get currentWorkspace(): Workspace | null {
    return this.current;
  }

  // runs `operation` once every lifecycle operation queued before it has settled
  private serialise<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(operation);
    this.lifecycle = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
   * isn't the open one: open it first. Waits for an open, switch or close in flight, and is checked
   * against the workspace open once it has settled.
   */
  delete(id: WorkspaceId): Promise<void> {
    return this.serialise(() => this.deleteNow(id));
  }

  private async deleteNow(id: WorkspaceId): Promise<void> {
    // throws NotFoundError when the id is not in the registry
    const workspaceInfo = this.getById(id);
    const workspace = this.current;
    if (workspace === null || workspace.info.id !== id) throw new WorkspaceNotOpenError(id);

    // throw error if there is no workspace directory to delete
    if (!(await directoryExists(workspaceInfo.path))) {
      throw new Error('Workspace directory not found');
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

  /**
   * Opens the workspace and starts syncing it, closing the one open now first. Waits for an open,
   * switch, close or delete in flight; see the class comment for opens that overlap.
   */
  open(id: WorkspaceId): Promise<Workspace> {
    return this.serialise(() => this.openNow(id));
  }

  private async openNow(id: WorkspaceId): Promise<Workspace> {
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
    this.current = workspace;
    workspace.sync.start();
    return workspace;
  }

  switch(id: WorkspaceId): Promise<Workspace> {
    // open closes the current workspace first
    return this.open(id);
  }

  /**
   * Closes the open workspace, if any, once its sync runs have settled, so nothing writes to its
   * database after this resolves. An open in flight finishes first and is then closed, so no
   * workspace is open when this resolves. The app calls it on quit.
   */
  close(): Promise<void> {
    return this.serialise(() => this.closeCurrent());
  }

  // closes the current workspace, waiting for its sync runs to settle; only from a queued operation
  private async closeCurrent(): Promise<void> {
    const current = this.current;
    if (!current) return;
    this.current = null;
    await current.close();
  }
}
