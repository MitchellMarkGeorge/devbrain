import { AuthType, Provider as ProviderId, SourceType } from '@common/types';
import { Auth } from '../../auth';
import { ExternalAccount, FetchFn, Provider, RequestOptions, TaskSource } from '../provider';
import { LinearClient } from './client';
import { VIEWER_QUERY } from './queries';
import { viewerResponseSchema } from './schema';
import { LinearTaskSource } from './tasks';

export interface LinearProviderOptions {
  fetch: FetchFn;
  now?: () => Date;
}

// Linear as a provider. A Linear-only feature adds its methods here, and reaches them through
// IntegrationService.withProvider(sourceId, Provider.LINEAR, …)
export type LinearProvider = Provider & { tasks: TaskSource };

export function createLinearProvider(options: LinearProviderOptions): LinearProvider {
  const client = new LinearClient(options);
  return {
    id: ProviderId.LINEAR,
    supports: [SourceType.TASKS],
    // OAuth is deferred to feature 16c
    authMethods: [AuthType.API_KEY],
    getAccount: (auth, options) => getAccount(client, auth, options),
    tasks: new LinearTaskSource(client),
  };
}

// an API key belongs to one Linear workspace and a person can be in several, so the account id
// pairs the organisation with the user
export async function getAccount(
  client: LinearClient,
  auth: Auth,
  options: RequestOptions = {},
): Promise<ExternalAccount> {
  const { viewer } = await client.request(auth, VIEWER_QUERY, {}, viewerResponseSchema, options);
  return {
    accountId: `${viewer.organization.id}:${viewer.id}`,
    label: `${viewer.name}, ${viewer.organization.name}`,
    userId: viewer.id,
  };
}
