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

// the provider asked us to slow down; the next attempt must wait until `retryAt`
export class RateLimitError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date, options?: ErrorOptions) {
    super(`Rate limited by the provider until ${retryAt.toISOString()}`, options);
    this.name = 'RateLimitError';
    this.retryAt = retryAt;
  }
}

// a network failure, timeout or provider 5xx; the run ends and backs off
export class ProviderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderUnavailableError';
  }
}
