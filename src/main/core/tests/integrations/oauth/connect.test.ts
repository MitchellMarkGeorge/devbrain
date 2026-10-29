import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { IntegrationId } from '@common/ids';
import { integrations } from '@main/db/schema/integrations';
import { createDb } from '../../utils';
import { FakeCipher } from '../../__mocks__/fake-cipher';
import { Auth } from '../../../integrations/auth';
import { CredentialStore } from '../../../integrations/credential-store';
import { OAuthConfig, OpenExternal } from '../../../integrations/oauth/types';
import { ExternalAccount, Provider } from '../../../integrations/providers/provider';
import {
  createProviderRegistry,
  createTokenRefreshers,
  ProviderRegistry,
} from '../../../integrations/providers/registry';
import { IntegrationChange, IntegrationService } from '../../../integrations/service';
import { createIntegrationServices, unavailableBrowser } from '../../../integrations/setup';
import {
  AuthType,
  IntegrationStatus,
  Provider as ProviderId,
  SourceType,
} from '../../../integrations/types';
import {
  ConnectCancelledError,
  ConnectInProgressError,
  IntegrationAuthError,
  ProviderUnavailableError,
  UnsafeUrlError,
} from '../../../shared/errors';
import { TOKEN_REFRESH_MARGIN_MS } from '../../../sync/constants';
import { FakeAuthServer, fakeBrowser } from './fake-auth-server';

const CLIENT = { clientId: 'calendar-client', clientSecret: 'calendar-secret' };
const ACCOUNT: ExternalAccount = {
  accountId: 'subject-1',
  label: 'ada@example.com',
  userId: 'subject-1',
};

