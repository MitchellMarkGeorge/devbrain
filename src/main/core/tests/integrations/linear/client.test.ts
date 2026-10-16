import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AuthType } from '../../../integrations/types';
import { toAuth } from '../../../integrations/auth';
import { LinearApiError, LinearClient } from '../../../integrations/providers/linear/client';
import { createLinearProvider } from '../../../integrations/providers/linear';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../../shared/errors';
import { HTTP_TIMEOUT_MS } from '../../../sync/constants';
import { scriptedFetch } from './fake-fetch';
import viewerFixture from '../fixtures/linear/viewer.json';
import rateLimitedFixture from '../fixtures/linear/rate-limited.json';
import authenticationErrorFixture from '../fixtures/linear/authentication-error.json';

const API_KEY = toAuth({ type: AuthType.API_KEY, apiKey: 'lin_api_test' });
const NOW = new Date('2026-10-07T12:00:00.000Z');
const anything = z.unknown();

function client(fetch: ReturnType<typeof scriptedFetch>) {
  return new LinearClient({ fetch, now: () => NOW });
}

describe('Linear client — requests', () => {
  it('posts the query to the GraphQL endpoint with a bare API key and a timeout', async () => {
    const fetch = scriptedFetch([{ body: { data: { ok: true } } }]);
    const data = await client(fetch).request(API_KEY, 'query { ok }', { a: 1 }, anything);

    expect(data).toEqual({ ok: true });
    const [request] = fetch.requests;
    expect(request.url).toBe('https://api.linear.app/graphql');
    expect(request.headers.authorization).toBe('lin_api_test');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.query).toBe('query { ok }');
    expect(request.variables).toEqual({ a: 1 });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends an OAuth token with the Bearer prefix', async () => {
    const fetch = scriptedFetch([{ body: { data: {} } }]);
    await client(fetch).request(
      toAuth({ type: AuthType.OAUTH, accessToken: 'token', refreshToken: 'r', expiresAt: null }),
      'query { ok }',
      {},
      anything,
    );
    expect(fetch.requests[0].headers.authorization).toBe('Bearer token');
  });

  it('rejects data that does not match the expected shape', async () => {
    const fetch = scriptedFetch([{ body: { data: { viewer: null } } }]);
    await expect(
      client(fetch).request(API_KEY, 'query', {}, z.object({ viewer: z.object({}) })),
    ).rejects.toBeInstanceOf(LinearApiError);
  });
});

