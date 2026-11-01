import { generateId, isId, type IntegrationId, type WorkspaceId } from '@common/ids';
import { hexColorSchema } from '@common/color';
import type {
  CreateWorkspaceOptions,
  UpdateWorkspaceOptions,
  WorkspaceInfo,
  WorkspaceOptions,
} from './types';
import {
  describeWorkspace,
  parseRegistry,
  RECOVERED_COLOR,
  REGISTRY_FILE,
  registryEntry,
  writeRegistry,
  type WorkspaceRegistry,
} from './registry';
import { readManifest, writeManifest, type WorkspaceManifest } from './manifest';
import { Workspace } from './workspace';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { directoryExists, isErrnoException, isNotFound } from '../local/utils';
import {
  FileExistsError,
  InvalidInputError,
  NotFoundError,
  WorkspaceDataMissingError,
  WorkspaceImportError,
  WorkspaceNotOpenError,
} from '../shared/errors';
import { paginateArray, Page, PageOptions } from '../shared/pagination';
import { ChangeListener, ChangeListeners } from '../shared/changes';

// a workspace folder holds its database here
const WORKSPACE_DB_FILE = 'db.sqlite';
// Left behind in a folder by SQLite or by Workspace.open, and never copied by import: the shared
// memory index is rebuilt on open, and the backup is of the other computer's last open. The WAL
// (db.sqlite-wal) is copied, as it can hold committed writes not yet in db.sqlite.
const NOT_IMPORTED = new Set([`${WORKSPACE_DB_FILE}-shm`, `${WORKSPACE_DB_FILE}.backup`]);