describe('IntegrationService — connectWithOAuth', () => {
  let server: FakeAuthServer;
  let config: OAuthConfig;

  beforeAll(async () => {
    server = await FakeAuthServer.start(CLIENT);
    config = {
      ...CLIENT,
      authorizeUrl: server.authorizeUrl,
      tokenUrl: server.tokenUrl,
      revokeUrl: server.revokeUrl,
      scopes: ['events.read'],
      redirect: { ports: 'any', path: '/callback' },
    };
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.reset();
  });

  // an OAuth provider whose getAccount accepts any bearer token the fake server issued
  function oauthProvider(overrides: Partial<Provider> = {}) {
    const getAccount = vi.fn(async (auth: Auth): Promise<ExternalAccount> => {
      if (!/^Bearer access-\d+$/.test(auth.authorization)) {
        throw new IntegrationAuthError('rejected');
      }
      return ACCOUNT;
    });
    const provider: Provider = {
      id: ProviderId.GOOGLE_CALENDAR,
      supports: [SourceType.EVENTS],
      authMethods: [AuthType.OAUTH],
      oauth: config,
      getAccount,
      ...overrides,
    };
    return { provider, getAccount };
  }

  function setup(
    options: { provider?: Provider; openExternal?: OpenExternal; now?: () => number } = {},
  ) {
    const db = createDb();
    const cipher = new FakeCipher();
    const providers: ProviderRegistry = new Map([
      [ProviderId.GOOGLE_CALENDAR, options.provider ?? oauthProvider().provider],
    ]);
    const { credentials, integrations: service } = createIntegrationServices(db, {
      cipher,
      fetch,
      providers,
      openExternal: options.openExternal ?? fakeBrowser().openExternal,
    });
    const changes: IntegrationChange[] = [];
    service.onChange((change) => changes.push(change));
    return { db, cipher, credentials, service, changes };
  }

  async function storedCredentials(
    cipher: FakeCipher,
    db: BetterSQLite3Database,
    id: IntegrationId,
  ) {
    const row = db.select().from(integrations).where(eq(integrations.id, id)).get()!;
    return JSON.parse((await cipher.decrypt(row.credentials)).result);
  }

  function status(db: BetterSQLite3Database, id: IntegrationId) {
    return db.select().from(integrations).where(eq(integrations.id, id)).get()!.status;
  }

  // a browser that opens the page only when told to
  function heldBrowser() {
    const browser = fakeBrowser();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const opened = vi.fn();
    const openExternal: OpenExternal = async (url) => {
      opened(url);
      await released;
      await browser.openExternal(url);
    };
    return { openExternal, opened, release };
  }

  it('never opens an authorize URL that is not http or https', async () => {
    const opened = vi.fn(async () => {});
    const { provider } = oauthProvider({
      oauth: { ...config, authorizeUrl: 'javascript:alert(1)//' },
    });
    const { db, service } = setup({ provider, openExternal: opened });

    await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(opened).not.toHaveBeenCalled();
    expect(db.select().from(integrations).all()).toEqual([]);
  });

  it('runs the flow, checks the account with the new token and stores the integration', async () => {
    const { provider, getAccount } = oauthProvider();
    const { db, cipher, service, changes } = setup({ provider });

    const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
    expect(integration).toMatchObject({
      provider: ProviderId.GOOGLE_CALENDAR,
      authType: AuthType.OAUTH,
      accountLabel: ACCOUNT.label,
      status: IntegrationStatus.CONNECTED,
      sources: [{ sourceType: SourceType.EVENTS, enabled: true }],
    });
    expect(getAccount).toHaveBeenCalledWith(
      { authorization: 'Bearer access-2' },
      { signal: expect.any(AbortSignal) },
    );
    expect(await storedCredentials(cipher, db, integration.id)).toEqual({
      type: 'oauth',
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: expect.any(String),
    });
    expect(changes).toEqual([
      expect.objectContaining({ type: 'connected', integrationId: integration.id }),
    ]);
  });

  function storedScopes(db: BetterSQLite3Database, id: IntegrationId) {
    return db.select().from(integrations).where(eq(integrations.id, id)).get()!.scopes;
  }

  it('stores the granted scopes', async () => {
    const { db, service } = setup();
    const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
    expect(storedScopes(db, integration.id)).toBe('events.read');
  });

  it('updates the scopes on reconnect, and clears them for an API key', async () => {
    const { provider } = oauthProvider({
      authMethods: [AuthType.OAUTH, AuthType.API_KEY],
      getAccount: async (auth) => {
        if (auth.authorization === 'key' || /^Bearer access-\d+$/.test(auth.authorization)) {
          return ACCOUNT;
        }
        throw new IntegrationAuthError('rejected');
      },
    });
    const { db, service } = setup({ provider });
    const { id } = await service.connectWithApiKey(ProviderId.GOOGLE_CALENDAR, 'key');
    expect(storedScopes(db, id)).toBeNull();

    await service.reconnect(id, { type: AuthType.OAUTH });
    expect(storedScopes(db, id)).toBe('events.read');

    await service.reconnect(id, { type: AuthType.API_KEY, apiKey: 'key' });
    expect(storedScopes(db, id)).toBeNull();
  });

  it('switches on only the chosen source types', async () => {
    const { service } = setup();
    const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR, {
      enableSources: [],
    });
    expect(integration.sources).toEqual([
      expect.objectContaining({ sourceType: SourceType.EVENTS, enabled: false }),
    ]);
  });

  it('refuses a provider that declares no OAuth config', async () => {
    const { provider } = oauthProvider({ oauth: undefined, authMethods: [AuthType.API_KEY] });
    const { service } = setup({ provider });
    await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toMatchObject({
      code: 'unsupported_by_provider',
      message: expect.stringContaining("can't be connected with OAuth"),
    });
  });

  it('refuses with oauth_unavailable when no OAuth client or browser is configured', async () => {
    const db = createDb();
    const providers: ProviderRegistry = new Map([
      [ProviderId.GOOGLE_CALENDAR, oauthProvider().provider],
    ]);
    const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
    const withoutClient = new IntegrationService(db, { credentials, providers });
    await expect(withoutClient.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toMatchObject({
      code: 'oauth_unavailable',
      message: 'No OAuth client is configured',
    });

    const { service } = setup({ openExternal: unavailableBrowser });
    await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toMatchObject({
      code: 'oauth_unavailable',
    });
  });

  it('writes nothing when the account query fails', async () => {
    const { provider } = oauthProvider({
      getAccount: async () => {
        throw new ProviderUnavailableError('down');
      },
    });
    const { db, service } = setup({ provider });
    await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toThrow(
      ProviderUnavailableError,
    );
    expect(db.select().from(integrations).all()).toHaveLength(0);
  });

  it('allows one connect at a time, and frees the slot when it ends', async () => {
    const browser = heldBrowser();
    const { service } = setup({ openExternal: browser.openExternal });

    const first = service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
    await vi.waitFor(() => expect(browser.opened).toHaveBeenCalled());
    await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toThrow(
      ConnectInProgressError,
    );

    browser.release();
    await first;
    // the account is now connected, so the next attempt fails on that, not on the slot
    await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).rejects.toThrow(
      'already connected',
    );
  });

  describe('cancelConnect', () => {
    it('cancels a waiting connect, which rejects and writes nothing, then frees the slot', async () => {
      const browser = heldBrowser();
      const { db, service, changes } = setup({ openExternal: browser.openExternal });
      expect(service.cancelConnect()).toBe(false);

      const flow = service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
      await vi.waitFor(() => expect(browser.opened).toHaveBeenCalled());
      expect(service.cancelConnect()).toBe(true);

      await expect(flow).rejects.toMatchObject({
        name: 'ConnectCancelledError',
        code: 'cancelled',
      });
      expect(db.select().from(integrations).all()).toHaveLength(0);
      expect(server.tokenRequests).toHaveLength(0);
      expect(changes).toEqual([]);
      expect(service.cancelConnect()).toBe(false);

      browser.release();
      await expect(service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR)).resolves.toMatchObject({
        status: IntegrationStatus.CONNECTED,
      });
    });

    it('cancels a waiting OAuth reconnect, keeping the stored credentials', async () => {
      const { provider } = oauthProvider({
        authMethods: [AuthType.OAUTH, AuthType.API_KEY],
        getAccount: async (auth) => {
          if (auth.authorization === 'key' || /^Bearer access-\d+$/.test(auth.authorization)) {
            return ACCOUNT;
          }
          throw new IntegrationAuthError('rejected');
        },
      });
      const browser = heldBrowser();
      const { db, cipher, service } = setup({ provider, openExternal: browser.openExternal });
      const { id } = await service.connectWithApiKey(ProviderId.GOOGLE_CALENDAR, 'key');

      const flow = service.reconnect(id, { type: AuthType.OAUTH });
      await vi.waitFor(() => expect(browser.opened).toHaveBeenCalled());
      expect(service.cancelConnect()).toBe(true);

      await expect(flow).rejects.toBeInstanceOf(ConnectCancelledError);
      // the browser is never released: a late visit would reach the server during the next test
      expect(await storedCredentials(cipher, db, id)).toMatchObject({ apiKey: 'key' });
    });
  });

  describe('refresh', () => {
    // connects with an access token that expires inside the refresh margin
    async function connectExpiring() {
      const context = setup();
      server.expiresIn = TOKEN_REFRESH_MARGIN_MS / 1000 / 2;
      const integration = await context.service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
      server.expiresIn = 3600;
      return { ...context, id: integration.id };
    }

    function refreshRequests() {
      return server.tokenRequests.filter(
        (request) => request.params.get('grant_type') === 'refresh_token',
      );
    }

    it('refreshes an expiring token once under two concurrent callers', async () => {
      const { credentials, cipher, db, id } = await connectExpiring();
      const [first, second] = await Promise.all([credentials.getAuth(id), credentials.getAuth(id)]);
      expect(first).toEqual({ authorization: 'Bearer access-3' });
      expect(second).toEqual(first);
      expect(refreshRequests()).toHaveLength(1);
      expect(refreshRequests()[0].params.get('refresh_token')).toBe('refresh-2');
      // the new token is stored, so the next call needs no refresh
      await credentials.getAuth(id);
      expect(refreshRequests()).toHaveLength(1);
      expect((await storedCredentials(cipher, db, id)).accessToken).toBe('access-3');
    });

    it('keeps the old refresh token when the response has no new one', async () => {
      const { credentials, cipher, db, id } = await connectExpiring();
      server.rotateRefreshTokens = false;
      await credentials.getAuth(id);
      expect(await storedCredentials(cipher, db, id)).toMatchObject({
        accessToken: 'access-3',
        refreshToken: 'refresh-2',
      });
    });

    it('stores a rotated refresh token', async () => {
      const { credentials, cipher, db, id } = await connectExpiring();
      server.rotateRefreshTokens = true;
      await credentials.getAuth(id);
      expect((await storedCredentials(cipher, db, id)).refreshToken).toBe('refresh-3');
    });

    it('moves the integration to needs_reauth when the refresh is rejected', async () => {
      const { credentials, service, db, id, changes } = await connectExpiring();
      server.rejectRefresh = true;
      await expect(credentials.getAuth(id)).rejects.toThrow(IntegrationAuthError);
      expect(status(db, id)).toBe(IntegrationStatus.NEEDS_REAUTH);
      expect(service.getById(id).status).toBe(IntegrationStatus.NEEDS_REAUTH);
      expect(changes.at(-1)).toEqual({
        type: 'status_changed',
        integrationId: id,
        status: IntegrationStatus.NEEDS_REAUTH,
        previous: IntegrationStatus.CONNECTED,
      });
    });

    it('stays connected when the provider is only unreachable', async () => {
      const { credentials, db, id } = await connectExpiring();
      server.tokenStatus = 503;
      await expect(credentials.getAuth(id)).rejects.toThrow(ProviderUnavailableError);
      expect(status(db, id)).toBe(IntegrationStatus.CONNECTED);
    });
  });
});

