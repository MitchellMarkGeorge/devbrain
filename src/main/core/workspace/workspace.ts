import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { ArchiveChange, ArchiveService } from '../archive/service';
import { EventService } from '../events/service';
import { FavoritesService } from '../favorites/service';
import { RecentsService } from '../recents/service';
import { CalendarService } from '../calendars/service';
import { NoteService } from '../notes/service';
import { ProjectService } from '../projects/service';
import { SearchService } from '../search/service';
import { TaskService } from '../tasks/service';
import { TransferService } from '../transfer/service';
import { FALLBACK_TASK_DEFAULTS } from '../tasks/defaults';
import { DetachService } from '../integrations/detach';
import { IntegrationService } from '../integrations/service';
import { createIntegrationServices } from '../integrations/setup';
import { SyncEngine } from '../sync/engine';
import { SyncScheduler } from '../sync/scheduler';
import { EVENT_HISTORY_WINDOW_MS, MAX_PAGES_PER_RUN } from '../sync/constants';
import { SyncStateManager, syncSkipReason } from '../sync/sync-state';
import { SyncWriter } from '../sync/writer';
import { TaskReconciler } from '../sync/task-reconciler';
import type { WorkspaceInfo, WorkspaceOptions } from './types';
import type { CalendarId } from '@common/ids';
import type { CredentialStore } from '../integrations/credential-store';
import type { ProviderRegistry } from '../integrations/providers/registry';
import path from 'node:path';
import fs from 'node:fs/promises';
import { isDevBrainDatabase, runMigrations } from '@main/db/migrate';
import { fileExists } from '../local/utils';
import {
  IntegrationAuthError,
  RateLimitError,
  WorkspaceClosedError,
  WorkspaceDataMissingError,
  WorkspaceMigrationError,
} from '../shared/errors';
import { errorClass } from '../shared/logger';
import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { calendars } from '@main/db/schema/calendars';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { guardOpenExternal } from '../shared/untrusted';

type SqliteDatabaseClient = Database.Database;

// the link opener when the caller passes no browser, as tests do; the app always passes one
const noBrowser = async () => {
  throw new Error('No browser is configured to open links');
};

// SQLite's answer for a file that is not a database, or one too damaged to read
function isNotADatabase(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT';
}

export class Workspace {
  private readonly closing = new AbortController();
  private closePromise: Promise<void> | null = null;
  readonly notes: NoteService;
  readonly tasks: TaskService;
  readonly projects: ProjectService;
  readonly events: EventService;
  readonly calendars: CalendarService;
  readonly archive: ArchiveService;
  readonly favorites: FavoritesService;
  readonly recents: RecentsService;
  readonly search: SearchService;
  // importing tasks and notes from files, and exporting them (docs/import-export.md)
  readonly transfer: TransferService;
  readonly integrations: IntegrationService;
  // detachTask and reattachTask for external tasks, and onChange
  readonly detach: DetachService;
  // syncNow, getStatus and onProgress for the app; trigger for focus and resume. Started by
  // WorkspaceService.open, stopped by close()
  readonly sync: SyncScheduler;
  // for fetchHistory, which fetches older calendar history outside sync runs
  private readonly syncState: SyncStateManager;
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly writer: SyncWriter;
  /**
   * Opens a link in the system browser: a synced item's provider page, a meeting link, a link in a
   * description. Only http and https URLs are opened; anything else throws UnsafeUrlError and
   * opens nothing (docs/security/untrusted-content.md).
   */
  readonly openUrl: (url: string) => Promise<void>;