// A workspace was registered (created here, or imported from a folder) or renamed/recoloured, or
// the open workspace changed. Opening one while another is open sends `closed` for the old one
// before `opened` for the new one, in the order the transitions ran.
export type WorkspaceChange =
  | { type: 'created'; workspace: WorkspaceInfo }
  | { type: 'imported'; workspace: WorkspaceInfo }
  | { type: 'updated'; workspace: WorkspaceInfo }
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
   * Sends `created` or `imported` once a workspace is registered, `updated` once its new name or
   * colour is in its manifest, `opened` once a workspace is current and `closed` once the current
   * one has closed, by open, close or delete. Returns a function that unsubscribes the listener.
   */
  onChange(listener: ChangeListener<WorkspaceChange>): () => void {
    return this.changes.add(listener);
  }

  // workspaces.json: where each workspace's folder is (registry.ts). Its name and colour are in the
  // folder's manifest; getById and listAll put the two together.
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
    const sorted = this.describeAll().sort(
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
    const entry = this.readWorkspaceFile()[id];
    if (!entry) throw new NotFoundError(id);
    return describeWorkspace(entry);
  }

  getByName(name: string): WorkspaceInfo | null {
    return this.describeAll().find((info) => info.name === name) ?? null;
  }

  // every registered workspace with its manifest's details; reads one small file per workspace
  private describeAll(): WorkspaceInfo[] {
    return Object.values(this.readWorkspaceFile()).map(describeWorkspace);
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
      // the name and colour are kept in the folder, so they travel with it (manifest.ts)
      writeManifest(workspacePath, workspaceInfo);
      const workspaces = this.readWorkspaceFile();
      workspaces[id] = registryEntry(workspaceInfo);
      this.writeWorkspaceFile(workspaces);
    } catch (error) {
      await fs.rm(workspacePath, { recursive: true, force: true });
      throw error;
    }
    this.changes.emit({ type: 'created', workspace: workspaceInfo });
    return workspaceInfo;
  }

  /**
   * Renames or recolours a workspace, open or not, and returns its updated info. The name is
   * trimmed and must not be empty; the colour must be #rrggbb. Any colour is accepted, not only the
   * six the settings screen offers: workspaces created or recovered before keep theirs. When this
   * is the open workspace, its `info` changes too. The two are stored in the workspace's folder
   * (manifest.ts), so a copy taken from now on carries them. Writes nothing and sends nothing when
   * neither value changes.
   *
   * Throws InvalidInputError for an empty name or an invalid colour, NotFoundError for an unknown
   * id, and WorkspaceDataMissingError when the workspace's folder is gone.
   */
  update(id: WorkspaceId, options: UpdateWorkspaceOptions): Promise<WorkspaceInfo> {
    return this.serialize(async () => this.updateWorkspace(id, options));
  }

  private updateWorkspace(id: WorkspaceId, { name, color }: UpdateWorkspaceOptions): WorkspaceInfo {
    const trimmedName = name?.trim();
    if (trimmedName === '') throw new InvalidInputError('A workspace name cannot be empty');
    if (color !== undefined && !hexColorSchema.safeParse(color).success) {
      throw new InvalidInputError(`Not a #rrggbb colour: ${color}`);
    }
    const info = this.getById(id);
    const updated: WorkspaceInfo = {
      ...info,
      name: trimmedName ?? info.name,
      color: color ?? info.color,
    };
    if (updated.name === info.name && updated.color === info.color) return info;

    try {
      writeManifest(updated.path, updated);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      throw new WorkspaceDataMissingError(id, 'Workspace directory not found');
    }
    // an entry from before manifests drops its copy of the details now, rather than at the
    // next start (moveDetailsToManifests)
    const workspaces = this.readWorkspaceFile();
    const entry = workspaces[id];
    if (
      entry &&
      (entry.name !== undefined || entry.color !== undefined || entry.createdAt !== undefined)
    ) {
      workspaces[id] = registryEntry(entry);
      this.writeWorkspaceFile(workspaces);
    }
    if (this.current?.info.id === id) {
      Object.assign(this.current.info, { name: updated.name, color: updated.color });
    }
    this.changes.emit({ type: 'updated', workspace: updated });
    return updated;
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
      workspaces[id] = {
        ...(workspaces[id] ?? registryEntry(workspaceInfo)),
        lastOpenedAt: Date.now(),
      };
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
   * Adds an existing workspace folder to the list, such as one copied or synced from another
   * computer, and returns its info. It is not opened: open it next to use it.
   *
   * The folder is copied into this DevBrain folder (`workspaces/<id>`) and the copy is what gets
   * registered, so the chosen folder is never changed: not migrated, not written to by sync, and
   * not removed by a later delete. A folder already at that place (one dropped into `workspaces/`
   * by hand) is registered where it is.
   *
   * The id, name and colour come from the folder's manifest (manifest.ts); without one the id is
   * the folder's name when that is a workspace id, else a new one, the name is the folder's name
   * and the colour grey. The copy's database is opened once, which migrates an older one (with the
   * usual backup and restore), and integrations whose credentials can't be decrypted here move to
   * needs_reauth. Then the copy gets a manifest and the registry an entry.
   *
   * Throws InvalidInputError for a relative path; WorkspaceImportError for a folder that is not a
   * workspace (`not_a_workspace`), one already in the list by id or by folder (`already_added`),
   * or one that can't be read (`unreadable`); FileExistsError when `workspaces/<id>` is already
   * taken by an unregistered folder; and what opening throws: WorkspaceTooNewError for a database
   * from a newer DevBrain, WorkspaceMigrationError. On any failure nothing is registered and the
   * copy is removed.
   */
  import(folderPath: string): Promise<WorkspaceInfo> {
    return this.serialize(() => this.importFolder(folderPath));
  }

  private async importFolder(folderPath: string): Promise<WorkspaceInfo> {
    if (!path.isAbsolute(folderPath)) {
      throw new InvalidInputError(`The folder path must be absolute: ${folderPath}`);
    }
    const source = await realFolder(folderPath);
    const dbPath = path.join(source, WORKSPACE_DB_FILE);
    await assertReadableFile(dbPath, source);

    let manifest: WorkspaceManifest | null;
    try {
      manifest = readManifest(source);
    } catch (error) {
      throw unreadable(error, source);
    }
    const folderName = path.basename(source);
    const id =
      manifest?.id ?? (isId('workspace', folderName) ? folderName : generateId('workspace'));

    const registry = this.readWorkspaceFile();
    const sameId = registry[id];
    if (sameId) {
      throw new WorkspaceImportError(
        'already_added',
        `This workspace is already in your list as "${describeWorkspace(sameId).name}"`,
        id,
      );
    }
    for (const info of Object.values(registry).map(describeWorkspace)) {
      if ((await realFolder(info.path).catch(() => info.path)) === source) {
        throw new WorkspaceImportError(
          'already_added',
          `This folder is already in your list as "${info.name}"`,
          info.id,
        );
      }
    }

    const workspacesPath = path.join(this.rootPath, 'workspaces');
    const destination = path.join(await realFolder(workspacesPath).catch(() => workspacesPath), id);
    const inPlace = destination === source;
    if (!inPlace) {
      // checked before the copy, so a folder that never was a workspace is never copied
      if (!Workspace.isWorkspaceDatabase(dbPath)) throw notAWorkspace(source);
      if (fsSync.existsSync(destination)) throw new FileExistsError(destination);
    }

    const info: WorkspaceInfo = {
      id,
      name: manifest?.name ?? folderName,
      color: manifest?.color ?? RECOVERED_COLOR,
      path: destination,
      createdAt: manifest?.createdAt ?? Date.now(),
      lastOpenedAt: null,
    };

    try {
      if (!inPlace) await copyWorkspaceFolder(source, destination);
      else if (!Workspace.isWorkspaceDatabase(dbPath)) throw notAWorkspace(source);
      // migrates an older database, and refuses one from a newer DevBrain
      const workspace = await Workspace.open(info, this.workspaceOptions);
      try {
        await workspace.integrations.markUnreadableNeedsReauth();
      } finally {
        await workspace.close();
      }
      writeManifest(destination, info);
      const workspaces = this.readWorkspaceFile();
      workspaces[id] = registryEntry(info);
      this.writeWorkspaceFile(workspaces);
    } catch (error) {
      // only ever the copy this made; a folder registered in place is the user's and stays
      if (!inPlace) await fs.rm(destination, { recursive: true, force: true });
      throw error;
    }
    this.changes.emit({ type: 'imported', workspace: info });
    return info;
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

function notAWorkspace(folder: string): WorkspaceImportError {
  return new WorkspaceImportError(
    'not_a_workspace',
    `${path.basename(folder)} is not a DevBrain workspace folder: it has no workspace database`,
  );
}

// a permission error reading the folder or its files; anything else is thrown as it is
function unreadable(error: unknown, folder: string): unknown {
  if (isErrnoException(error) && (error.code === 'EACCES' || error.code === 'EPERM')) {
    return new WorkspaceImportError(
      'unreadable',
      `DevBrain doesn't have permission to read ${path.basename(folder)}`,
    );
  }
  return error;
}

// The folder's real path, symlinks resolved, so two paths to one folder compare equal. Throws
// WorkspaceImportError for nothing there (`not_a_workspace`), a file, or a folder that can't be
// read (`unreadable`).
async function realFolder(folderPath: string): Promise<string> {
  let real: string;
  try {
    real = await fs.realpath(folderPath);
    if (!(await fs.stat(real)).isDirectory()) throw notAWorkspace(folderPath);
    await fs.access(real, fs.constants.R_OK | fs.constants.X_OK);
  } catch (error) {
    if (isNotFound(error)) {
      throw new WorkspaceImportError('not_a_workspace', `There is no folder at ${folderPath}`);
    }
    throw unreadable(error, folderPath);
  }
  return real;
}

// the folder's database must be a file this process can read
async function assertReadableFile(filePath: string, folder: string): Promise<void> {
  try {
    if (!(await fs.stat(filePath)).isFile()) throw notAWorkspace(folder);
    await fs.access(filePath, fs.constants.R_OK);
  } catch (error) {
    if (isNotFound(error)) throw notAWorkspace(folder);
    throw unreadable(error, folder);
  }
}

// Copies the whole folder (database, WAL, notes) except what NOT_IMPORTED lists. Never overwrites:
// `destination` must not exist yet.
async function copyWorkspaceFolder(source: string, destination: string): Promise<void> {
  try {
    await fs.cp(source, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (from) => path.dirname(from) !== source || !NOT_IMPORTED.has(path.basename(from)),
    });
  } catch (error) {
    throw unreadable(error, source);
  }
}
