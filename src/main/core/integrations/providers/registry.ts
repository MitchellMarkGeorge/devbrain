import { Provider as ProviderId } from '../types';
import { FetchFn, Provider } from './provider';
import { createLinearProvider } from './linear';

// Provider id to implementation. IntegrationService and the sync engine look providers up here
// instead of importing them, so tests can register a fake.
export type ProviderRegistry = ReadonlyMap<ProviderId, Provider>;

export interface ProviderRegistryOptions {
  fetch: FetchFn;
}

// the providers the app ships; Google Calendar joins in feature 16
export function createProviderRegistry(options: ProviderRegistryOptions): ProviderRegistry {
  const providers: Provider[] = [createLinearProvider({ fetch: options.fetch })];
  return new Map(providers.map((provider) => [provider.id, provider]));
}

export function getProvider(registry: ProviderRegistry, id: ProviderId): Provider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`No provider is registered for ${id}`);
  return provider;
}
