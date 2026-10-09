import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  createOAuthClient,
  OAuthError,
  parseStandardTokens,
} from '../../../integrations/oauth/client';
import { OAuthCallbackTimeoutError } from '../../../integrations/oauth/loopback';
import { OAuthConfig, OpenExternal } from '../../../integrations/oauth/types';
import { FetchFn } from '../../../integrations/fetch';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../../shared/errors';
import { FakeAuthServer, fakeBrowser, isListening, portOf } from './fake-auth-server';

const CLIENT = { clientId: 'client-1', clientSecret: 'secret-1' };

describe('OAuth — client', () => {
  let server: FakeAuthServer;
  let config: OAuthConfig;

  beforeAll(async () => {
    server = await FakeAuthServer.start(CLIENT);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.reset();
    config = {
      ...CLIENT,
      authorizeUrl: server.authorizeUrl,
      tokenUrl: server.tokenUrl,
      revokeUrl: server.revokeUrl,
      scopes: ['a', 'b'],
      redirect: { ports: 'any', path: '/callback' },
    };
  });

  // an openExternal that records the URL and never visits it, like a browser left alone
  function idleBrowser() {
    const urls: string[] = [];
    const openExternal: OpenExternal = async (url) => {
      urls.push(url);
    };
    return {
      openExternal,
      urls,
      redirectUri: () => new URL(urls[0]).searchParams.get('redirect_uri')!,
    };
  }

  it('gives every request the HTTP timeout through a signal', async () => {
    const spy = vi.fn<FetchFn>((url, init) => fetch(url, init));
    const client = createOAuthClient({ fetch: spy, openExternal: fakeBrowser().openExternal });
    const tokens = await client.authorize(config, { signal: new AbortController().signal });
    await client.refresh(config, tokens.refreshToken!);
    await client.revoke(config, tokens);
    expect(spy).toHaveBeenCalledTimes(3);
    for (const [, init] of spy.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never lets extra parameters replace the ones the flow sets', async () => {
    config.extraAuthorizeParams = {
      response_type: 'token',
      state: 'forged',
      access_type: 'offline',
    };
    const client = createOAuthClient({ fetch, openExternal: fakeBrowser().openExternal });
    await client.authorize(config, { signal: new AbortController().signal });
    const params = server.authorizeRequests[0];
    expect(params.get('response_type')).toBe('code');
    expect(params.get('state')).not.toBe('forged');
    expect(params.get('access_type')).toBe('offline');
  });

  it('cancels while waiting on the browser, exchanges nothing and closes the listener', async () => {
    const browser = idleBrowser();
    const controller = new AbortController();
    const client = createOAuthClient({ fetch, openExternal: browser.openExternal });
    const flow = client.authorize(config, { signal: controller.signal });
    await vi.waitFor(() => expect(browser.urls).toHaveLength(1));
    controller.abort();
    await expect(flow).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(server.tokenRequests).toHaveLength(0);
    expect(await isListening(portOf(browser.redirectUri()))).toBe(false);
  });

  it('times out when the browser never comes back, and closes the listener', async () => {
    const browser = idleBrowser();
    const client = createOAuthClient({
      fetch,
      openExternal: browser.openExternal,
      callbackTimeoutMs: 50,
    });
    await expect(
      client.authorize(config, { signal: new AbortController().signal }),
    ).rejects.toThrow(OAuthCallbackTimeoutError);
    expect(await isListening(portOf(browser.redirectUri()))).toBe(false);
  });

  it('closes the listener when the browser fails to open', async () => {
    let redirectUri = '';
    const client = createOAuthClient({
      fetch,
      openExternal: async (url) => {
        redirectUri = new URL(url).searchParams.get('redirect_uri')!;
        throw new Error('no browser');
      },
    });
    await expect(
      client.authorize(config, { signal: new AbortController().signal }),
    ).rejects.toThrow('no browser');
    expect(await isListening(portOf(redirectUri))).toBe(false);
  });

  it('uses the config parser for a non-standard token response', async () => {
    config.parseTokens = (json) => {
      const body = json as { access_token: string; refresh_token: string };
      return {
        accessToken: `custom:${body.access_token}`,
        refreshToken: body.refresh_token,
        scopes: [],
      };
    };
    const client = createOAuthClient({ fetch, openExternal: fakeBrowser().openExternal });
    const tokens = await client.authorize(config, { signal: new AbortController().signal });
    expect(tokens.accessToken).toMatch(/^custom:access-/);
    // the parser gave no scopes, so the requested ones stand
    expect(tokens.scopes).toEqual(['a', 'b']);
  });

  it('maps a 5xx from the token endpoint to ProviderUnavailableError', async () => {
    server.tokenStatus = 503;
    const client = createOAuthClient({ fetch, openExternal: fakeBrowser().openExternal });
    await expect(client.refresh(config, 'refresh-1')).rejects.toThrow(ProviderUnavailableError);
  });

  it('maps a 429 to RateLimitError', async () => {
    server.tokenStatus = 429;
    const client = createOAuthClient({ fetch, openExternal: fakeBrowser().openExternal });
    await expect(client.refresh(config, 'refresh-1')).rejects.toThrow(RateLimitError);
  });

  it('maps a network failure to ProviderUnavailableError', async () => {
    const client = createOAuthClient({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
      openExternal: fakeBrowser().openExternal,
    });
    await expect(client.refresh(config, 'refresh-1')).rejects.toThrow(ProviderUnavailableError);
  });

  it('maps rejected client credentials to IntegrationAuthError', async () => {
    config.clientSecret = 'wrong';
    const client = createOAuthClient({ fetch, openExternal: fakeBrowser().openExternal });
    await expect(client.refresh(config, 'refresh-1')).rejects.toThrow(IntegrationAuthError);
  });

  it('revokes the access token when there is no refresh token', async () => {
    const client = createOAuthClient({ fetch, openExternal: fakeBrowser().openExternal });
    await client.revoke(config, { accessToken: 'access-only', scopes: [] });
    expect(server.revokeRequests[0].params.get('token')).toBe('access-only');
    expect(server.revokeRequests[0].params.get('token_type_hint')).toBe('access_token');
  });

  it('does nothing on revoke without a revoke URL', async () => {
    const spy = vi.fn<FetchFn>();
    const client = createOAuthClient({ fetch: spy, openExternal: fakeBrowser().openExternal });
    await client.revoke({ ...config, revokeUrl: undefined }, { accessToken: 'a', scopes: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('OAuth — standard token parsing', () => {
  const NOW = new Date('2026-10-09T12:00:00Z').getTime();

  it('reads access_token, refresh_token, expires_in and scope', () => {
    expect(
      parseStandardTokens(
        {
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3599,
          scope: 'x y',
          token_type: 'Bearer',
        },
        NOW,
      ),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(NOW + 3599 * 1000),
      scopes: ['x', 'y'],
    });
  });

  it('accepts comma-separated or array scopes, and expires_in as a string', () => {
    expect(parseStandardTokens({ access_token: 'a', scope: 'x,y' }, NOW).scopes).toEqual([
      'x',
      'y',
    ]);
    expect(parseStandardTokens({ access_token: 'a', scope: ['x'] }, NOW).scopes).toEqual(['x']);
    expect(parseStandardTokens({ access_token: 'a', expires_in: '60' }, NOW).expiresAt).toEqual(
      new Date(NOW + 60 * 1000),
    );
  });

  it('leaves out what the response leaves out', () => {
    expect(parseStandardTokens({ access_token: 'a' }, NOW)).toEqual({
      accessToken: 'a',
      refreshToken: undefined,
      expiresAt: null,
      scopes: [],
    });
  });

  it('rejects a response without an access token, without quoting it', () => {
    const parse = () => parseStandardTokens({ refresh_token: 'secret-refresh' }, NOW);
    expect(parse).toThrow(OAuthError);
    expect(parse).not.toThrow('secret-refresh');
  });
});
