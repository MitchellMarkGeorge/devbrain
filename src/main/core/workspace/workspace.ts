import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { ArchiveService } from '../archive/service';
import { EventService } from '../events/service';
import { CalendarService } from '../calendars/service';
import { NoteService } from '../notes/service';
import { ProjectService } from '../projects/service';
import { SearchService } from '../search/service';
import { TaskService } from '../tasks/service';
import { IntegrationService } from '../integrations/service';
import { createIntegrationServices } from '../integrations/setup';
import { SyncEngine } from '../sync/engine';
import { SyncScheduler } from '../sync/scheduler';
import { SyncStateManager } from '../sync/sync-state';
import { SyncWriter } from '../sync/writer';
import type { WorkspaceInfo, WorkspaceOptions } from './types';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runMigrations } from '@main/db/migrate';
import { fileExists } from '../local/utils';
import { WorkspaceMigrationError } from '../shared/errors';

type SqliteDatabaseClient = Database.Database;

export class Workspace {
  readonly notes: NoteService;
  readonly tasks: TaskService;
  readonly projects: ProjectService;
  readonly events: EventService;
  readonly calendars: CalendarService;
  readonly archive: ArchiveService;
  readonly search: SearchService;
  readonly integrations: IntegrationService;
  // syncNow, getStatus and onProgress for the app; trigger for focus and resume. Started by
  // WorkspaceService.open, stopped by close()
  readonly sync: SyncScheduler;
  // A note's body is read from its file, so it is indexed after the write returns. Indexing runs one
  // note at a time, in write order, so an older read never lands after a newer one; close() waits
  // for it.
  private noteIndexing: Promise<void> = Promise.resolve();

  private constructor(
    private readonly db: BetterSQLite3Database,
    private readonly sqliteClient: SqliteDatabaseClient,
    readonly info: WorkspaceInfo,
    options: WorkspaceOptions,
  ) {
    this.notes = new NoteService(db, info.path);
    this.tasks = new TaskService(db);
    this.projects = new ProjectService(db);
    this.events = new EventService(db);
    this.calendars = new CalendarService(db);
    this.archive = new ArchiveService(db);
    this.search = new SearchService(db, info.path);
    // the user's own writes; SyncWriter indexes what sync writes
    this.tasks.onChange(({ task }) => this.search.indexTask(task));
    this.projects.onChange(({ project }) => this.search.indexProject(project));
    this.notes.onChange(({ note }) => {
      this.noteIndexing = this.noteIndexing
        .then(() => this.search.indexNote(note))
        .catch((error) => console.error(`Indexing note ${note.id} failed:`, error));
    });
    const { credentials, integrations, providers } = createIntegrationServices(db, options);
    this.integrations = integrations;
    // a disconnect deletes mirrored rows; they leave search in its transaction, all or nothing
    integrations.onChange((change) => {
      if (change.type !== 'disconnected') return;
      const { taskIds, projectIds, eventIds } = change.deleted;
      this.search.removeFromIndex([...taskIds, ...projectIds, ...eventIds]);
    });
    const syncState = new SyncStateManager(db);
    const engine = new SyncEngine(db, {
      integrations,
      syncState,
      credentials,
      providers,
      writer: new SyncWriter(db, this.search),
    });
    this.sync = new SyncScheduler({ engine, integrations, syncState });
  }

  static async create(info: WorkspaceInfo, options: WorkspaceOptions = {}): Promise<Workspace> {
    // just handles creating the db file (including running migrations)
    const dbPath = path.join(info.path, 'db.sqlite');
    if (await fileExists(dbPath)) {
      throw new Error(`Workspace database already exists at ${dbPath}`);
    }
    const sqlite = new Database(dbPath);
    // a new database has nothing to restore if migrating fails
    return Workspace.initDb(sqlite, info, options, { dbPath, backupPath: null });
  }

  static async open(info: WorkspaceInfo, options: WorkspaceOptions = {}): Promise<Workspace> {
    // handles opening and existing workspace and backing up the exising database
    const dbPath = path.join(info.path, 'db.sqlite');
    if (!(await fileExists(dbPath))) {
      throw new Error(`No workspace database found at ${dbPath}`);
    }
    const sqlite = new Database(dbPath);
    // use native backup method
    const backupPath = `${dbPath}.backup`;
    await sqlite.backup(backupPath);
    return Workspace.initDb(sqlite, info, options, { dbPath, backupPath });
  }

  private static async initDb(
    sqliteClient: SqliteDatabaseClient,
    info: WorkspaceInfo,
    options: WorkspaceOptions,
    files: { dbPath: string; backupPath: string | null },
  ): Promise<Workspace> {
    // Before migrating: WAL is stored in the file, so from the second open on migrations run under
    // it anyway, and setting it first makes the first open behave the same. Background sync writes
    // while the app reads; WAL keeps readers from waiting on those writes.
    sqliteClient.pragma('journal_mode = WAL');
    const db = drizzle({ client: sqliteClient, casing: 'snake_case' });

    try {
      // leaves foreign keys on once migrations have run
      runMigrations(sqliteClient, db, process.env.DB_MIGRATIONS_PATH);
    } catch (error) {
      sqliteClient.close();
      if (!(error instanceof WorkspaceMigrationError)) throw error;
      throw await Workspace.recoverFromFailedMigration(error, files);
    }

    return new Workspace(db, sqliteClient, info, options);
  }

  /**
   * A failed migration that was rolled back left the database as it was. One that was committed
   * changed it, so the database is replaced with the backup taken when the workspace was opened.
   * Returns the error to throw: the workspace is never opened after a failed migration.
   */
  private static async recoverFromFailedMigration(
    error: WorkspaceMigrationError,
    { dbPath, backupPath }: { dbPath: string; backupPath: string | null },
  ): Promise<WorkspaceMigrationError> {
    const details = {
      committed: error.committed,
      restoredFromBackup: false,
      backupPath,
      cause: error.cause,
    };
    if (!error.committed || backupPath === null) {
      return new WorkspaceMigrationError(error.message, details);
    }
    try {
      // A WAL left beside the database belongs to the migrated one: replayed onto the backup it
      // would corrupt it. Closing the last connection normally checkpoints and removes both files,
      // so this rarely finds any. They go first, so no step leaves the backup next to a stale WAL.
      await fs.rm(`${dbPath}-wal`, { force: true });
      await fs.rm(`${dbPath}-shm`, { force: true });
      await fs.copyFile(backupPath, dbPath);
    } catch (restoreError) {
      return new WorkspaceMigrationError(
        `${error.message}, and restoring the backup at ${backupPath} failed`,
        { ...details, cause: restoreError },
      );
    }
    return new WorkspaceMigrationError(
      `${error.message}; the database was restored from the backup taken when it was opened`,
      { ...details, restoredFromBackup: true },
    );
  }

  /**
   * Stops syncing, waiting for any run in flight to settle, and waits for notes still being
   * indexed, then closes SQLite, so nothing writes to a closed database. Calling it again does nothing.
   */
  async close(): Promise<void> {
    await this.sync.stop();
    await this.noteIndexing;
    this.sqliteClient.close();
  }
}
