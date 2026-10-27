import { WorkspaceId } from '@common/ids';
import type { SecretCipher } from '../integrations/credentials';
import type { OpenExternal } from '../integrations/oauth/types';
import type { FetchFn } from '../integrations/providers/provider';
import type { ProviderRegistry } from '../integrations/providers/registry';
import type { Logger } from '../shared/logger';

export interface WorkspaceInfo {
  id: WorkspaceId;
  name: string;
  color: string;
  path: string;
  createdAt: number;
  lastOpenedAt: number | null;
}

export interface CreateWorkspaceOptions {
  name: string;
  color: string;
}

// What a workspace needs from outside core. The main process passes the migrations folder,
// safeStorage, net.fetch and shell.openExternal (feature 14); tests pass fakes. All but the
// migrations folder are optional, so callers that never connect anything pass none of them.
export interface WorkspaceOptions {
  // the folder of drizzle migrations run when a workspace's database is created or opened
  migrationsPath: string;
  // defaults to one that is never available, so connecting is refused and nothing is stored
  cipher?: SecretCipher;
  // defaults to the global fetch; only used to build the default provider registry
  fetch?: FetchFn;
  // defaults to the providers the app ships, built over `fetch`
  providers?: ProviderRegistry;
  // Opens the OAuth sign-in page, and links through Workspace.openUrl. Core lets only http and
  // https URLs through to it (docs/security/untrusted-content.md). Defaults to one that refuses,
  // so an OAuth connect fails.
  openExternal?: OpenExternal;
  // where sync logs its runs; defaults to the console
  logger?: Logger;
}
