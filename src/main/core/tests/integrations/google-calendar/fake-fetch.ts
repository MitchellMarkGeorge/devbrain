import { FetchFn } from '../../../integrations/providers/provider';
import { jsonResponse } from '../linear/fake-fetch';
import eventsPageFixture from '../fixtures/google-calendar/events-page.json';

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  signal: AbortSignal | null;
}

type Step =
  | { status?: number; body: unknown; headers?: Record<string, string> }
  | { error: unknown }
  | ((request: RecordedRequest) => Response);

// a scripted fetch: each call takes the next step, and every request is recorded for assertions
export function scriptedFetch(steps: Step[]): FetchFn & {
  requests: RecordedRequest[];
  steps: Step[];
} {
  const requests: RecordedRequest[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const request: RecordedRequest = {
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      signal: init?.signal ?? null,
    };
    requests.push(request);

    const step = steps.shift();
    if (step === undefined) {
      throw new Error(`scriptedFetch: no more steps for ${request.url.pathname}`);
    }
    if (typeof step === 'function') {
      return step(request);
    }
    if ('error' in step) {
      throw step.error;
    }
    return jsonResponse(step.body, step.status ?? 200, step.headers);
  };
  return Object.assign(fake as FetchFn, { requests, steps });
}

// a page of events.list around these items: the last page carries a sync token, any other a page
// token
export function eventsPage(
  items: unknown[],
  options: { nextPageToken?: string; nextSyncToken?: string } = {},
) {
  // the fixture's own sync token is replaced by the one asked for
  const wrapper: Record<string, unknown> = { ...eventsPageFixture };
  delete wrapper.nextSyncToken;
  return {
    ...wrapper,
    items,
    ...(options.nextPageToken
      ? { nextPageToken: options.nextPageToken }
      : { nextSyncToken: options.nextSyncToken ?? 'sync-token-1' }),
  };
}