  private constructor(
    private readonly db: BetterSQLite3Database,
    private readonly sqliteClient: SqliteDatabaseClient,
    readonly info: WorkspaceInfo,
    options: WorkspaceOptions,
  ) {
    this.notes = new NoteService(db, info.path, options.logger);
    this.tasks = new TaskService(db);
    this.projects = new ProjectService(db);
    // a read of a range before what synced calendars mirror fetches it first
    this.events = new EventService(db, (from, calendarIds) => this.fetchHistory(from, calendarIds));
    this.calendars = new CalendarService(db);
    this.archive = new ArchiveService(db);
    this.favorites = new FavoritesService(db);
    this.recents = new RecentsService(db);
    this.search = new SearchService(db, info.path);
    // imports create through the services, so search and the change events follow them
    this.transfer = new TransferService({
      tasks: this.tasks,
      notes: this.notes,
      projects: this.projects,
      taskDefaults: options.taskDefaults ?? (() => FALLBACK_TASK_DEFAULTS),
    });
    // the user's own writes; SyncWriter indexes what sync writes. An archived row stays out of
    // search when it is written; restoring it brings it back. A delete drops every row it removed,
    // in its transaction.
    this.tasks.onChange((change) => {
      if (change.type === 'deleted') this.search.removeFromIndex(change.taskIds);
      // a new row has no entry to replace: inserting alone keeps an import linear
      else if (change.type === 'created') this.search.indexCreatedTask(change.task);
      else if (change.task.archivedAt === null) this.search.indexTask(change.task);
    });
    this.projects.onChange((change) => {
      if (change.type === 'deleted') this.search.removeFromIndex([change.projectId]);
      else if (change.project.archivedAt === null) this.search.indexProject(change.project);
    });
    this.notes.onChange((change) => {
      if (change.type === 'deleted') this.search.removeFromIndex([change.noteId]);
      else if (change.type === 'created') this.search.indexCreatedNote(change.note, change.content);
      else if (change.content === undefined) {
        this.search.updateIndexedTitle(change.note.id, change.note.title);
      } else this.search.indexNoteContent(change.note, change.content);
    });
    this.events.onChange((change) => {
      // SyncWriter indexed a fetch's events as it saved them
      if (change.type === 'history_fetched') return;
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
    const writer = new SyncWriter(db, this.search);
    this.syncState = syncState;
    this.credentials = credentials;
    this.providers = providers;
    this.writer = writer;
    const { logger } = options;
    const engine = new SyncEngine(db, {
      integrations,
      syncState,
      credentials,
      providers,
      writer,
      logger,
    });
    // a reattach writes through SyncWriter, which indexes it, and a detach changes no indexed field;
    // edits to a detached task go through TaskService like any other
    this.detach = new DetachService(
      db,
      new TaskReconciler({ db, syncState, credentials, providers, writer, logger }),
    );
    // rejected credentials stop every source of the integration until a reconnect, as in a run
    this.detach.onChange((change) => {
      if (change.type !== 'credentials_rejected') return;
      integrations.markNeedsReauth(change.integrationId);
    });
    this.sync = new SyncScheduler({ engine, integrations, syncState, logger });
    // A synced calendar chosen or dropped syncs its source at once, as a newly switched-on source
    // does: the run gives a selected calendar a full pass and removes a deselected one's events.
    this.calendars.onChange((change) => {
      const { sourceId } = change.calendar;
      if (change.type !== 'selection_changed' || sourceId === null) return;
      void this.sync.trigger('connected', sourceId);
    });
    this.openUrl = guardOpenExternal(options.openExternal ?? noBrowser);
  }

  /**
   * EventService's FetchHistory. Synced calendars are mirrored from EVENT_HISTORY_WINDOW_MS back;
   * this fetches what lies before that for a read that reaches back further. For each selected,
   * visible synced calendar of the read (only those of `calendarIds`, when given) whose events do
   * not reach back to `from` (historyLoadedFrom, else the window), it lists the gap from the
   * provider's calendar source, from `from` up to what the calendar has, and saves each page
   * through SyncWriter as sync does. It does not touch the sync cursor or go through a run, so it
   * never holds up sync or is overwritten by it, and the change token stays the calendar's.
   *
   * Returns the calendars it saved events for. A calendar whose fetch fails is logged and left
   * out, and keeps its historyLoadedFrom, so the next read before it tries again.
   */
  private async fetchHistory(from: Date, calendarIds?: CalendarId[]): Promise<CalendarId[]> {
    const windowFrom = new Date(Date.now() - EVENT_HISTORY_WINDOW_MS);
    if (from >= windowFrom) return [];
    const behind = this.db
      .select()
      .from(calendars)
      .where(
        and(
          isNotNull(calendars.sourceId),
          isNotNull(calendars.externalId),
          eq(calendars.selected, true),
          eq(calendars.visible, true),
          calendarIds ? inArray(calendars.id, calendarIds) : undefined,
          or(isNull(calendars.historyLoadedFrom), gt(calendars.historyLoadedFrom, from)),
        ),
      )
      .all();
    const fetched = await Promise.all(
      behind.map(async (calendar) => {
        try {
          const until = calendar.historyLoadedFrom ?? windowFrom;
          return (await this.fetchCalendarHistory(calendar, from, until)) ? [calendar.id] : [];
        } catch (error) {
          console.error(
            `Fetching calendar history failed calendar=${calendar.id} error=${errorClass(error)}`,
          );
          return [];
        }
      }),
    );
    return fetched.flat();
  }

  /**
   * One calendar's events in [from, until), page by page, then historyLoadedFrom lowered to `from`.
   * Returns whether it saved anything. Skipped, saving nothing, when nothing may ask the provider
   * now (syncSkipReason: the source off, re-authentication needed, a rate limit), or the workspace
   * is closing; stops when the calendar is deselected meanwhile, since its next sync run removes
   * its events. Rejected credentials and rate limits are recorded as a run's are.
   */
  private async fetchCalendarHistory(
    calendar: typeof calendars.$inferSelect,
    from: Date,
    until: Date,
  ): Promise<boolean> {
    const sourceId = calendar.sourceId!;
    const target = this.syncState.getSyncTarget(sourceId);
    const source = this.providers.get(target.provider)?.calendars;
    if (!source || syncSkipReason(target, new Date()) !== null) return false;
    const { signal } = this.closing;
    const range = { from: from.toISOString(), until: until.toISOString() };
    let wrote = false;
    try {
      const auth = await this.credentials.getAuth(target.integrationId);
      let pageToken: string | null = null;
      for (let pages = 0; pages < MAX_PAGES_PER_RUN; pages++) {
        const query = pageToken === null ? range : { ...range, pageToken };
        const page = await source.getEventPage(auth, calendar.externalId!, query, { signal });
        // nothing awaits from here to the write, so neither can change before it
        if (signal.aborted || !this.isSelected(calendar.id)) return wrote;
        const summary = this.writer.applyEventPage(sourceId, calendar.id, {
          // an event the provider gave no zone takes its calendar's, as in a sync run
          events: page.events.map((event) =>
            event.timeZone === null ? { ...event, timeZone: calendar.timeZone } : event,
          ),
          cancelledIds: page.cancelledIds,
          skippedIds: page.skippedIds,
          fullPass: null,
        });
        wrote ||= summary.inserted + summary.updated + summary.removed > 0;
        pageToken = page.nextPageToken;
        if (pageToken === null) {
          // only ever lowered: another read may have fetched further back meanwhile
          this.db
            .update(calendars)
            .set({ historyLoadedFrom: from })
            .where(
              and(
                eq(calendars.id, calendar.id),
                or(isNull(calendars.historyLoadedFrom), gt(calendars.historyLoadedFrom, from)),
              ),
            )
            .run();
          return wrote;
        }
      }
      throw new Error(`Calendar history went past ${MAX_PAGES_PER_RUN} pages`);
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        this.integrations.markNeedsReauth(target.integrationId);
      } else if (error instanceof RateLimitError) {
        // the provider's retry time holds back sync runs and the next fetch alike
        this.syncState.recordSyncOutcome(sourceId, {
          ok: false,
          error: error.message,
          countsAsFailure: false,
          retryAt: error.retryAt,
        });
      }
      throw error;
    }
  }

  private isSelected(calendarId: CalendarId): boolean {
    return (
      this.db
        .select({ selected: calendars.selected })
        .from(calendars)
        .where(eq(calendars.id, calendarId))
        .get()?.selected === true
    );
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
    // a restore has no note content in hand, so notes are read from their files after it commits;
    // close waits for it through search.whenIdle
    if (noteIds.length > 0) {
      this.search
        .indexNoteFiles(noteIds)
        .catch((error) =>
          console.error(`Indexing restored notes failed error=${errorClass(error)}`),
        );
    }
  }

  static async create(info: WorkspaceInfo, options: WorkspaceOptions): Promise<Workspace> {
    // just handles creating the db file (including running migrations)
    const dbPath = path.join(info.path, 'db.sqlite');
    if (await fileExists(dbPath)) {
      throw new Error(`Workspace database already exists at ${dbPath}`);
    }
    const sqlite = new Database(dbPath);
    // a new database has nothing to restore if migrating fails
    return Workspace.initDb(sqlite, info, options, { dbPath, backupPath: null });
  }

  /**
   * Whether the file at `dbPath` is a DevBrain workspace database: SQLite, starting with this app's
   * first migration (isDevBrainDatabase), which another app's database, drizzle or not, doesn't.
   * Opens it only to read that, and closes it again. Throws what opening throws otherwise (a file
   * that can't be read).
   */
  static isWorkspaceDatabase(dbPath: string, migrationsFolder: string): boolean {
    let sqlite: SqliteDatabaseClient;
    try {
      sqlite = new Database(dbPath, { fileMustExist: true });
    } catch (error) {
      if (isNotADatabase(error)) return false;
      throw error;
    }
    try {
      return isDevBrainDatabase(sqlite, migrationsFolder);
    } catch (error) {
      if (isNotADatabase(error)) return false;
      throw error;
    } finally {
      sqlite.close();
    }
  }

  static async open(info: WorkspaceInfo, options: WorkspaceOptions): Promise<Workspace> {
    // handles opening and existing workspace and backing up the exising database
    const dbPath = path.join(info.path, 'db.sqlite');
    if (!(await fileExists(dbPath))) {
      throw new WorkspaceDataMissingError(info.id, `No workspace database found at ${dbPath}`);
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
      runMigrations(sqliteClient, db, options.migrationsPath);
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
   * Cancels integration authentication, then waits for sync runs and for search's index writes
   * waiting on note files, before closing SQLite. Authentication checks cancellation before
   * touching the database again. Ordinary service calls are not tracked or drained. Every caller
   * shares the same close promise.
   */
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing.abort(new WorkspaceClosedError());
      this.closePromise = (async () => {
        await this.sync.stop();
        // index writes waiting on note files, such as a restore's or a rebuild's
        await this.search.whenIdle();
        this.sqliteClient.close();
      })();
    }
    return this.closePromise;
  }
}
