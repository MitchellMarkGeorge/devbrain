import { EntityType, Id, IntegrationId, TaskId, WorkspaceId } from '@common/ids';
import type { CoreErrorCode } from '@common/errors';
import type { Provider } from '@common/integrations';

export type { CoreErrorCode };

// the base of every error class in core; a new one extends this and adds its code to CoreErrorCode
// (src/common/errors.ts)
export abstract class CoreError extends Error {
  abstract readonly code: CoreErrorCode;
}

export class NotFoundError<T extends EntityType> extends CoreError {
  readonly code = 'not_found';
  constructor(id: Id<T>) {
    super(`No entity found with id: ${id}`);
    this.name = 'NotFoundError';
  }
}

// arguments that can never be valid, whatever is stored: a task or note linked to both an event and
// a note or task, an event that ends before it starts, an empty API key. Nothing was changed
export class InvalidInputError extends CoreError {
  readonly code = 'invalid_input';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

export type TaskHierarchyReason =
  // a subtask of a task without a due date was given none
  | 'due_date_required'
  // a local subtask's project and links come from its parent
  | 'inherits_context'
  // promoting a task that has no parent
  | 'not_subtask'
  // demoting a task under itself or under one of its own subtasks
  | 'cycle';

// a change the task tree does not allow; nothing was changed
export class TaskHierarchyError extends CoreError {
  readonly code = 'task_hierarchy';
  readonly taskId: TaskId;
  readonly reason: TaskHierarchyReason;

  constructor(taskId: TaskId, reason: TaskHierarchyReason, message: string) {
    super(message);
    this.name = 'TaskHierarchyError';
    this.taskId = taskId;
    this.reason = reason;
  }
}

export class AlreadyArchivedError<T extends EntityType> extends CoreError {
  readonly code = 'already_archived';
  constructor(id: Id<T>) {
    super(`Entity is already archived: ${id}`);
    this.name = 'AlreadyArchivedError';
  }
}

export class NotArchivedError<T extends EntityType> extends CoreError {
  readonly code = 'not_archived';
  constructor(id: Id<T>) {
    super(`Entity is not archived: ${id}`);
    this.name = 'NotArchivedError';
  }
}

// a mutation on a row an integration owns (its link is `synced`), or on an event of a synced
// calendar; detach the row first
export class ExternalReadOnlyError<T extends EntityType> extends CoreError {
  readonly code = 'external_read_only';
  constructor(id: Id<T>) {
    super(`Entity is synced from an integration and is read-only: ${id}`);
    this.name = 'ExternalReadOnlyError';
  }
}

// a task can't be detached or reattached: it is local, already in that state, its integration is
// gone or off, or its issue no longer resolves. Whatever was asked changed nothing
export class DetachError extends CoreError {
  readonly code = 'detach_failed';
  readonly taskId: TaskId;

  constructor(taskId: TaskId, message: string) {
    super(message);
    this.name = 'DetachError';
    this.taskId = taskId;
  }
}

// credentials rejected, a token refresh failed, or encryption is unavailable at connect
export class IntegrationAuthError extends CoreError {
  readonly code = 'integration_auth';
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IntegrationAuthError';
  }
}

// a connect for an account this workspace already holds; reconnect the existing integration instead
export class IntegrationAlreadyConnectedError extends CoreError {
  readonly code = 'integration_already_connected';
  readonly integrationId: IntegrationId;

  constructor(provider: Provider, accountLabel: string, integrationId: IntegrationId) {
    super(`${accountLabel} is already connected to ${provider} in this workspace`);
    this.name = 'IntegrationAlreadyConnectedError';
    this.integrationId = integrationId;
  }
}

// a second connect while an OAuth flow is still waiting on the browser; cancel the first one
export class ConnectInProgressError extends CoreError {
  readonly code = 'connect_in_progress';
  constructor() {
    super('Another connection is already in progress in this workspace');
    this.name = 'ConnectInProgressError';
  }
}