describe('IntegrationService — markNeedsReauth', () => {
  it('moves only a connected integration, and reports it once', async () => {
    const db = createDb();
    const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
    const service = new IntegrationService(db, { credentials, providers: new Map() });
    const changes: IntegrationChange[] = [];
    service.onChange((change) => changes.push(change));
    const [connected, disabled] = db
      .insert(integrations)
      .values(
        [IntegrationStatus.CONNECTED, IntegrationStatus.DISABLED].map((status, i) => ({
          provider: ProviderId.GOOGLE_CALENDAR,
          authType: AuthType.OAUTH,
          accountId: `account-${i}`,
          accountLabel: 'ada@example.com',
          status,
          credentials: Buffer.alloc(0),
        })),
      )
      .returning()
      .all();

    service.markNeedsReauth(connected.id);
    service.markNeedsReauth(connected.id);
    service.markNeedsReauth(disabled.id);

    expect(service.getById(connected.id).status).toBe(IntegrationStatus.NEEDS_REAUTH);
    expect(service.getById(disabled.id).status).toBe(IntegrationStatus.DISABLED);
    expect(changes).toEqual([
      {
        type: 'status_changed',
        integrationId: connected.id,
        status: IntegrationStatus.NEEDS_REAUTH,
        previous: IntegrationStatus.CONNECTED,
      },
    ]);
  });
});

