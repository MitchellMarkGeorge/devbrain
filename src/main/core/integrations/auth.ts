import { Credentials } from './credentials';
import { AuthType } from './types';

// How a request to a provider is authenticated. Kept apart from credential storage: adapters only
// ever see an Auth, never the credentials it was made from or how they are stored.

// what a provider adapter is handed for a request: the Authorization header value, nothing else
export interface Auth {
  authorization: string;
}

// The header value for credentials. OAuth tokens are bearer tokens; an API key goes as it is, which
// is what Linear expects. Exported so a connect can validate a key before anything is stored.
export function toAuth(credentials: Credentials): Auth {
  return {
    authorization:
      credentials.type === AuthType.API_KEY
        ? credentials.apiKey
        : `Bearer ${credentials.accessToken}`,
  };
}