// an OAuth connect or reconnect cancelled through cancelConnect while it waited on the browser;
// nothing was stored
export class ConnectCancelledError extends CoreError {
  readonly code = 'cancelled';
  constructor() {
    super('The sign-in was cancelled');
    this.name = 'ConnectCancelledError';
  }
}

// a reconnect whose credentials belong to another account than the integration's; nothing changed
export class IntegrationAccountMismatchError extends CoreError {
  readonly code = 'integration_account_mismatch';
  readonly integrationId: IntegrationId;

  constructor(integrationId: IntegrationId, accountLabel: string, otherLabel: string) {
    super(
      `These credentials are for ${otherLabel}, not ${accountLabel}. Connect that account separately`,
    );
    this.name = 'IntegrationAccountMismatchError';
    this.integrationId = integrationId;
  }
}

// switching on a source of a disabled integration; enable the integration instead
export class IntegrationDisabledError extends CoreError {
  readonly code = 'integration_disabled';
  readonly integrationId: IntegrationId;

  constructor(integrationId: IntegrationId) {
    super(`Integration is disabled, so its sources can't be switched on: ${integrationId}`);
    this.name = 'IntegrationDisabledError';
    this.integrationId = integrationId;
  }
}

// the provider can't do what was asked: connect with that auth method, or serve that source type
export class UnsupportedByProviderError extends CoreError {
  readonly code = 'unsupported_by_provider';
  readonly provider: Provider;

  constructor(provider: Provider, message: string) {
    super(message);
    this.name = 'UnsupportedByProviderError';
    this.provider = provider;
  }
}

// an OAuth sign-in can't start here: no OAuth client or browser was configured, or no redirect port
// is free. Nothing was changed
export class OAuthUnavailableError extends CoreError {
  readonly code = 'oauth_unavailable';
  constructor(message: string) {
    super(message);
    this.name = 'OAuthUnavailableError';
  }
}

// the provider asked us to slow down; the next attempt must wait until `retryAt`
export class RateLimitError extends CoreError {
  readonly code = 'rate_limited';
  readonly retryAt: Date;

  constructor(retryAt: Date, options?: ErrorOptions) {
    super(`Rate limited by the provider until ${retryAt.toISOString()}`, options);
    this.name = 'RateLimitError';
    this.retryAt = retryAt;
  }
}

// a sync run hit MAX_PAGES_PER_RUN without the provider saying it was done; the pages pulled so far
// stay committed, and the run fails and backs off like any other failure
export class SyncPageLimitError extends CoreError {
  readonly code = 'sync_page_limit';
  constructor(maxPages: number) {
    super(`The provider did not finish within ${maxPages} pages`);
    this.name = 'SyncPageLimitError';
  }
}

// a network failure, timeout or provider 5xx; the run ends and backs off
export class ProviderUnavailableError extends CoreError {
  readonly code = 'provider_unavailable';
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderUnavailableError';
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

// the DevBrain folder can't be opened: there is none (`missing`), and creating one was not asked
// for, or what is there is not a DevBrain folder (`invalid`). Nothing at the path was changed
export class DevBrainFolderError extends CoreError {
  readonly code = 'devbrain_folder';
  readonly reason: 'missing' | 'invalid';

  constructor(reason: 'missing' | 'invalid', message: string) {
    super(message);
    this.name = 'DevBrainFolderError';
    this.reason = reason;
  }
}

// creating a file that is already there, such as a settings.json that appeared while a DevBrain
// folder was being created; the existing file was left as it was
export class FileExistsError extends CoreError {
  readonly code = 'file_exists';
  readonly path: string;

  constructor(path: string) {
    super(`A file already exists at ${path}`);
    this.name = 'FileExistsError';
    this.path = path;
  }
}

// deleting a workspace that is not the open one; deleting disconnects its integrations, which
// needs its database open, so open it first
export class WorkspaceNotOpenError extends CoreError {
  readonly code = 'workspace_not_open';
  readonly workspaceId: WorkspaceId;

