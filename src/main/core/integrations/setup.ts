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
import { SearchService } from '../search/service';
import { SyncWriter } from '../sync/writer';

// Puts the integration services together for one workspace: the provider registry, the OAuth
// client, CredentialStore with a refresher for every provider that declares OAuth, and
// IntegrationService. Workspace calls this; tests call it to get the same wiring.

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
  // the workspace's search index, which the sync writer keeps up to date; without it, deselecting
  // a calendar is refused
  search?: SearchService;
}

// The browser opener a workspace gets when the caller passes none, until the main process passes
// shell.openExternal (feature 14).
export const unavailableBrowser: OpenExternal = async () => {
  throw new Error('No browser is configured to open the sign-in page');
};

export function createIntegrationServices(
  db: BetterSQLite3Database,
  options: IntegrationsSetupOptions = {},
): { credentials: CredentialStore; integrations: IntegrationService } {
  const fetchFn = options.fetch ?? fetch;
  const providers = options.providers ?? createProviderRegistry({ fetch: fetchFn });
  const oauth = createOAuthClient({
    fetch: fetchFn,
    openExternal: options.openExternal ?? unavailableBrowser,
    callbackTimeoutMs: options.callbackTimeoutMs,
  });

  // the store reports rejected refreshes to the service, which is built after it
  let service: IntegrationService | null = null;
  const credentials = new CredentialStore(db, {
    cipher: options.cipher ?? unavailableCipher,
    refreshers: createTokenRefreshers(providers, oauth),
    onRefreshRejected: (integrationId) => service?.markNeedsReauth(integrationId),
  });
  const writer = options.search ? new SyncWriter(db, options.search) : undefined;
  service = new IntegrationService(db, { credentials, providers, oauth, writer });
  return { credentials, integrations: service };
}
