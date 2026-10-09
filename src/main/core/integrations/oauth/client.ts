import { z } from 'zod';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../shared/errors';
import { BACKOFF_INITIAL_MS, HTTP_TIMEOUT_MS } from '../../sync/constants';
import { FetchFn } from '../fetch';
import { startLoopback } from './loopback';
import { createPkce, createState } from './pkce';
import { OAuthClient, OAuthConfig, OAuthTokens, OpenExternal } from './types';

// Authorization code with PKCE over a loopback redirect, refresh and revoke, as generic functions
// over an OAuthConfig. Nothing here knows which provider it is talking to.

export interface OAuthClientOptions {
  fetch: FetchFn;
  openExternal: OpenExternal;
  // injected for tests
  callbackTimeoutMs?: number;
  now?: () => number;
}

// token endpoint errors that mean the grant or the client is no good, so only a reconnect helps
const AUTH_ERRORS = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client']);

// a token or revoke endpoint error that is neither an auth failure nor the provider being down
export class OAuthError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(status: number, code: string | null, description: string | null) {
    super(
      `OAuth endpoint responded with ${status}${code ? ` (${code})` : ''}${description ? `: ${description}` : ''}`,
    );
    this.name = 'OAuthError';
    this.status = status;
    this.code = code;
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  // some endpoints send it as a string
  expires_in: z.coerce.number().positive().optional(),
  // space-separated per RFC 6749; some providers use commas or an array
  scope: z.union([z.string(), z.array(z.string())]).optional(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

// reads the standard fields of a token response (RFC 6749 section 5.1)
export function parseStandardTokens(json: unknown, now: number = Date.now()): OAuthTokens {
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    // the issues are not quoted: they could include a token
    throw new OAuthError(200, null, 'the token response is missing access_token');
  }
  const { access_token, refresh_token, expires_in, scope } = parsed.data;
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: expires_in === undefined ? null : new Date(now + expires_in * 1000),
    scopes: typeof scope === 'string' ? scope.split(/[\s,]+/).filter(Boolean) : (scope ?? []),
  };
}

export function createOAuthClient(options: OAuthClientOptions): OAuthClient {
  const now = options.now ?? Date.now;

  // parses a token response with the config's parser, filling in what the response left out
  function readTokens(config: OAuthConfig, json: unknown): OAuthTokens {
    const tokens = config.parseTokens ? config.parseTokens(json) : parseStandardTokens(json, now());
    // RFC 6749: an omitted scope means the requested scopes were granted
    return tokens.scopes.length > 0 ? tokens : { ...tokens, scopes: config.scopes };
  }

  // POSTs a form to a token or revoke endpoint with the client's credentials, mapping failures to
  // the shared error classes. Returns the parsed JSON body, or null when there is none.
  async function post(
    config: OAuthConfig,
    url: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const body = new URLSearchParams(params);
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (config.clientAuth === 'basic') {
      // RFC 6749 section 2.3.1: both parts are form-encoded before base64
      const user = encodeURIComponent(config.clientId);
      const password = encodeURIComponent(config.clientSecret ?? '');
      headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
    } else {
      body.set('client_id', config.clientId);
      if (config.clientSecret) body.set('client_secret', config.clientSecret);
    }

    const host = new URL(url).host;
    let response: Response;
    try {
      response = await options.fetch(url, {
        method: 'POST',
        headers,
        body: body.toString(),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(HTTP_TIMEOUT_MS)])
          : AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      // the caller cancelled: not a provider failure
      if (signal?.aborted) throw signal.reason;
      // network failure or the timeout firing
      throw new ProviderUnavailableError(`${host} could not be reached`, { cause: error });
    }

    const json = await readJson(response);
    if (response.ok) return json;

    if (response.status >= 500) {
      throw new ProviderUnavailableError(`${host} responded with ${response.status}`);
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const wait = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_INITIAL_MS;
      throw new RateLimitError(new Date(now() + wait));
    }
    const error = errorResponseSchema.safeParse(json);
    const code = error.success ? error.data.error : null;
    const description = error.success ? (error.data.error_description ?? null) : null;
    if (response.status === 401 || (code !== null && AUTH_ERRORS.has(code))) {
      throw new IntegrationAuthError(
        `${host} rejected the ${code === 'invalid_grant' ? 'grant' : 'client'}${code ? ` (${code})` : ''}`,
      );
    }
    throw new OAuthError(response.status, code, description);
  }

  return {
    async authorize(config, { signal }) {
      const pkce = createPkce();
      const state = createState();
      const listener = await startLoopback({
        ports: config.redirect.ports,
        path: config.redirect.path,
        state,
        signal,
        timeoutMs: options.callbackTimeoutMs,
      });

      let code: string;
      try {
        const url = new URL(config.authorizeUrl);
        // extra parameters first, so they can never replace one the flow depends on
        for (const [name, value] of Object.entries(config.extraAuthorizeParams ?? {})) {
          url.searchParams.set(name, value);
        }
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', config.clientId);
        url.searchParams.set('redirect_uri', listener.redirectUri);
        url.searchParams.set('scope', config.scopes.join(config.scopeSeparator ?? ' '));
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', pkce.challenge);
        url.searchParams.set('code_challenge_method', pkce.method);

        // the code can arrive, or the flow time out or be cancelled, before opening resolves
        code = await Promise.race([
          options.openExternal(url.toString()).then(() => listener.code),
          listener.code,
        ]);
      } finally {
        listener.close();
      }

      signal.throwIfAborted();
      const json = await post(
        config,
        config.tokenUrl,
        {
          grant_type: 'authorization_code',
          code,
          // must match the authorize request exactly, port included
          redirect_uri: listener.redirectUri,
          code_verifier: pkce.verifier,
        },
        signal,
      );
      return readTokens(config, json);
    },

    async refresh(config, refreshToken) {
      const json = await post(config, config.tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      const tokens = readTokens(config, json);
      // most providers keep the refresh token unchanged and leave it out of the response
      return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
    },

    async revoke(config, tokens) {
      if (!config.revokeUrl) return;
      // revoking the refresh token ends the whole grant where the provider supports that
      const [token, hint] = tokens.refreshToken
        ? [tokens.refreshToken, 'refresh_token']
        : [tokens.accessToken, 'access_token'];
      try {
        await post(config, config.revokeUrl, { token, token_type_hint: hint });
      } catch (error) {
        // a token that is already invalid needs no revoking (RFC 7009 section 2.2)
        if (error instanceof OAuthError && error.code === 'invalid_token') return;
        throw error;
      }
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