describe('Provider registry — OAuth', () => {
  it('lists OAuth in authMethods exactly when a shipped provider declares a config', () => {
    for (const provider of createProviderRegistry({ fetch }).values()) {
      expect(provider.authMethods.includes(AuthType.OAUTH)).toBe(provider.oauth !== undefined);
    }
  });

  it('builds a refresher for each provider that declares OAuth, and none for the rest', async () => {
    const oauthConfig = { tokenUrl: 'https://token.test' } as OAuthConfig;
    const refresh = vi.fn(async () => ({ accessToken: 'new', scopes: [] }));
    const client = { authorize: vi.fn(), refresh, revoke: vi.fn() };
    const base = { supports: [], getAccount: vi.fn() };
    const registry: ProviderRegistry = new Map<ProviderId, Provider>([
      [ProviderId.LINEAR, { ...base, id: ProviderId.LINEAR, authMethods: [AuthType.API_KEY] }],
      [
        ProviderId.GOOGLE_CALENDAR,
        {
          ...base,
          id: ProviderId.GOOGLE_CALENDAR,
          authMethods: [AuthType.OAUTH],
          oauth: oauthConfig,
        },
      ],
    ]);

    const refreshers = createTokenRefreshers(registry, client);
    expect(Object.keys(refreshers)).toEqual([ProviderId.GOOGLE_CALENDAR]);
    await refreshers[ProviderId.GOOGLE_CALENDAR]!('refresh-token');
    expect(refresh).toHaveBeenCalledWith(oauthConfig, 'refresh-token');
  });
});
