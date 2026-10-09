// The OAuth contract suite. Every provider that declares an OAuthConfig calls
// describeOAuthProvider(config) from its tests; it runs the whole flow (loopback listener, authorize
// URL, callback, code exchange, refresh, revoke) against a fake authorization server, keeping
// everything from the config but the endpoint URLs. Passing it is what "adding OAuth is only
// configuration" means.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createOAuthClient } from '../../../integrations/oauth/client';
import { challengeFor } from '../../../integrations/oauth/pkce';
import { OAuthConfig } from '../../../integrations/oauth/types';
import { IntegrationAuthError } from '../../../shared/errors';
import { FakeAuthServer, fakeBrowser, isListening, portOf } from './fake-auth-server';

export interface OAuthContractOptions {
  // names the describe block; defaults to the authorize URL's host
  name?: string;
}

export function describeOAuthProvider(config: OAuthConfig, options: OAuthContractOptions = {}) {
  const name = options.name ?? new URL(config.authorizeUrl).host;

  describe(`OAuth contract — ${name}`, () => {
    let server: FakeAuthServer;
    // the provider's config, pointed at the fake server
    let local: OAuthConfig;

    beforeAll(async () => {
      server = await FakeAuthServer.start(config);
      local = {
        ...config,
        authorizeUrl: server.authorizeUrl,
        tokenUrl: server.tokenUrl,
        revokeUrl: config.revokeUrl ? server.revokeUrl : undefined,
      };
    });

    afterAll(async () => {
      await server.close();
    });

    beforeEach(() => {
      server.reset();
    });

    async function authorize() {
      const browser = fakeBrowser();
      const client = createOAuthClient({ fetch, openExternal: browser.openExternal });
      const tokens = await client.authorize(local, { signal: new AbortController().signal });
      return { tokens, browser, client, authorizeParams: server.authorizeRequests[0] };
    }

    it('completes the flow and returns the issued tokens', async () => {
      const before = Date.now();
      const { tokens, browser } = await authorize();
      expect(tokens.accessToken).toMatch(/^access-/);
      expect(tokens.refreshToken).toMatch(/^refresh-/);
      expect(tokens.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(tokens.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
      expect(tokens.scopes).toEqual(config.scopes);
      expect(browser.pages[0]).toContain('You can close this tab');
    });

    it('builds the authorize URL from the config alone', async () => {
      const { authorizeParams: params } = await authorize();
      expect(params.get('response_type')).toBe('code');
      expect(params.get('client_id')).toBe(config.clientId);
      expect(params.get('scope')).toBe(config.scopes.join(config.scopeSeparator ?? ' '));
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(params.get('state')).toMatch(/^[A-Za-z0-9_-]{16,}$/);
      for (const [key, value] of Object.entries(config.extraAuthorizeParams ?? {})) {
        expect(params.get(key)).toBe(value);
      }
      // the client secret never goes to the browser
      if (config.clientSecret)
        expect(server.authorizeRequests[0].toString()).not.toContain(config.clientSecret);
    });

    it('redirects to 127.0.0.1 on the configured path and an allowed port', async () => {
      const { authorizeParams } = await authorize();
      const redirect = new URL(authorizeParams.get('redirect_uri')!);
      expect(redirect.protocol).toBe('http:');
      expect(redirect.hostname).toBe('127.0.0.1');
      expect(redirect.pathname).toBe(config.redirect.path);
      if (config.redirect.ports !== 'any') {
        expect(config.redirect.ports).toContain(Number(redirect.port));
      }
    });

    it('exchanges the code with the verifier and the exact redirect URI that was bound', async () => {
      const { authorizeParams } = await authorize();
      const [exchange] = server.tokenRequests;
      expect(exchange.params.get('grant_type')).toBe('authorization_code');
      expect(exchange.params.get('code')).toMatch(/^code-/);
      expect(challengeFor(exchange.params.get('code_verifier')!)).toBe(
        authorizeParams.get('code_challenge'),
      );
      expect(exchange.params.get('redirect_uri')).toBe(authorizeParams.get('redirect_uri'));
    });

    it('sends client credentials the way the config says', async () => {
      await authorize();
      const [exchange] = server.tokenRequests;
      if (config.clientAuth === 'basic') {
        const decoded = Buffer.from(exchange.authorization!.replace(/^Basic /, ''), 'base64');
        expect(decoded.toString()).toBe(
          `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret ?? '')}`,
        );
        expect(exchange.params.has('client_secret')).toBe(false);
      } else {
        expect(exchange.authorization).toBeNull();
        expect(exchange.params.get('client_id')).toBe(config.clientId);
        expect(exchange.params.get('client_secret')).toBe(config.clientSecret ?? null);
      }
    });

    it('closes the loopback listener once the flow ends', async () => {
      const { authorizeParams } = await authorize();
      expect(await isListening(portOf(authorizeParams.get('redirect_uri')!))).toBe(false);
    });

    it('turns a denied consent into IntegrationAuthError, exchanging nothing', async () => {
      server.authorizeError = 'access_denied';
      await expect(authorize()).rejects.toThrow(IntegrationAuthError);
      expect(server.tokenRequests).toHaveLength(0);
      const redirectUri = server.authorizeRequests[0].get('redirect_uri')!;
      expect(await isListening(portOf(redirectUri))).toBe(false);
    });

    it('refreshes, keeping the old refresh token when none comes back', async () => {
      const { tokens, client } = await authorize();
      const refreshed = await client.refresh(local, tokens.refreshToken!);
      expect(refreshed.accessToken).not.toBe(tokens.accessToken);
      expect(refreshed.refreshToken).toBe(tokens.refreshToken);
      const request = server.tokenRequests.at(-1)!;
      expect(request.params.get('grant_type')).toBe('refresh_token');
      expect(request.params.get('refresh_token')).toBe(tokens.refreshToken);
    });

    it('takes a rotated refresh token when one comes back', async () => {
      const { tokens, client } = await authorize();
      server.rotateRefreshTokens = true;
      const refreshed = await client.refresh(local, tokens.refreshToken!);
      expect(refreshed.refreshToken).toMatch(/^refresh-/);
      expect(refreshed.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('maps a rejected refresh to IntegrationAuthError', async () => {
      const { tokens, client } = await authorize();
      server.rejectRefresh = true;
      await expect(client.refresh(local, tokens.refreshToken!)).rejects.toThrow(
        IntegrationAuthError,
      );
    });

    it('revokes at the revoke endpoint, or does nothing without one', async () => {
      const { tokens, client } = await authorize();
      await client.revoke(local, tokens);
      if (config.revokeUrl) {
        expect(server.revokeRequests).toHaveLength(1);
        expect(server.revokeRequests[0].params.get('token')).toBe(tokens.refreshToken);
      } else {
        expect(server.revokeRequests).toHaveLength(0);
      }
    });
  });
}
