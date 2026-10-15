import { EntityType, Id, IntegrationId, TaskId, WorkspaceId } from '@common/ids';
import type { Provider } from '../integrations/shared-types';

// Every error core throws on purpose, with a stable `code` the IPC layer can serialise and the
// renderer can switch on without parsing messages. Plain data only: this file and the union stay
// free of main-only imports.
export type CoreErrorCode =
  | 'not_found'
  | 'already_archived'
  | 'not_archived'
  | 'external_read_only'
  | 'detach_failed'
  | 'integration_auth'
  | 'integration_already_connected'
  | 'connect_in_progress'
  | 'integration_account_mismatch'
  | 'integration_disabled'
  | 'rate_limited'
  | 'sync_page_limit'
  | 'provider_unavailable'
  | 'provider_api'
  | 'change_token_expired'
  | 'oauth_error'
  | 'oauth_callback_timeout'
  | 'invalid_cursor'
  | 'malformed_note_file'
  | 'devbrain_folder'
  | 'workspace_not_open'
  | 'workspace_closed'
  | 'workspace_migration';

// the base of every error class in core; a new one extends this and adds its code above
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

// a mutation on a row an integration owns (its link is `synced`); detach it first
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

// the workspace was closed, e.g. by a switch or quit, while this was in flight, such as an OAuth
// connect waiting on the browser; it was cancelled and wrote nothing
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
