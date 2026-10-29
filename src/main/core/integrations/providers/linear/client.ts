import { z } from 'zod';
import { Auth } from '../../auth';
import { FetchFn, RequestOptions } from '../provider';
import { requestSignal } from '../../fetch';
import { BACKOFF_INITIAL_MS } from '../../../sync/constants';
import {
  CoreError,
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../../shared/errors';

// A minimal GraphQL-over-fetch helper for Linear's API. It maps transport and auth failures to the
// shared error classes so the engine can react without knowing anything about Linear.

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

// GraphQL errors are recognised by extensions.code (as Linear's docs show) or extensions.type (as
// @linear/sdk reads them); which one Linear sends for each is still to be confirmed live
export const RATE_LIMITED = { code: 'RATELIMITED', type: 'ratelimited' };
// an unknown or revoked key may come back as a 400 with this error instead of a 401
export const AUTHENTICATION_ERROR = { code: 'AUTHENTICATION_ERROR', type: 'authentication error' };
// seconds to wait before retrying, sent with a rate-limited response
export const RETRY_AFTER_HEADER = 'Retry-After';
// each limit's remaining budget and the time its window resets (UTC epoch ms), in the order they
// are checked for the one that ran out: an endpoint's own limit, then requests, then complexity
export const RATE_LIMIT_HEADERS = [
  {
    remaining: 'X-RateLimit-Endpoint-Requests-Remaining',
    reset: 'X-RateLimit-Endpoint-Requests-Reset',
  },
  { remaining: 'X-RateLimit-Requests-Remaining', reset: 'X-RateLimit-Requests-Reset' },
  { remaining: 'X-RateLimit-Complexity-Remaining', reset: 'X-RateLimit-Complexity-Reset' },
];

// a GraphQL error that is not one of the mapped cases, e.g. a query the schema rejects
export class LinearApiError extends CoreError {
  readonly code = 'provider_api';
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Linear API error (${status}): ${message}`);
    this.name = 'LinearApiError';
    this.status = status;
  }
}

// the GraphQL response envelope; `data` is validated by each request's own schema
const graphQLBodySchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        extensions: z
          .object({ code: z.string().optional(), type: z.string().optional() })
          .optional(),
      }),
    )
    .optional(),
});

type GraphQLBody = z.infer<typeof graphQLBodySchema>;

// a body that is not a GraphQL envelope is null, with what was wrong with it
type ReadBody = { body: GraphQLBody } | { body: null; problem: string };

export interface LinearClientOptions {
  fetch: FetchFn;
  now?: () => Date;
}

export class LinearClient {
  private readonly fetch: FetchFn;
  private readonly now: () => Date;

  constructor(options: LinearClientOptions) {
    this.fetch = options.fetch;
    this.now = options.now ?? (() => new Date());
  }

  // sends one query and returns its `data`, validated against `schema`; an abort of
  // `options.signal` rejects with the signal's reason
  async request<T>(
    auth: Auth,
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    const { signal } = options;
    let response: Response;
    try {
      response = await this.fetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth.authorization,
        },
        body: JSON.stringify({ query, variables }),
        signal: requestSignal(signal),
      });
    } catch (error) {
      // the caller cancelled: not a provider failure
      if (signal?.aborted) throw signal.reason;
      // network failure or the timeout firing
      throw new ProviderUnavailableError('Linear could not be reached', { cause: error });
    }

    if (response.status >= 500) {
      throw new ProviderUnavailableError(`Linear responded with ${response.status}`);
    }
    if (response.status === 401) {
      throw new IntegrationAuthError('Linear rejected the credentials');
    }

    const read = await readBody(response, signal);
    const body = read.body;
    // Linear documents a 429 with a RATELIMITED GraphQL error; the code alone is accepted too, in
    // case it comes with another status
    if (hasError(body, RATE_LIMITED) || response.status === 429) {
      throw new RateLimitError(this.retryAt(response.headers));
    }
    // any other 400 is not treated as an auth failure: a bad query must not force a reconnect
    if (hasError(body, AUTHENTICATION_ERROR)) {
      throw new IntegrationAuthError('Linear rejected the credentials');
    }
    if (!response.ok || body?.errors?.length) {
      const messages = body?.errors?.map((error) => error.message).filter(Boolean);
      throw new LinearApiError(response.status, messages?.join('; ') || response.statusText);
    }
    if (read.body === null) {
      throw new LinearApiError(response.status, read.problem);
    }

    const parsed = schema.safeParse(read.body.data);
    if (!parsed.success) {
      throw new LinearApiError(response.status, `unexpected response: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  // Retry-After, as Linear asks; then the reset of the limit that ran out; then the earliest reset
  // sent; then a short default. Retry-After is relative, so it is not affected by clock skew, and
  // a reset is when the whole window refills, which the leaky bucket does not wait for
  private retryAt(headers: Headers): Date {
    const now = this.now().getTime();
    const retryAfter = Number(headers.get(RETRY_AFTER_HEADER));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return new Date(now + retryAfter * 1000);
    }

    // only the limits with a reset still ahead; a missing, invalid or past one is ignored
    const limits = RATE_LIMIT_HEADERS.flatMap((limit) => {
      const reset = parseResetTime(headers.get(limit.reset));
      if (reset === null || reset <= now) return [];
      return [{ reset, exhausted: isExhausted(headers.get(limit.remaining)) }];
    });
    const exhausted = limits.find((limit) => limit.exhausted);
    if (exhausted) {
      return new Date(exhausted.reset);
    }
    if (limits.length > 0) {
      return new Date(Math.min(...limits.map((limit) => limit.reset)));
    }
    return new Date(now + BACKOFF_INITIAL_MS);
  }
}

function hasError(body: GraphQLBody | null, kind: { code: string; type: string }): boolean {
  return (
    body?.errors?.some(
      (error) => error.extensions?.code === kind.code || error.extensions?.type === kind.type,
    ) ?? false
  );
}

async function readBody(response: Response, signal: AbortSignal | undefined): Promise<ReadBody> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    // the connection dropped or the timeout fired while the body was streaming
    throw new ProviderUnavailableError('Linear could not be reached', { cause: error });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { body: null, problem: 'response was not JSON' };
  }
  const parsed = graphQLBodySchema.safeParse(json);
  if (!parsed.success) {
    return { body: null, problem: `unexpected response envelope: ${parsed.error.message}` };
  }
  return { body: parsed.data };
}

// a Remaining header of 0 names the limit that ran out
function isExhausted(value: string | null): boolean {
  return value !== null && value.trim() !== '' && Number(value) === 0;
}

// the reset headers carry a UTC epoch time in milliseconds; seconds are accepted too
function parseResetTime(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) {
    return null;
  }
  return time < 1e12 ? time * 1000 : time;
}
