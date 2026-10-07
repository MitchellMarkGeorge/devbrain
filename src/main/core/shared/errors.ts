import { EntityType, Id } from '@common/ids';

export class NotFoundError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`No entity found with id: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AlreadyArchivedError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`Entity is already archived: ${id}`);
    this.name = 'AlreadyArchivedError';
  }
}

export class NotArchivedError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`Entity is not archived: ${id}`);
    this.name = 'NotArchivedError';
  }
}

export interface WorkspaceMigrationErrorDetails {
  /** the migrations were committed before the failure was found, so the database was changed */
  committed: boolean;
  /** the database file was replaced with the backup taken when the workspace was opened */
  restoredFromBackup: boolean;
  /** where that backup is, when one was taken */
  backupPath: string | null;
  cause?: unknown;
}

/** a workspace's database could not be brought up to date, so the workspace was not opened */
export class WorkspaceMigrationError extends Error {
  readonly code = 'workspace_migration';
  readonly committed: boolean;
  readonly restoredFromBackup: boolean;
  readonly backupPath: string | null;

  constructor(message: string, details: WorkspaceMigrationErrorDetails) {
    super(message, { cause: details.cause });
    this.name = 'WorkspaceMigrationError';
    this.committed = details.committed;
    this.restoredFromBackup = details.restoredFromBackup;
    this.backupPath = details.backupPath;
  }
}
