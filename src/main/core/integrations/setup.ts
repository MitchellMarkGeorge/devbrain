import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { CredentialStore } from './credential-store';
import { SecretCipher, unavailableCipher } from './credentials';
import { FetchFn } from './fetch';
import { createOAuthClient } from './oauth/client';
import { OpenExternal } from './oauth/types';
import {
  createProviderRegistry,
  createTokenRefreshers,
  ProviderRegistry,
} from './providers/registry';
import { IntegrationService } from './service';
import { OAuthUnavailableError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import { guardOpenExternal } from '../shared/untrusted';

// Puts the integration services together for one workspace: the provider registry, the OAuth
// client, CredentialStore with a refresher for every provider that declares OAuth, and
// IntegrationService, which owns the registry and the store from then on. Sync reaches providers
// through the service (getSourceProvider, withSource), so an integration syncs through the provider that connected
// it. Workspace calls this; tests call it to get the same wiring.

export interface IntegrationsSetupOptions {
  // defaults to one that is never available, so connecting is refused and nothing is stored
  cipher?: SecretCipher;
  // defaults to the global fetch
  fetch?: FetchFn;
  // defaults to the providers the app ships, built over `fetch`
  providers?: ProviderRegistry;
  // defaults to one that refuses, so an OAuth connect fails until the main process passes one
  openExternal?: OpenExternal;
  // injected for tests
  callbackTimeoutMs?: number;
  // where the services log a failing listener or revoke; defaults to the console
  logger?: Logger;
}

// The browser opener a workspace gets when the caller passes none; the app passes
// shell.openExternal.
export const unavailableBrowser: OpenExternal = async () => {
  throw new OAuthUnavailableError('No browser is configured to open the sign-in page');
};

export function createIntegrationServices(
  db: BetterSQLite3Database,
  options: IntegrationsSetupOptions = {},
  signal?: AbortSignal,
): { credentials: CredentialStore; integrations: IntegrationService } {
  const fetchFn = options.fetch ?? fetch;
  const providers = options.providers ?? createProviderRegistry({ fetch: fetchFn });
  const oauth = createOAuthClient({
    fetch: fetchFn,
    // only http and https URLs reach the browser
    openExternal: guardOpenExternal(options.openExternal ?? unavailableBrowser),
    callbackTimeoutMs: options.callbackTimeoutMs,
  });

  const credentials = new CredentialStore(db, {
    cipher: options.cipher ?? unavailableCipher,
    refreshers: createTokenRefreshers(providers, oauth),
    logger: options.logger,
  });
  const service = new IntegrationService(db, {
    credentials,
    providers,
    oauth,
    signal,
    logger: options.logger,
  });
  // a rejected refresh only a reconnect can fix
  credentials.onChange((change) => {
    if (change.type === 'refresh_rejected') service.markNeedsReauth(change.integrationId);
  });
  // the store is returned for its whenIdle (a workspace closing waits for a refresh in flight) and
  // for tests; providers are reached through the service
  return { credentials, integrations: service };
}
