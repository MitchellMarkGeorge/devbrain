import { Provider as ProviderId } from '../types';

// OAuth client ids and secrets, keyed by provider. Read from the environment at build time:
// vite/main.config.ts inlines each process.env read below, so a packaged app needs no .env. A
// provider's OAuthConfig takes its client from here. Nothing is hard-coded; an empty id means the
// build had none, and the provider can't connect through OAuth.

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret?: string;
}

// spelled out per provider, as the build replaces only these exact expressions; each variable
// read here is listed in ./oauth-env
const CLIENTS: Partial<Record<ProviderId, () => OAuthClientCredentials>> = {
  [ProviderId.GOOGLE_CALENDAR]: () => ({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
  }),
};

export function oauthClientFor(provider: ProviderId): OAuthClientCredentials | null {
  const client = CLIENTS[provider]?.();
  return client && client.clientId !== '' ? client : null;
}
