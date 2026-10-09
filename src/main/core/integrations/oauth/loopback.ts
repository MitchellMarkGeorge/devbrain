import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { IntegrationAuthError } from '../../shared/errors';
import { OAUTH_CALLBACK_TIMEOUT_MS } from '../../sync/constants';

// The temporary HTTP listener the browser is redirected to at the end of an OAuth flow. Bound to
// 127.0.0.1 only, single use, and closed on every way out: callback, provider error, timeout, abort.

const HOST = '127.0.0.1';

export interface LoopbackOptions {
  ports: number[] | 'any';
  path: string;
  // the state sent in the authorize URL; a callback without it is turned away
  state: string;
  signal: AbortSignal;
  timeoutMs?: number;
}

export interface LoopbackListener {
  // the exact URI that was bound, to send as redirect_uri in both the authorize URL and the exchange
  redirectUri: string;
  // the authorization code; rejects on a provider error, timeout or abort. Settles once, and the
  // listener is closed by the time it does.
  code: Promise<string>;
  // stops listening; safe to call more than once and after the code arrived
  close(): void;
}

export class OAuthCallbackTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`No sign-in arrived from the browser within ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = 'OAuthCallbackTimeoutError';
  }
}

export async function startLoopback(options: LoopbackOptions): Promise<LoopbackListener> {
  const { path, state, signal } = options;
  const timeoutMs = options.timeoutMs ?? OAUTH_CALLBACK_TIMEOUT_MS;
  signal.throwIfAborted();

  const server = createServer();
  const port = await listen(server, options.ports);
  const redirectUri = `http://${HOST}:${port}${path}`;

  let settled = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: unknown) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // the caller may not be awaiting yet, e.g. while the browser opens; it still sees the rejection
  code.catch(() => undefined);

  const close = () => {
    server.close();
    server.closeAllConnections();
  };

  const finish = (outcome: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    // stop accepting at once; connections still open are dropped once their response is sent
    server.close();
    outcome();
  };

  const onAbort = () =>
    finish(() => {
      close();
      rejectCode(signal.reason);
    });
  const timer = setTimeout(
    () =>
      finish(() => {
        close();
        rejectCode(new OAuthCallbackTimeoutError(timeoutMs));
      }),
    timeoutMs,
  );
  signal.addEventListener('abort', onAbort, { once: true });
  // an abort between the check above and here would otherwise be missed
  if (signal.aborted) onAbort();

  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    res.on('close', () => {
      if (settled) server.closeAllConnections();
    });
    const url = new URL(req.url ?? '/', redirectUri);
    if (settled || req.method !== 'GET' || url.pathname !== path) {
      return send(res, 404, NOT_FOUND_PAGE);
    }
    // a callback that is not ours, e.g. a stale tab or another local process: turn it away and
    // keep waiting for the real one
    if (url.searchParams.get('state') !== state) {
      return send(res, 400, BAD_REQUEST_PAGE);
    }

    const error = url.searchParams.get('error');
    const value = url.searchParams.get('code');
    if (error !== null || !value) {
      send(res, 200, FAILED_PAGE);
      return finish(() =>
        rejectCode(
          new IntegrationAuthError(
            error === null
              ? 'The sign-in callback carried no authorization code'
              : `Sign-in was not completed (${error})`,
          ),
        ),
      );
    }
    send(res, 200, DONE_PAGE);
    finish(() => resolveCode(value));
  });
  server.on('error', (error) =>
    finish(() => {
      close();
      rejectCode(error);
    }),
  );

  return { redirectUri, code, close };
}

// tries each fixed port in turn, or asks the OS for a free one; returns the port bound
async function listen(server: Server, ports: number[] | 'any'): Promise<number> {
  const candidates = ports === 'any' ? [0] : ports;
  if (candidates.length === 0) throw new Error('No redirect ports are configured');

  for (const port of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, HOST, () => {
          server.off('error', reject);
          resolve();
        });
      });
      return (server.address() as AddressInfo).port;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE' && code !== 'EACCES') throw error;
    }
  }
  throw new Error(`None of the redirect ports is free: ${candidates.join(', ')}`);
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    Connection: 'close',
  });
  res.end(body);
}

function page(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 4rem"><h1>${title}</h1><p>${message}</p></body></html>`;
}

const DONE_PAGE = page('Connected to DevBrain', 'You can close this tab and return to DevBrain.');
const FAILED_PAGE = page(
  'Sign-in not completed',
  'You can close this tab and try again from DevBrain.',
);
const BAD_REQUEST_PAGE = page(
  'Unexpected request',
  'This sign-in link is not the one DevBrain is waiting for.',
);
const NOT_FOUND_PAGE = page('Not found', 'There is nothing here.');
