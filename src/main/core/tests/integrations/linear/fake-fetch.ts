import { FetchFn } from '../../../integrations/providers/provider';

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  query: string;
  variables: Record<string, unknown>;
  signal: AbortSignal | null;
}

type Step =
  | { status?: number; body: unknown; headers?: Record<string, string> }
  | { error: unknown }
  | ((request: RecordedRequest) => Response);

// a scripted fetch: each call takes the next step, and every request is recorded for assertions
export function scriptedFetch(steps: Step[]): FetchFn & { requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    const request: RecordedRequest = {
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      query,
      variables,
      signal: init?.signal ?? null,
    };
    requests.push(request);

    const step = steps.shift();
    if (step === undefined) {
      throw new Error('scriptedFetch: no more steps');
    }
    if (typeof step === 'function') {
      return step(request);
    }
    if ('error' in step) {
      throw step.error;
    }
    return jsonResponse(step.body, step.status ?? 200, step.headers);
  };
  return Object.assign(fake as FetchFn, { requests });
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
