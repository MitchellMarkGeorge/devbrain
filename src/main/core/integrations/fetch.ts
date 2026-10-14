import { HTTP_TIMEOUT_MS } from '../sync/constants';

// What integration code needs from fetch: a URL string and an init. Kept this narrow so Electron's
// net.fetch (which takes no URL object) fits, as do Node's global fetch and the fakes in tests.
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

// The signal a provider request is sent with: the request's own timeout, and the caller's signal
// when it passes one, so an aborted sync run cancels the request in flight instead of waiting for
// it to answer or time out.
export function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
