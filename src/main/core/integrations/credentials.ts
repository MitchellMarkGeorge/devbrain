import { AuthType } from './types';

// Credential shapes and the cipher contract. CredentialStore, in ./credential-store, is the only
// code that stores or reads them.

// Encrypts secrets at rest. The main process passes one over Electron's async safeStorage API
// (isAsyncEncryptionAvailable, encryptStringAsync, decryptStringAsync); tests pass a reversible
// fake. Core never imports Electron.
export interface SecretCipher {
  isAvailable(): Promise<boolean>;
  encrypt(plain: string): Promise<Buffer>;
  // shouldReEncrypt: the key was rotated or upgraded, so the plain text should be encrypted again
  decrypt(cipher: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

// Encrypted credentials, ready to write. Only CredentialStore.seal makes one.
export type SealedCredentials = Buffer & { readonly __sealed: true };

export interface ApiKeyCredentials {
  type: AuthType.API_KEY;
  apiKey: string;
}

export interface OAuthCredentials {
  type: AuthType.OAUTH;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null; // null when the provider gave no lifetime; never refreshed early
}

export type Credentials = ApiKeyCredentials | OAuthCredentials;

// what a provider's refresh call returns; a missing refresh token keeps the stored one
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
}

// one per provider, implemented in feature 16. Throws IntegrationAuthError when the grant is
// rejected, so the caller can move the integration to needs_reauth.
export type TokenRefresher = (refreshToken: string) => Promise<RefreshedTokens>;
