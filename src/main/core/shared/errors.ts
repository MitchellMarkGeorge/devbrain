import { EntityType, Id, IntegrationId } from '@common/ids';
import type { Provider } from '../integrations/types';

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

// a mutation on a row an integration owns (its link is `synced`); detach it first
export class ExternalReadOnlyError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`Entity is synced from an integration and is read-only: ${id}`);
    this.name = 'ExternalReadOnlyError';
  }
}

// credentials rejected, a token refresh failed, or encryption is unavailable at connect
export class IntegrationAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IntegrationAuthError';
  }
}

// a connect for an account this workspace already holds; reconnect the existing integration instead
export class IntegrationAlreadyConnectedError extends Error {
  readonly integrationId: IntegrationId;

  constructor(provider: Provider, accountLabel: string, integrationId: IntegrationId) {
    super(`${accountLabel} is already connected to ${provider} in this workspace`);
    this.name = 'IntegrationAlreadyConnectedError';
    this.integrationId = integrationId;
  }
}

// switching on a source of a disabled integration; enable the integration instead
export class IntegrationDisabledError extends Error {
  readonly integrationId: IntegrationId;

  constructor(integrationId: IntegrationId) {
    super(`Integration is disabled, so its sources can't be switched on: ${integrationId}`);
    this.name = 'IntegrationDisabledError';
    this.integrationId = integrationId;
  }
}

// the provider asked us to slow down; the next attempt must wait until `retryAt`
export class RateLimitError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date, options?: ErrorOptions) {
    super(`Rate limited by the provider until ${retryAt.toISOString()}`, options);
    this.name = 'RateLimitError';
    this.retryAt = retryAt;
  }
}

// a sync run hit MAX_PAGES_PER_RUN without the provider saying it was done; the pages pulled so far
// stay committed, and the run fails and backs off like any other failure
export class SyncPageLimitError extends Error {
  constructor(maxPages: number) {
    super(`The provider did not finish within ${maxPages} pages`);
    this.name = 'SyncPageLimitError';
  }
}

// a network failure, timeout or provider 5xx; the run ends and backs off
export class ProviderUnavailableError extends Error {
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
