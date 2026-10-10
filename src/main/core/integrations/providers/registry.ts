import { TokenRefresher } from '../credentials';
import { OAuthClient } from '../oauth/types';
import { AuthType, Provider as ProviderId } from '../types';
import { FetchFn, Provider } from './provider';
import { createGoogleCalendarProvider } from './google-calendar';
import { createLinearProvider } from './linear';

// Provider id to implementation. IntegrationService and the sync engine look providers up here
// instead of importing them, so tests can register a fake.
export type ProviderRegistry = ReadonlyMap<ProviderId, Provider>;

export interface ProviderRegistryOptions {
  fetch: FetchFn;
}

// the providers the app ships
export function createProviderRegistry(options: ProviderRegistryOptions): ProviderRegistry {
  const providers: Provider[] = [
    createLinearProvider({ fetch: options.fetch }),
    createGoogleCalendarProvider({ fetch: options.fetch }),
  ];
  return new Map(providers.map((provider) => [provider.id, provider]));
}

export function getProvider(registry: ProviderRegistry, id: ProviderId): Provider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`No provider is registered for ${id}`);
  return provider;
}

// One refresher per provider that declares OAuth, each the generic refresh over its config, for
// CredentialStore. A provider gets token refresh by declaring an OAuthConfig and nothing else.
export function createTokenRefreshers(
  registry: ProviderRegistry,
  oauth: OAuthClient,
): Partial<Record<ProviderId, TokenRefresher>> {
  const refreshers: Partial<Record<ProviderId, TokenRefresher>> = {};
  for (const provider of registry.values()) {
    const config = provider.oauth;
    if (!config || !provider.authMethods.includes(AuthType.OAUTH)) continue;
    refreshers[provider.id] = (refreshToken) => oauth.refresh(config, refreshToken);
  }
  return refreshers;
}
