// The provider-agnostic OAuth contract. A provider opts in by declaring an OAuthConfig; everything
// under oauth/ works from that config alone and names no provider.

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  // revoke is a no-op without one
  revokeUrl?: string;
  clientId: string;
  // only where the provider requires one; a desktop app can't keep it secret anyway
  clientSecret?: string;
  scopes: string[];
  // how scopes are joined in the authorize URL; defaults to ' '
  scopeSeparator?: ' ' | ',';
  redirect: {
    // a fixed list tried in turn, for providers that only accept registered ports, or any free one
    ports: number[] | 'any';
    // e.g. '/callback'
    path: string;
  };
  // added to the authorize URL, e.g. access_type=offline; never replaces a parameter the flow sets
  extraAuthorizeParams?: Record<string, string>;
  // how client credentials reach the token and revoke endpoints; defaults to 'body'
  clientAuth?: 'body' | 'basic';
  // reads a token response; the default reads the standard fields
  parseTokens?: (json: unknown) => OAuthTokens;
}

export interface OAuthTokens {
  accessToken: string;
  // absent when the provider issued none; refresh keeps the one it was given
  refreshToken?: string;
  // null or absent when the provider gave no lifetime
  expiresAt?: Date | null;
  // what was granted; the requested scopes when the response does not say
  scopes: string[];
}

export interface OAuthClient {
  // runs the browser flow to the end: listener, authorize URL, callback, code exchange
  authorize(config: OAuthConfig, opts: { signal: AbortSignal }): Promise<OAuthTokens>;
  // throws IntegrationAuthError when the grant is rejected
  refresh(config: OAuthConfig, refreshToken: string): Promise<OAuthTokens>;
  revoke(config: OAuthConfig, tokens: OAuthTokens): Promise<void>;
}

// Opens a URL in the system browser. The main process passes shell.openExternal; tests pass one
// that requests the URL and follows the redirect, standing in for the browser.
export type OpenExternal = (url: string) => Promise<void>;
