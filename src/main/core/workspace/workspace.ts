import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
// import { ArchiveService } from '../archive/service';
// import { EventService } from '../events/service';
// import { NoteService } from '../notes/service';
// import { ProjectService } from '../projects/service';
// import { SearchService } from '../search/service';
// import { TaskService } from '../tasks/service';
import type { WorkspaceInfo } from './types';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileExists } from '../local/utils';
import fs from 'node:fs/promises';

export class Workspace {
  // readonly notes: NoteService;
  // readonly tasks: TaskService;
  // readonly projects: ProjectService;
  // readonly events: EventService;
  // readonly archive: ArchiveService;
  // readonly search: SearchService;

  private constructor(
    private readonly db: BetterSQLite3Database,
    private readonly sqliteClient: Database.Database,
    readonly info: WorkspaceInfo,
  ) {
    // this.notes = new NoteService(db);
    // this.tasks = new TaskService(db);
    // this.projects = new ProjectService(db);
    // this.events = new EventService(db);
    // this.archive = new ArchiveService(db);
    // this.search = new SearchService(db);
  }

  static async create(info: WorkspaceInfo): Promise<Workspace> {
    // just handles creating the db file (including running migrations)
    const dbPath = path.join(info.path, 'db.sqlite');
    if (await fileExists(dbPath)) {
      throw new Error(`Workspace database already exists at ${dbPath}`);
    }
    return Workspace.initDb(dbPath, info);
  }

  static async open(info: WorkspaceInfo): Promise<Workspace> {
    // handles opening and existing workspace and backing up the exising database
    const dbPath = path.join(info.path, 'db.sqlite');
    if (!(await fileExists(dbPath))) {
      throw new Error(`No workspace database found at ${dbPath}`);
    }
    await fs.copyFile(dbPath, `${dbPath}.backup`);
    return Workspace.initDb(dbPath, info);
  }

  private static async initDb(dbPath: string, info: WorkspaceInfo): Promise<Workspace> {
    const sqlite = new Database(dbPath);

    // keeping them off for now as I implement the services
    // sqlite.pragma('journal_mode = WAL');
    // sqlite.pragma('foreign_keys = ON');

    const db = drizzle({ client: sqlite, casing: 'snake_case' });

    const migrationsPath = process.env.DB_MIGRATIONS_PATH;
    migrate(db, { migrationsFolder: migrationsPath });

    return new Workspace(db, sqlite, info);
  }

  close() {
    this.sqliteClient.close();
  }
}