describe('Linear client — errors', () => {
  it('maps a 401 to IntegrationAuthError', async () => {
    const fetch = scriptedFetch([{ status: 401, body: authenticationErrorFixture }]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      IntegrationAuthError,
    );
  });

  it('maps a 400 with an authentication error code to IntegrationAuthError', async () => {
    const fetch = scriptedFetch([{ status: 400, body: authenticationErrorFixture }]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      IntegrationAuthError,
    );
  });

  it('maps an authentication error reported only through extensions.type', async () => {
    const fetch = scriptedFetch([
      {
        status: 400,
        body: {
          errors: [{ message: 'Not authenticated', extensions: { type: 'authentication error' } }],
        },
      },
    ]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      IntegrationAuthError,
    );
  });

  it('does not treat an unrelated 400 as an authentication failure', async () => {
    const fetch = scriptedFetch([
      {
        status: 400,
        body: { errors: [{ message: 'Bad query', extensions: { type: 'invalid input' } }] },
      },
    ]);
    const error = await client(fetch)
      .request(API_KEY, 'query', {}, anything)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearApiError);
    expect(error).not.toBeInstanceOf(IntegrationAuthError);
  });

  it('maps a 400 with code RATELIMITED to RateLimitError with the reset time', async () => {
    const reset = new Date('2026-10-07T12:30:00.000Z');
    const fetch = scriptedFetch([
      {
        status: 400,
        body: rateLimitedFixture,
        headers: { 'X-RateLimit-Requests-Reset': String(reset.getTime()) },
      },
    ]);
    const error = await client(fetch)
      .request(API_KEY, 'query', {}, anything)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAt).toEqual(reset);
  });

  it('waits for the later reset when both limits report one', async () => {
    const fetch = scriptedFetch([
      {
        status: 400,
        body: rateLimitedFixture,
        headers: {
          'X-RateLimit-Requests-Reset': String(Date.parse('2026-10-07T12:30:00Z')),
          'X-RateLimit-Complexity-Reset': String(Date.parse('2026-10-07T12:45:00Z')),
        },
      },
    ]);
    const error = (await client(fetch)
      .request(API_KEY, 'query', {}, anything)
      .catch((e: unknown) => e)) as RateLimitError;
    expect(error.retryAt).toEqual(new Date('2026-10-07T12:45:00Z'));
  });

  it('falls back to Retry-After when no reset header is sent', async () => {
    const fetch = scriptedFetch([
      { status: 400, body: rateLimitedFixture, headers: { 'Retry-After': '120' } },
    ]);
    const error = (await client(fetch)
      .request(API_KEY, 'query', {}, anything)
      .catch((e: unknown) => e)) as RateLimitError;
    expect(error.retryAt).toEqual(new Date('2026-10-07T12:02:00.000Z'));
  });

  it('recognises a rate limit reported only through extensions.type', async () => {
    const fetch = scriptedFetch([
      {
        status: 400,
        body: { errors: [{ message: 'Rate limited', extensions: { type: 'ratelimited' } }] },
      },
    ]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('falls back to a short wait when no reset header is sent', async () => {
    const fetch = scriptedFetch([{ status: 400, body: rateLimitedFixture }]);
    const error = (await client(fetch)
      .request(API_KEY, 'query', {}, anything)
      .catch((e: unknown) => e)) as RateLimitError;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAt).toEqual(new Date('2026-10-07T12:01:00.000Z'));
  });

  it('maps a network failure to ProviderUnavailableError', async () => {
    const fetch = scriptedFetch([{ error: new TypeError('fetch failed') }]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('maps a timeout to ProviderUnavailableError', async () => {
    const fetch = scriptedFetch([
      { error: new DOMException('The operation timed out.', 'TimeoutError') },
    ]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("rejects with the caller's abort reason, not as a provider failure, when its signal aborts", async () => {
    const fetch = scriptedFetch([{ hang: true }]);
    const controller = new AbortController();
    const reason = new Error('sync stopped');

    const request = client(fetch).request(API_KEY, 'query', {}, anything, {
      signal: controller.signal,
    });
    controller.abort(reason);

    await expect(request).rejects.toBe(reason);
    expect(fetch.requests[0].signal?.aborted).toBe(true);
  });

  it("keeps the timeout alongside the caller's signal", async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetch = scriptedFetch([{ body: { data: { ok: true } } }]);
      const controller = new AbortController();
      await client(fetch).request(API_KEY, 'query', {}, anything, { signal: controller.signal });

      expect(timeout).toHaveBeenCalledWith(HTTP_TIMEOUT_MS);
      // a signal combining the two, not the caller's alone
      expect(fetch.requests[0].signal).not.toBe(controller.signal);
    } finally {
      timeout.mockRestore();
    }
  });

  it('maps a 5xx to ProviderUnavailableError, even with a non-JSON body', async () => {
    const fetch = scriptedFetch([() => new Response('<html>Bad gateway</html>', { status: 502 })]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('reports any other GraphQL error as a LinearApiError', async () => {
    const fetch = scriptedFetch([
      {
        status: 400,
        body: {
          errors: [
            {
              message: 'Cannot query field "nope"',
              extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
            },
          ],
        },
      },
    ]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toThrow(
      /Cannot query field "nope"/,
    );
  });

  it('reports a body that is not JSON as a LinearApiError', async () => {
    const fetch = scriptedFetch([() => new Response('<html>ok</html>', { status: 200 })]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toThrow(
      /response was not JSON/,
    );
  });

  it.each([
    ['an array', []],
    ['errors that are not a list', { data: {}, errors: 'boom' }],
    ['an error with a non-string message', { errors: [{ message: 42 }] }],
  ])('reports a malformed GraphQL envelope (%s) as a LinearApiError', async (_, body) => {
    const fetch = scriptedFetch([{ body }]);
    const error = await client(fetch)
      .request(API_KEY, 'query', {}, anything)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearApiError);
    expect((error as LinearApiError).message).toMatch(/unexpected response envelope/);
  });

  it('still maps a 429 with a malformed body to RateLimitError', async () => {
    const fetch = scriptedFetch([{ status: 429, body: { errors: 'slow down' } }]);
    await expect(client(fetch).request(API_KEY, 'query', {}, anything)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});

describe('Linear provider — getAccount', () => {
  it('builds the account id from the organisation and user', async () => {
    const fetch = scriptedFetch([{ body: viewerFixture }]);
    const account = await createLinearProvider({ fetch }).getAccount(API_KEY);

    expect(account).toEqual({
      accountId: '0f0e0d0c-0000-4000-8000-0000000000aa:a1b2c3d4-0000-4000-8000-000000000001',
      label: 'Ada Lovelace, Acme',
      userId: 'a1b2c3d4-0000-4000-8000-000000000001',
    });
    expect(fetch.requests[0].query).toMatch(/organization\s*{\s*id\s+name\s*}/);
  });

  it('maps a rejected key to IntegrationAuthError', async () => {
    const fetch = scriptedFetch([{ status: 401, body: authenticationErrorFixture }]);
    await expect(createLinearProvider({ fetch }).getAccount(API_KEY)).rejects.toBeInstanceOf(
      IntegrationAuthError,
    );
  });
});
