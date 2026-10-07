import { AuthType, Provider as ProviderId, SourceType } from '../../types';
import { Auth } from '../../credentials';
import { ExternalAccount, FetchFn, Provider } from '../provider';
import { LinearClient } from './client';
import { VIEWER_QUERY, viewerResponseSchema } from './schema';
import { LinearTaskSource } from './tasks';

export interface LinearProviderOptions {
  fetch: FetchFn;
  now?: () => Date;
}

export function createLinearProvider(options: LinearProviderOptions): Provider {
  const client = new LinearClient(options);
  return {
    id: ProviderId.LINEAR,
    supports: [SourceType.TASKS],
    // OAuth is deferred to feature 16c
    authMethods: [AuthType.API_KEY],
    getAccount: (auth) => getAccount(client, auth),
    tasks: new LinearTaskSource(client, options.now),
  };
}

// an API key belongs to one Linear workspace and a person can be in several, so the account id
// pairs the organisation with the user
export async function getAccount(client: LinearClient, auth: Auth): Promise<ExternalAccount> {
  const { viewer } = await client.request(auth, VIEWER_QUERY, {}, viewerResponseSchema);
  return {
    accountId: `${viewer.organization.id}:${viewer.id}`,
    label: `${viewer.name}, ${viewer.organization.name}`,
    userId: viewer.id,
  };
}
