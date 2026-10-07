import { z } from 'zod';
import { Auth } from '../../auth';
import { FetchFn } from '../provider';
import { BACKOFF_INITIAL_MS, HTTP_TIMEOUT_MS } from '../../../sync/constants';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../../shared/errors';
import {
  AUTHENTICATION_ERROR_CODE,
  LINEAR_GRAPHQL_URL,
  RATE_LIMIT_RESET_HEADERS,
  RATE_LIMITED_CODE,
} from './schema';

// A minimal GraphQL-over-fetch helper for Linear's API. It maps transport and auth failures to the
// shared error classes so the engine can react without knowing anything about Linear.

// a GraphQL error that is not one of the mapped cases, e.g. a query the schema rejects
export class LinearApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Linear API error (${status}): ${message}`);
    this.name = 'LinearApiError';
    this.status = status;
  }
}

interface GraphQLError {
  message?: string;
  extensions?: { code?: string };
}

interface GraphQLBody {
  data?: unknown;
  errors?: GraphQLError[];
}

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

  // sends one query and returns its `data`, validated against `schema`
  async request<T>(
    auth: Auth,
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth.authorization,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      // network failure or the timeout firing
      throw new ProviderUnavailableError('Linear could not be reached', { cause: error });
    }

    if (response.status >= 500) {
      throw new ProviderUnavailableError(`Linear responded with ${response.status}`);
    }
    if (response.status === 401) {
      throw new IntegrationAuthError('Linear rejected the credentials');
    }

    const body = await readBody(response);
    const codes = body?.errors?.map((error) => error.extensions?.code) ?? [];

    // Linear reports rate limiting as a 400 with a GraphQL error code, not a 429
    if (codes.includes(RATE_LIMITED_CODE) || response.status === 429) {
      throw new RateLimitError(this.retryAt(response.headers));
    }
    if (codes.includes(AUTHENTICATION_ERROR_CODE)) {
      throw new IntegrationAuthError('Linear rejected the credentials');
    }
    if (!response.ok || body?.errors?.length) {
      const messages = body?.errors?.map((error) => error.message).filter(Boolean);
      throw new LinearApiError(response.status, messages?.join('; ') || response.statusText);
    }
    if (!body) {
      throw new LinearApiError(response.status, 'response was not JSON');
    }

    const parsed = schema.safeParse(body.data);
    if (!parsed.success) {
      throw new LinearApiError(response.status, `unexpected response: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  // the later of the reset headers, so neither limit is hit again on the next attempt
  private retryAt(headers: Headers): Date {
    const resets = RATE_LIMIT_RESET_HEADERS.map((name) => parseResetTime(headers.get(name))).filter(
      (time): time is number => time !== null,
    );
    if (resets.length === 0) {
      return new Date(this.now().getTime() + BACKOFF_INITIAL_MS);
    }
    return new Date(Math.max(...resets));
  }
}

async function readBody(response: Response): Promise<GraphQLBody | null> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    // the connection dropped or the timeout fired while the body was streaming
    throw new ProviderUnavailableError('Linear could not be reached', { cause: error });
  }
  try {
    return JSON.parse(text) as GraphQLBody;
  } catch {
    return null;
  }
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