  constructor(workspaceId: WorkspaceId) {
    super(`Workspace ${workspaceId} must be open to be deleted`);
    this.name = 'WorkspaceNotOpenError';
    this.workspaceId = workspaceId;
  }
}

// a workspace in the registry whose directory or database is gone from disk, so it can't be opened
// or deleted through the usual path
export class WorkspaceDataMissingError extends CoreError {
  readonly code = 'workspace_data_missing';
  readonly workspaceId: WorkspaceId;

  constructor(workspaceId: WorkspaceId, message: string) {
    super(message);
    this.name = 'WorkspaceDataMissingError';
    this.workspaceId = workspaceId;
  }
}

// A call was cancelled by workspace shutdown, or attempted after closing began.
export class WorkspaceClosedError extends CoreError {
  readonly code = 'workspace_closed';
  constructor() {
    super('The workspace was closed');
    this.name = 'WorkspaceClosedError';
  }
}

/** a workspace's database could not be brought up to date, so the workspace was not opened */
export class WorkspaceMigrationError extends CoreError {
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

// A workspace database migrated by a newer DevBrain than this one: it holds migrations this app
// doesn't know, so its schema may not be one this app can read or write. Nothing was changed; update
// DevBrain to open it
export class WorkspaceTooNewError extends CoreError {
  readonly code = 'workspace_too_new';
  constructor() {
    super(
      'This workspace was last used by a newer version of DevBrain. Update DevBrain to open it',
    );
    this.name = 'WorkspaceTooNewError';
  }
}

export type WorkspaceImportReason =
  // no folder there, or one without a workspace database (db.sqlite) that DevBrain made
  | 'not_a_workspace'
  // a workspace with the same id, or the same folder, is already in the list
  | 'already_added'
  // the folder or its files can't be read
  | 'unreadable';

// A folder that can't be added to the workspace list (WorkspaceService.import). Nothing was
// registered, and the folder chosen was left as it was
export class WorkspaceImportError extends CoreError {
  readonly code = 'workspace_import';
  readonly reason: WorkspaceImportReason;
  // the workspace already in the list, for `already_added`
  readonly workspaceId: WorkspaceId | null;

  constructor(
    reason: WorkspaceImportReason,
    message: string,
    workspaceId: WorkspaceId | null = null,
  ) {
    super(message);
    this.name = 'WorkspaceImportError';
    this.reason = reason;
    this.workspaceId = workspaceId;
  }
}

// A URL that may not be opened: not http or https, or not one that safeExternalUrl accepts. Nothing
// was opened. The URL is kept off the message, as it can carry a token
export class UnsafeUrlError extends CoreError {
  readonly code = 'unsafe_url';
  constructor() {
    super('Only http and https links can be opened');
    this.name = 'UnsafeUrlError';
  }
}

export type ImportFileReason =
  // over the size or count limit for its kind (see core/transfer/limits.ts)
  | 'too_large'
  // not a regular file, or it could not be read
  | 'unreadable'
  // not UTF-8 text
  | 'not_text'
  // not a kind of file this import takes, by its extension
  | 'unsupported_type'
  // a CSV without a title column, JSON that does not parse or is not a task list, a newer format
  | 'malformed';

// An import file DevBrain can't read as a whole; nothing was imported from it. A bad row or a bad
// note among good ones is reported in the import's summary instead. The message names the file by
// its base name only.
export class ImportFileError extends CoreError {
  readonly code = 'import_file';
  readonly reason: ImportFileReason;
  readonly fileName: string;

  constructor(reason: ImportFileReason, fileName: string, message: string) {
    super(message);
    this.name = 'ImportFileError';
    this.reason = reason;
    this.fileName = fileName;
  }
}
