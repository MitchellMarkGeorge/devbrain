import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { ArchiveChange, ArchiveService } from '../archive/service';
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
import { WorkspaceClosedError, WorkspaceMigrationError } from '../shared/errors';
import { inArray } from 'drizzle-orm';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';

type SqliteDatabaseClient = Database.Database;

export class Workspace {
  private readonly closing = new AbortController();
  private closePromise: Promise<void> | null = null;
  // restored notes being indexed from their files; close waits for them before closing SQLite
  private readonly noteIndexing = new Set<Promise<void>>();
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
    // the user's own writes; SyncWriter indexes what sync writes. An archived row stays out of
    // search when it is written; restoring it brings it back.
    this.tasks.onChange(({ task }) => {
      if (task.archivedAt === null) this.search.indexTask(task);
    });
    this.projects.onChange(({ project }) => {
      if (project.archivedAt === null) this.search.indexProject(project);
    });
    this.notes.onChange(({ note, content }) => {
      if (content === undefined) this.search.updateIndexedTitle(note.id, note.title);
      else this.search.indexNoteContent(note, content);
    });
    this.events.onChange((change) => {
      if (change.type === 'deleted') this.search.removeFromIndex(change.eventIds);
      else this.search.indexEvent(change.event);
    });
    // archived rows leave search and restored ones come back, in the archive's transaction
    this.archive.onChange((change) => this.onArchiveChange(change));
    const { credentials, integrations, providers } = createIntegrationServices(
      db,
      options,
      this.closing.signal,
    );
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

  private onArchiveChange({ type, taskIds, projectIds, noteIds }: ArchiveChange): void {
    if (type === 'archived') {
      this.search.removeFromIndex([...taskIds, ...projectIds, ...noteIds]);
      return;
    }
    // sent inside the restore's transaction, on the same connection, so the rows read here are the
    // restored ones
    if (taskIds.length > 0) {
      this.search.indexTasks(this.db.select().from(tasks).where(inArray(tasks.id, taskIds)).all());
    }
    if (projectIds.length > 0) {
      this.search.indexProjects(
        this.db.select().from(projects).where(inArray(projects.id, projectIds)).all(),
      );
    }
    // a restore has no note content in hand, so notes are read from their files after it commits
    if (noteIds.length > 0) {
      const indexing = this.search
        .indexNoteFiles(noteIds)
        .then(() => undefined)
        .catch((error) => console.error('Indexing restored notes failed:', error))
        .finally(() => this.noteIndexing.delete(indexing));
      this.noteIndexing.add(indexing);
    }
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
    try {
      await sqlite.backup(backupPath);
    } catch (error) {
      sqlite.close();
      throw error;
    }
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
    try {
      sqliteClient.pragma('journal_mode = WAL');
      const db = drizzle({ client: sqliteClient, casing: 'snake_case' });
      // leaves foreign keys on once migrations have run
      runMigrations(sqliteClient, db, process.env.DB_MIGRATIONS_PATH);
      return new Workspace(db, sqliteClient, info, options);
    } catch (error) {
      sqliteClient.close();
      if (!(error instanceof WorkspaceMigrationError)) throw error;
      throw await Workspace.recoverFromFailedMigration(error, files);
    }
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
   * Cancels integration authentication and waits for sync runs before closing SQLite.
   * Authentication checks cancellation before touching the database again. Ordinary service
   * calls are not tracked or drained. Every caller shares the same close promise.
   */
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing.abort(new WorkspaceClosedError());
      this.closePromise = (async () => {
        await this.sync.stop();
        await Promise.all(this.noteIndexing);
        this.sqliteClient.close();
      })();
    }
    return this.closePromise;
  }
}
