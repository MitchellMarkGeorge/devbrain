import { AuthType, Provider as ProviderId, SourceType } from '../../types';
import { Auth } from '../../auth';
import { OAuthConfig } from '../../oauth/types';
import { OAuthClientCredentials, oauthClientFor } from '../oauth-clients';
import { ExternalAccount, FetchFn, Provider } from '../provider';
import { GoogleCalendarClient } from './client';
import { GoogleEventSource } from './events';

export const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
// openid, for the account's subject id, and the two narrow read-only calendar scopes: list the
// calendars, read their events. Both are narrower than calendar.readonly, which would also allow
// reading calendar settings and ACLs. openid is not a sensitive scope and grants no profile data.
export const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

export interface GoogleCalendarProviderOptions {
  fetch: FetchFn;
  now?: () => Date;
  // the OAuth client; defaults to the one the build read from GOOGLE_CLIENT_ID and
  // GOOGLE_CLIENT_SECRET. Without one the provider still syncs, but can't connect.
  client?: OAuthClientCredentials | null;
}

// Connecting is OAuth only: this config is all Google adds, and the flow under ../../oauth does
// the rest.
export function googleOAuthConfig(client: OAuthClientCredentials): OAuthConfig {
  return {
    authorizeUrl: AUTHORIZE_URL,
    tokenUrl: TOKEN_URL,
    revokeUrl: REVOKE_URL,
    clientId: client.clientId,
    // Google issues desktop clients a secret it does not treat as confidential; sent when set
    ...(client.clientSecret && { clientSecret: client.clientSecret }),
    scopes: SCOPES,
    scopeSeparator: ' ',
    // any free port on 127.0.0.1; Google accepts a loopback redirect without registering it
    redirect: { ports: 'any', path: '/callback' },
    extraAuthorizeParams: {
      // a refresh token, so sync keeps working after the hour-long access token expires
      access_type: 'offline',
      // ask again even when consent was given before, so a reconnect also gets a refresh token
      prompt: 'consent',
    },
    clientAuth: 'body',
  };
}

export function createGoogleCalendarProvider(options: GoogleCalendarProviderOptions): Provider {
  const client = new GoogleCalendarClient(options);
  const credentials =
    options.client === undefined ? oauthClientFor(ProviderId.GOOGLE_CALENDAR) : options.client;
  const oauth = credentials ? googleOAuthConfig(credentials) : undefined;
  return {
    id: ProviderId.GOOGLE_CALENDAR,
    supports: [SourceType.EVENTS],
    authMethods: oauth ? [AuthType.OAUTH] : [],
    ...(oauth && { oauth }),
    getAccount: (auth) => getAccount(client, auth),
    events: new GoogleEventSource(client, options.now),
  };
}

// The account id is the subject id from userinfo, which stays the same if the account's email
// changes. The label is the email, read as the primary calendar's id, since the scopes grant no
// email claim.
export async function getAccount(
  client: GoogleCalendarClient,
  auth: Auth,
): Promise<ExternalAccount> {
  const { sub } = await client.getUserInfo(auth);
  const primary = await client.getPrimaryCalendar(auth);
  return { accountId: sub, label: primary.id, userId: sub };
}
