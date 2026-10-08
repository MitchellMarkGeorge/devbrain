import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { ArchiveService } from '../archive/service';
import { EventService } from '../events/service';
import { NoteService } from '../notes/service';
import { ProjectService } from '../projects/service';
import { SearchService } from '../search/service';
import { TaskService } from '../tasks/service';
import { CredentialStore } from '../integrations/credential-store';
import { unavailableCipher } from '../integrations/credentials';
import { createProviderRegistry } from '../integrations/providers/registry';
import { IntegrationService } from '../integrations/service';
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
  readonly archive: ArchiveService;
  readonly search: SearchService;
  readonly integrations: IntegrationService;
  // shared with the sync engine (feature 10), which reads auth through the same store
  private readonly credentials: CredentialStore;

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
    this.archive = new ArchiveService(db);
    this.search = new SearchService(db, info.path);
    this.credentials = new CredentialStore(db, { cipher: options.cipher ?? unavailableCipher });
    this.integrations = new IntegrationService(db, {
      credentials: this.credentials,
      providers: options.providers ?? createProviderRegistry({ fetch: options.fetch ?? fetch }),
    });
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
    // keeping them off for now as I implement the services
    // sqlite.pragma('journal_mode = WAL');
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
      // with the connection closed and no WAL, the database is this one file; once WAL is on, the
      // -wal and -shm files beside it must be removed too
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

  close() {
    this.sqliteClient.close();
  }
}
