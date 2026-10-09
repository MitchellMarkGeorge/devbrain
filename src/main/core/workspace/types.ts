import { WorkspaceId } from '@common/ids';
import type { SecretCipher } from '../integrations/credentials';
import type { OpenExternal } from '../integrations/oauth/types';
import type { FetchFn } from '../integrations/providers/provider';
import type { ProviderRegistry } from '../integrations/providers/registry';

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

// What a workspace needs from outside core. The main process passes safeStorage, net.fetch and
// shell.openExternal (feature 14); tests pass fakes. All optional, so callers that never connect anything pass none.
export interface WorkspaceOptions {
  // defaults to one that is never available, so connecting is refused and nothing is stored
  cipher?: SecretCipher;
  // defaults to the global fetch; only used to build the default provider registry
  fetch?: FetchFn;
  // defaults to the providers the app ships, built over `fetch`
  providers?: ProviderRegistry;
  // opens the OAuth sign-in page; defaults to one that refuses, so an OAuth connect fails
  openExternal?: OpenExternal;
}
