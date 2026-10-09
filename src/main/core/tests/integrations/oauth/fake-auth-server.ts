// A fake OAuth authorization server: a real HTTP server on 127.0.0.1, so the client under test does
// real requests and the loopback listener gets a real redirect. It checks what a strict server
// would (PKCE, the redirect URI, client credentials) and records every request for assertions.

import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo, connect, createServer as createNetServer } from 'node:net';
import { challengeFor } from '../../../integrations/oauth/pkce';
import { OpenExternal } from '../../../integrations/oauth/types';

export interface FakeClient {
  clientId: string;
  clientSecret?: string;
  clientAuth?: 'body' | 'basic';
}

export interface RecordedPost {
  params: URLSearchParams;
  // the Authorization header, if any
  authorization: string | null;
}

export class FakeAuthServer {
  readonly authorizeRequests: URLSearchParams[] = [];
  readonly tokenRequests: RecordedPost[] = [];
  readonly revokeRequests: RecordedPost[] = [];

  // scripted behaviour; reset() restores the defaults
  authorizeError: string | null = null;
  // seconds; null leaves expires_in out
  expiresIn: number | null = 3600;
  // whether a refresh returns a new refresh token or leaves it out, as most providers do
  rotateRefreshTokens = false;
  // answer refreshes with invalid_grant
  rejectRefresh = false;
  // answer the token endpoint with this status and no body, e.g. 503
  tokenStatus: number | null = null;

  private issued = 0;
  // code -> what the authorize request carried, to check the exchange against
  private readonly codes = new Map<string, { challenge: string; redirectUri: string }>();

  private constructor(
    private readonly server: Server,
    readonly url: string,
    private readonly client: FakeClient,
  ) {}

  static async start(client: FakeClient): Promise<FakeAuthServer> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const fake = new FakeAuthServer(server, `http://127.0.0.1:${port}`, client);
    server.on('request', (req, res) => void fake.handle(req, res));
    return fake;
  }

  get authorizeUrl() {
    return `${this.url}/authorize`;
  }
  get tokenUrl() {
    return `${this.url}/token`;
  }
  get revokeUrl() {
    return `${this.url}/revoke`;
  }

  reset(): void {
    this.authorizeRequests.length = 0;
    this.tokenRequests.length = 0;
    this.revokeRequests.length = 0;
    this.authorizeError = null;
    this.expiresIn = 3600;
    this.rotateRefreshTokens = false;
    this.rejectRefresh = false;
    this.tokenStatus = null;
    this.issued = 0;
    this.codes.clear();
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.url);
    if (req.method === 'GET' && url.pathname === '/authorize') return this.authorize(url, res);

    const recorded: RecordedPost = {
      params: new URLSearchParams(await readBody(req)),
      authorization: req.headers.authorization ?? null,
    };
    if (req.method === 'POST' && url.pathname === '/token') return this.token(recorded, res);
    if (req.method === 'POST' && url.pathname === '/revoke') {
      this.revokeRequests.push(recorded);
      if (!this.clientIsValid(recorded)) return json(res, 401, { error: 'invalid_client' });
      return json(res, 200, null);
    }
    json(res, 404, { error: 'not_found' });
  }

  // a consenting user: redirects straight back with a code, or with the scripted error
  private authorize(url: URL, res: ServerResponse): void {
    const params = url.searchParams;
    this.authorizeRequests.push(params);
    const redirect = new URL(params.get('redirect_uri') ?? '');
    redirect.searchParams.set('state', params.get('state') ?? '');
    if (this.authorizeError) {
      redirect.searchParams.set('error', this.authorizeError);
    } else {
      const code = `code-${++this.issued}`;
      this.codes.set(code, {
        challenge: params.get('code_challenge') ?? '',
        redirectUri: params.get('redirect_uri') ?? '',
      });
      redirect.searchParams.set('code', code);
    }
    res.writeHead(302, { Location: redirect.toString() }).end();
  }

  private token(recorded: RecordedPost, res: ServerResponse): void {
    this.tokenRequests.push(recorded);
    if (this.tokenStatus !== null) return void res.writeHead(this.tokenStatus).end();
    if (!this.clientIsValid(recorded)) return json(res, 401, { error: 'invalid_client' });

    const { params } = recorded;
    const n = ++this.issued;
    if (params.get('grant_type') === 'authorization_code') {
      const issued = this.codes.get(params.get('code') ?? '');
      this.codes.delete(params.get('code') ?? '');
      if (
        !issued ||
        challengeFor(params.get('code_verifier') ?? '') !== issued.challenge ||
        params.get('redirect_uri') !== issued.redirectUri
      ) {
        return json(res, 400, { error: 'invalid_grant' });
      }
      return json(res, 200, this.tokens(n, true));
    }
    if (params.get('grant_type') === 'refresh_token') {
      if (this.rejectRefresh || !params.get('refresh_token')) {
        return json(res, 400, { error: 'invalid_grant', error_description: 'Token has expired' });
      }
      return json(res, 200, this.tokens(n, this.rotateRefreshTokens));
    }
    json(res, 400, { error: 'unsupported_grant_type' });
  }

  private tokens(n: number, withRefreshToken: boolean) {
    const scope = this.authorizeRequests.at(-1)?.get('scope') ?? '';
    return {
      access_token: `access-${n}`,
      token_type: 'Bearer',
      ...(withRefreshToken && { refresh_token: `refresh-${n}` }),
      ...(this.expiresIn !== null && { expires_in: this.expiresIn }),
      // granted scopes come back space-separated, as RFC 6749 has them
      scope: scope.split(/[ ,]/).join(' '),
    };
  }

  // the client authenticates exactly the way it is registered to
  private clientIsValid({ params, authorization }: RecordedPost): boolean {
    const { clientId, clientSecret, clientAuth = 'body' } = this.client;
    if (clientAuth === 'basic') {
      const expected = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret ?? '')}`;
      return (
        authorization === `Basic ${Buffer.from(expected).toString('base64')}` &&
        !params.has('client_secret')
      );
    }
    return (
      authorization === null &&
      params.get('client_id') === clientId &&
      params.get('client_secret') === (clientSecret ?? null)
    );
  }
}

// Stands in for the system browser: requests the authorize URL and follows its redirect to the
// loopback listener, keeping the page the listener served.
export function fakeBrowser() {
  const visited: string[] = [];
  const pages: string[] = [];
  const openExternal: OpenExternal = async (url) => {
    visited.push(url);
    const response = await fetch(url);
    pages.push(await response.text());
  };
  return { openExternal, visited, pages };
}

// whether anything accepts connections on the port
export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

export function portOf(uri: string): number {
  return Number(new URL(uri).port);
}

// ports the OS reports free right now, for tests that need a fixed list
export async function freePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(Array.from({ length: count }, () => occupyPort()));
  const ports = servers.map((server) => server.port);
  await Promise.all(servers.map((server) => server.close()));
  return ports;
}

// holds a port on 127.0.0.1 until closed, to make it busy
export async function occupyPort(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  if (body === null) return void res.writeHead(status).end();
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}
