import path from 'node:path';

export interface MigrationsPathOptions {
  // app.isPackaged
  isPackaged: boolean;
  // process.resourcesPath: where electron-builder puts the migrations in the packaged app
  resourcesPath: string;
  // the repository, in development
  repoRoot: string;
  // DB_MIGRATIONS_PATH from .env, absolute or relative to the repository; development only
  override?: string;
}

/**
 * The migrations folder every workspace is opened with. electron-builder ships it in the app's
 * resources; in development it is the repository's, which .env may move.
 */
export function migrationsPath(options: MigrationsPathOptions): string {
  if (options.isPackaged) return path.join(options.resourcesPath, 'migrations');
  return path.resolve(options.repoRoot, options.override ?? 'src/main/db/migrations');
}
