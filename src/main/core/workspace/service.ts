import { generateId, type IntegrationId, type WorkspaceId } from '@common/ids';
import type { CreateWorkspaceOptions, WorkspaceInfo, WorkspaceOptions } from './types';
import { parseRegistry, REGISTRY_FILE, writeRegistry, type WorkspaceRegistry } from './registry';
import { Workspace } from './workspace';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { directoryExists, isNotFound } from '../local/utils';
import { NotFoundError, WorkspaceDataMissingError, WorkspaceNotOpenError } from '../shared/errors';
import { paginateArray, Page, PageOptions } from '../shared/pagination';
import { ChangeListener, ChangeListeners } from '../shared/changes';

// A workspace was registered, or the open workspace changed. Opening one while another is open
// sends `closed` for the old one before `opened` for the new one, in the order the transitions ran.
export type WorkspaceChange =
  | { type: 'created'; workspace: WorkspaceInfo }
  | { type: 'opened'; workspace: Workspace }
  | { type: 'closed'; workspaceId: WorkspaceId };

// TODO: opening a workspace again after it has been openedn should be as cheap as possible
// if possible, workspaces should be "cached" here

export class WorkspaceService {
  private current: Workspace | null = null;
  private transition: Promise<unknown> = Promise.resolve();
  private workspacesFilePath: string;
  private readonly changes: ChangeListeners<WorkspaceChange>;

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
    private readonly workspaceOptions: WorkspaceOptions,
  ) {
    this.workspacesFilePath = path.join(rootPath, REGISTRY_FILE);
    this.changes = new ChangeListeners('Workspace', { logger: workspaceOptions.logger });
  }

  /**
   * Sends `opened` once a workspace is current and `closed` once the current one has closed, by
   * open, close or delete. Returns a function that unsubscribes the listener.
   */
  onChange(listener: ChangeListener<WorkspaceChange>): () => void {
    return this.changes.add(listener);
  }

  private readWorkspaceFile(): WorkspaceRegistry {
    try {
      return parseRegistry(fsSync.readFileSync(this.workspacesFilePath, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) return {} as WorkspaceRegistry;
      throw error;
    }
  }

  // atomic, and keeps a backup that DevBrain.open restores from (see recoverRegistry)
  private writeWorkspaceFile(registry: WorkspaceRegistry): void {
    writeRegistry(this.rootPath, registry);
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

  /**
   * Registers a new workspace and creates its database, running migrations, then closes it.
   * Creating never opens a workspace: open it to use it. Returns its info.
   */
  async create(options: CreateWorkspaceOptions): Promise<WorkspaceInfo> {
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

    // The database first, then the registry: a workspace is registered only once it can be opened.
    // If any step fails, nothing is registered, and the half-made directory goes too, or
    // recoverRegistry would register it again from the directories it finds.
    try {
      // create workspace db file and run migrations, then close it until it is opened
      const workspace = await Workspace.create(workspaceInfo, this.workspaceOptions);
      await workspace.close();
      const workspaces = this.readWorkspaceFile();
      workspaces[id] = workspaceInfo;
      this.writeWorkspaceFile(workspaces);
    } catch (error) {
      await fs.rm(workspacePath, { recursive: true, force: true });
      throw error;
    }
    this.changes.emit({ type: 'created', workspace: workspaceInfo });
    return workspaceInfo;
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
      integrations = workspace.integrations.list();
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

  /**
   * Returns the open workspace, or, while none is open, opens the one `chooseId` picks: null when it
   * picks none. Queued with the other transitions, so a second call waits for the first and finds
   * its workspace open rather than opening it again. Throws what open throws.
   */
  openIfNoneOpen(chooseId: () => WorkspaceId | null): Promise<Workspace | null> {
    return this.serialize(async () => {
      if (this.current) return this.current;
      const id = chooseId();
      return id === null ? null : this.openWorkspace(id);
    });
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
    } catch (error) {
      await workspace.close();
      throw error;
    }
    this.changes.emit({ type: 'opened', workspace });
    return workspace;
  }

  /**
   * Closes the open workspace, if any, once its sync runs have settled, so nothing writes to its
   * database after this resolves. The app calls it on quit.
   */
  close(): Promise<void> {
    return this.serialize(() => this.closeCurrent());
  }

  // Closes the current workspace, waiting for its sync runs to settle. Sends `closed` even when
  // closing fails: the workspace is no longer current either way.
  private async closeCurrent(): Promise<void> {
    const current = this.currentWorkspace;
    if (!current) return;
    this.current = null;
    try {
      await current.close();
    } finally {
      this.changes.emit({ type: 'closed', workspaceId: current.info.id });
    }
  }
}
