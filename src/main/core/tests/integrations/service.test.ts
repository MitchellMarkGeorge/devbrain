import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { IntegrationId, WorkspaceId } from '@common/ids';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { createDb, MIGRATIONS_PATH } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { scriptedFetch } from './linear/fake-fetch';
import viewerFixture from './fixtures/linear/viewer.json';
import authenticationErrorFixture from './fixtures/linear/authentication-error.json';
import { CredentialStore } from '../../integrations/credential-store';
import { Auth } from '../../integrations/auth';
import { ExternalAccount, Provider } from '../../integrations/providers/provider';
import { createProviderRegistry, ProviderRegistry } from '../../integrations/providers/registry';
import { IntegrationChange, IntegrationService } from '../../integrations/service';
import {
  AuthType,
  IntegrationStatus,
  Provider as ProviderId,
  SourceType,
} from '../../integrations/types';
import {
  IntegrationAlreadyConnectedError,
  IntegrationAuthError,
  IntegrationDisabledError,
  NotFoundError,
} from '../../shared/errors';
import { Workspace } from '../../workspace/workspace';
import type { WorkspaceInfo } from '../../workspace/types';

const API_KEY = 'lin_api_supersecretkey';
const ACCOUNT: ExternalAccount = {
  accountId: 'org-1:user-1',
  label: 'Ada Lovelace, Acme',
  userId: 'user-1',
};

// a provider whose getAccount answers from a script; records the auth it was handed
function fakeProvider(overrides: Partial<Provider> = {}) {
  const getAccount = vi.fn(async (auth: Auth): Promise<ExternalAccount> => {
    if (auth.authorization !== API_KEY) throw new IntegrationAuthError('rejected');
    return ACCOUNT;
  });
  const provider: Provider = {
    id: ProviderId.LINEAR,
    supports: [SourceType.TASKS],
    authMethods: [AuthType.API_KEY],
    getAccount,
    ...overrides,
  };
  return { provider, getAccount };
}

function registryOf(...providers: Provider[]): ProviderRegistry {
  return new Map(providers.map((provider) => [provider.id, provider]));
}

function setup(providers: ProviderRegistry = registryOf(fakeProvider().provider)) {
  const db = createDb();
  const cipher = new FakeCipher();
  const credentials = new CredentialStore(db, { cipher });
  const service = new IntegrationService(db, { credentials, providers });
  const changes: IntegrationChange[] = [];
  service.onChange((change) => changes.push(change));
  return { db, cipher, credentials, service, changes };
}

function countRows(db: BetterSQLite3Database) {
  return {
    integrations: db.select().from(integrations).all().length,
    sources: db.select().from(externalSources).all().length,
  };
}

function storedBlob(db: BetterSQLite3Database, id: IntegrationId): Buffer {
  return db
    .select({ credentials: integrations.credentials })
    .from(integrations)
    .where(eq(integrations.id, id))
    .get()!.credentials;
}

describe('IntegrationService — connectWithApiKey', () => {
  it('stores the integration, encrypted credentials and an enabled tasks source', async () => {
    const { db, credentials, service } = setup();

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);

    expect(integration).toMatchObject({
      provider: ProviderId.LINEAR,
      authType: AuthType.API_KEY,
      accountLabel: ACCOUNT.label,
      status: IntegrationStatus.CONNECTED,
    });
    expect(integration.id).toMatch(/^int_/);
    expect(integration.sources).toEqual([
      {
        id: expect.stringMatching(/^src_/),
        sourceType: SourceType.TASKS,
        enabled: true,
        initialSyncCompleted: false,
        lastSyncedAt: null,
        lastError: null,
        retryAt: null,
      },
    ]);

    const [row] = db.select().from(integrations).all();
    expect(row.accountId).toBe(ACCOUNT.accountId);
    expect(storedBlob(db, integration.id).includes(API_KEY)).toBe(false);
    expect(await credentials.getAuth(integration.id)).toEqual({ authorization: API_KEY });
  });

  it('returns no credential fields on the integration', async () => {
    const { service } = setup();
    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);
    expect(JSON.stringify(integration)).not.toContain(API_KEY);
    expect(integration).not.toHaveProperty('credentials');
  });

  it('creates one source per type the provider supports', async () => {
    const { provider } = fakeProvider({ supports: [SourceType.TASKS, SourceType.EVENTS] });
    const { service } = setup(registryOf(provider));

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);

    expect(integration.sources.map((source) => source.sourceType).sort()).toEqual([
      SourceType.EVENTS,
      SourceType.TASKS,
    ]);
    expect(integration.sources.every((source) => source.enabled)).toBe(true);
  });

  it('validates the trimmed key with the provider', async () => {
    const { provider, getAccount } = fakeProvider();
    const { service } = setup(registryOf(provider));

    await service.connectWithApiKey(ProviderId.LINEAR, `  ${API_KEY}\n`);

    expect(getAccount).toHaveBeenCalledWith({ authorization: API_KEY });
  });

  it('writes nothing when the provider rejects the key', async () => {
    const { db, service, changes } = setup();

    await expect(service.connectWithApiKey(ProviderId.LINEAR, 'lin_api_wrong')).rejects.toThrow(
      IntegrationAuthError,
    );

    expect(countRows(db)).toEqual({ integrations: 0, sources: 0 });
    expect(changes).toEqual([]);
  });

  it('writes nothing when Linear answers 401', async () => {
    const fetch = scriptedFetch([{ status: 401, body: authenticationErrorFixture }]);
    const { db, service } = setup(createProviderRegistry({ fetch }));

    await expect(service.connectWithApiKey(ProviderId.LINEAR, API_KEY)).rejects.toThrow(
      IntegrationAuthError,
    );
    expect(countRows(db)).toEqual({ integrations: 0, sources: 0 });
  });

  it('connects through the real Linear adapter with a bare key', async () => {
    const fetch = scriptedFetch([{ body: viewerFixture }]);
    const { db, service } = setup(createProviderRegistry({ fetch }));

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);

    expect(fetch.requests[0].headers.authorization).toBe(API_KEY);
    expect(integration.accountLabel).toBe('Ada Lovelace, Acme');
    const [row] = db.select().from(integrations).all();
    expect(row.accountId).toBe(
      '0f0e0d0c-0000-4000-8000-0000000000aa:a1b2c3d4-0000-4000-8000-000000000001',
    );
  });

  it('refuses to connect when secure storage is unavailable, and writes nothing', async () => {
    const { db, cipher, service } = setup();
    cipher.available = false;

    await expect(service.connectWithApiKey(ProviderId.LINEAR, API_KEY)).rejects.toThrow(
      IntegrationAuthError,
    );
    expect(countRows(db)).toEqual({ integrations: 0, sources: 0 });
  });

  it('rolls the integration back when creating a source fails', async () => {
    // the same source type twice breaks the (integration, type) unique constraint mid-transaction
    const { provider } = fakeProvider({ supports: [SourceType.TASKS, SourceType.TASKS] });
    const { db, service, changes } = setup(registryOf(provider));

    await expect(service.connectWithApiKey(ProviderId.LINEAR, API_KEY)).rejects.toThrow();
    expect(countRows(db)).toEqual({ integrations: 0, sources: 0 });
    expect(changes).toEqual([]);
  });

  it('rejects an empty key without calling the provider', async () => {
    const { provider, getAccount } = fakeProvider();
    const { service } = setup(registryOf(provider));

    await expect(service.connectWithApiKey(ProviderId.LINEAR, '   ')).rejects.toThrow(
      'An API key is required',
    );
    expect(getAccount).not.toHaveBeenCalled();
  });

  it('rejects a provider that is not registered', async () => {
    const { service } = setup(registryOf());
    await expect(service.connectWithApiKey(ProviderId.LINEAR, API_KEY)).rejects.toThrow(
      'No provider is registered for linear',
    );
  });

  it('rejects a provider that takes no API keys', async () => {
    const { provider, getAccount } = fakeProvider({
      id: ProviderId.GOOGLE_CALENDAR,
      authMethods: [AuthType.OAUTH],
    });
    const { service } = setup(registryOf(provider));

    await expect(service.connectWithApiKey(ProviderId.GOOGLE_CALENDAR, API_KEY)).rejects.toThrow(
      "google_calendar can't be connected with an API key",
    );
    expect(getAccount).not.toHaveBeenCalled();
  });

  it('emits one connected change with the new sources', async () => {
    const { service, changes } = setup();
    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);

    expect(changes).toEqual([
      {
        type: 'connected',
        integrationId: integration.id,
        sources: integration.sources.map((source) => ({ sourceId: source.id, enabled: true })),
      },
    ]);
  });
});

describe('IntegrationService — choosing sources at connect', () => {
  const twoRoles = () => fakeProvider({ supports: [SourceType.TASKS, SourceType.VERSION_CONTROL] });

  function enabledByType(integration: { sources: { sourceType: SourceType; enabled: boolean }[] }) {
    return Object.fromEntries(
      integration.sources.map((source) => [source.sourceType, source.enabled]),
    );
  }

  it('switches on only the chosen types and creates the rest disabled', async () => {
    const { service, changes } = setup(registryOf(twoRoles().provider));

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY, {
      enable: [SourceType.VERSION_CONTROL],
    });

    expect(enabledByType(integration)).toEqual({
      [SourceType.TASKS]: false,
      [SourceType.VERSION_CONTROL]: true,
    });
    const [change] = changes;
    expect(change.type === 'connected' && change.sources).toEqual(
      expect.arrayContaining(
        integration.sources.map((source) => ({ sourceId: source.id, enabled: source.enabled })),
      ),
    );
  });

  it('connects without syncing anything when no type is chosen', async () => {
    const { service } = setup(registryOf(twoRoles().provider));

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY, {
      enable: [],
    });

    expect(integration.status).toBe(IntegrationStatus.CONNECTED);
    expect(integration.sources).toHaveLength(2);
    expect(integration.sources.every((source) => !source.enabled)).toBe(true);
  });

  it('a source left off at connect can be switched on later', async () => {
    const { service, changes } = setup(registryOf(twoRoles().provider));
    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY, {
      enable: [SourceType.VERSION_CONTROL],
    });
    const tasks = integration.sources.find((source) => source.sourceType === SourceType.TASKS)!;

    await service.setSourceEnabled(tasks.id, true);

    expect(enabledByType(await service.getById(integration.id))).toEqual({
      [SourceType.TASKS]: true,
      [SourceType.VERSION_CONTROL]: true,
    });
    expect(changes.at(-1)).toEqual({
      type: 'source_changed',
      integrationId: integration.id,
      sourceId: tasks.id,
      enabled: true,
    });
  });

  it('rejects a type the provider does not serve, before calling it, and writes nothing', async () => {
    const { provider, getAccount } = fakeProvider();
    const { db, service } = setup(registryOf(provider));

    await expect(
      service.connectWithApiKey(ProviderId.LINEAR, API_KEY, { enable: [SourceType.EVENTS] }),
    ).rejects.toThrow("linear can't serve as a source for events");
    expect(getAccount).not.toHaveBeenCalled();
    expect(countRows(db)).toEqual({ integrations: 0, sources: 0 });
  });

  it('leaves task sources of other integrations as they are', async () => {
    // a second provider that also serves tasks stands in for a future GitHub
    const other = fakeProvider({ id: ProviderId.GOOGLE_CALENDAR }).provider;
    const { service } = setup(registryOf(fakeProvider().provider, other));

    const linear = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);
    await service.connectWithApiKey(ProviderId.GOOGLE_CALENDAR, API_KEY);

    const list = await service.list();
    expect(list).toHaveLength(2);
    // both serve tasks at once
    expect(list.every((integration) => enabledByType(integration)[SourceType.TASKS])).toBe(true);
    expect(enabledByType(await service.getById(linear.id))[SourceType.TASKS]).toBe(true);
  });
});

describe('IntegrationService — duplicate accounts', () => {
  it('rejects a second connection of the same account and keeps the first', async () => {
    const { db, service } = setup();
    const first = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);

    const error = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY).catch((e) => e);

    expect(error).toBeInstanceOf(IntegrationAlreadyConnectedError);
    expect(error.message).toBe(
      'Ada Lovelace, Acme is already connected to linear in this workspace',
    );
    expect(error.integrationId).toBe(first.id);
    expect(countRows(db)).toEqual({ integrations: 1, sources: 1 });
  });

  it('rejects the loser of two connects racing for the same account', async () => {
    const { db, service } = setup();

    const results = await Promise.allSettled([
      service.connectWithApiKey(ProviderId.LINEAR, API_KEY),
      service.connectWithApiKey(ProviderId.LINEAR, API_KEY),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(IntegrationAlreadyConnectedError);
    expect(countRows(db)).toEqual({ integrations: 1, sources: 1 });
  });

  it('allows a different account on the same provider', async () => {
    const { provider } = fakeProvider({
      getAccount: async (auth) => ({
        ...ACCOUNT,
        accountId: `org-1:${auth.authorization}`,
      }),
    });
    const { service } = setup(registryOf(provider));

    await service.connectWithApiKey(ProviderId.LINEAR, 'key-one');
    await service.connectWithApiKey(ProviderId.LINEAR, 'key-two');

    expect(await service.list()).toHaveLength(2);
  });
});

describe('IntegrationService — reads', () => {
  it('lists integrations with their sources, oldest first', async () => {
    const { provider } = fakeProvider({
      getAccount: async (auth) => ({ ...ACCOUNT, accountId: auth.authorization }),
    });
    const { service } = setup(registryOf(provider));
    const first = await service.connectWithApiKey(ProviderId.LINEAR, 'key-one');
    const second = await service.connectWithApiKey(ProviderId.LINEAR, 'key-two');

    const list = await service.list();

    expect(list.map((integration) => integration.id)).toEqual([first.id, second.id]);
    expect(list.every((integration) => integration.sources.length === 1)).toBe(true);
  });

  it('lists nothing in a new workspace', async () => {
    const { service } = setup();
    expect(await service.list()).toEqual([]);
  });

  it('getById throws NotFoundError for an unknown id', async () => {
    const { service } = setup();
    await expect(service.getById('int_missing' as IntegrationId)).rejects.toThrow(NotFoundError);
  });
});

describe('IntegrationService — enabling and disabling', () => {
  async function connected() {
    const context = setup();
    const integration = await context.service.connectWithApiKey(ProviderId.LINEAR, API_KEY);
    context.changes.length = 0;
    return { ...context, integration };
  }

  it('disabling the integration switches its sources off too and emits each change', async () => {
    const { service, changes, integration } = await connected();
    const [source] = integration.sources;

    const disabled = await service.setEnabled(integration.id, false);

    expect(disabled.status).toBe(IntegrationStatus.DISABLED);
    expect(disabled.sources[0].enabled).toBe(false);
    expect(changes).toEqual([
      {
        type: 'status_changed',
        integrationId: integration.id,
        status: IntegrationStatus.DISABLED,
      },
      {
        type: 'source_changed',
        integrationId: integration.id,
        sourceId: source.id,
        enabled: false,
      },
    ]);
  });

  it('enabling a disabled integration reconnects it and switches its sources back on', async () => {
    const { service, changes, integration } = await connected();
    await service.setEnabled(integration.id, false);

    const enabled = await service.setEnabled(integration.id, true);

    expect(enabled.status).toBe(IntegrationStatus.CONNECTED);
    expect(enabled.sources[0].enabled).toBe(true);
    expect(changes.map((change) => change.type)).toEqual([
      'status_changed',
      'source_changed',
      'status_changed',
      'source_changed',
    ]);
  });

  it('enabling can switch back on only the chosen source types', async () => {
    const { provider } = fakeProvider({ supports: [SourceType.TASKS, SourceType.VERSION_CONTROL] });
    const { service, changes } = setup(registryOf(provider));
    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);
    await service.setEnabled(integration.id, false);
    changes.length = 0;

    const enabled = await service.setEnabled(integration.id, true, {
      enable: [SourceType.VERSION_CONTROL],
    });

    const flags = Object.fromEntries(enabled.sources.map((s) => [s.sourceType, s.enabled]));
    expect(flags).toEqual({ [SourceType.TASKS]: false, [SourceType.VERSION_CONTROL]: true });
    expect(changes.filter((change) => change.type === 'source_changed')).toHaveLength(1);
  });

  it('enabling with no chosen types reconnects with every source off', async () => {
    const { service, integration } = await connected();
    await service.setEnabled(integration.id, false);

    const enabled = await service.setEnabled(integration.id, true, { enable: [] });

    expect(enabled.status).toBe(IntegrationStatus.CONNECTED);
    expect(enabled.sources.every((source) => !source.enabled)).toBe(true);
  });

  it('rejects a source type the integration lacks, and changes nothing', async () => {
    const { service, changes, integration } = await connected();

    await expect(
      service.setEnabled(integration.id, false, { enable: [SourceType.EVENTS] }),
    ).rejects.toThrow(`${integration.id} has no events source`);
    expect((await service.getById(integration.id)).status).toBe(IntegrationStatus.CONNECTED);
    expect(changes).toEqual([]);
  });

  it('a source of a disabled integration cannot be switched on', async () => {
    const { service, integration } = await connected();
    await service.setEnabled(integration.id, false);

    const error = await service
      .setSourceEnabled(integration.sources[0].id, true)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IntegrationDisabledError);
    expect((await service.getById(integration.id)).sources[0].enabled).toBe(false);
  });

  it('a source can still be switched off while its integration needs re-authentication', async () => {
    const { db, service, integration } = await connected();
    db.update(integrations)
      .set({ status: IntegrationStatus.NEEDS_REAUTH })
      .where(eq(integrations.id, integration.id))
      .run();

    const source = await service.setSourceEnabled(integration.sources[0].id, false);
    expect(source.enabled).toBe(false);
    expect((await service.setSourceEnabled(source.id, true)).enabled).toBe(true);
  });

  it('emits nothing when the status does not change', async () => {
    const { service, changes, integration } = await connected();
    await service.setEnabled(integration.id, true);
    expect(changes).toEqual([]);
  });

  it('enabling leaves an integration that needs re-authentication as it is', async () => {
    const { db, service, changes, integration } = await connected();
    db.update(integrations)
      .set({ status: IntegrationStatus.NEEDS_REAUTH })
      .where(eq(integrations.id, integration.id))
      .run();

    expect((await service.setEnabled(integration.id, true)).status).toBe(
      IntegrationStatus.NEEDS_REAUTH,
    );
    expect(changes).toEqual([]);
    const disabled = await service.setEnabled(integration.id, false);
    expect(disabled.status).toBe(IntegrationStatus.DISABLED);
    expect(disabled.sources[0].enabled).toBe(false);
  });

  it('setEnabled throws NotFoundError for an unknown id', async () => {
    const { service } = setup();
    await expect(service.setEnabled('int_missing' as IntegrationId, false)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('disabling a source flips its flag and emits the change', async () => {
    const { service, changes, integration } = await connected();
    const [source] = integration.sources;

    const disabled = await service.setSourceEnabled(source.id, false);

    expect(disabled).toEqual({ ...source, enabled: false });
    expect((await service.getById(integration.id)).sources[0].enabled).toBe(false);
    // the integration itself stays connected
    expect((await service.getById(integration.id)).status).toBe(IntegrationStatus.CONNECTED);
    expect(changes).toEqual([
      {
        type: 'source_changed',
        integrationId: integration.id,
        sourceId: source.id,
        enabled: false,
      },
    ]);
  });

  it('re-enabling a source emits again; an unchanged flag emits nothing', async () => {
    const { service, changes, integration } = await connected();
    const [source] = integration.sources;

    await service.setSourceEnabled(source.id, true);
    expect(changes).toEqual([]);

    await service.setSourceEnabled(source.id, false);
    await service.setSourceEnabled(source.id, true);
    expect(changes.map((change) => change.type === 'source_changed' && change.enabled)).toEqual([
      false,
      true,
    ]);
  });

  it('setSourceEnabled throws NotFoundError for an unknown id', async () => {
    const { service } = setup();
    await expect(service.setSourceEnabled('src_missing' as never, false)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('IntegrationService — onChange', () => {
  it('stops calling a listener once it unsubscribes', async () => {
    const { service } = setup();
    const listener = vi.fn();
    const unsubscribe = service.onChange(listener);

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);
    unsubscribe();
    await service.setEnabled(integration.id, false);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener neither fails the call nor stops the others', async () => {
    const { service, changes } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.onChange(() => {
      throw new Error('listener failed');
    });
    const after = vi.fn();
    service.onChange(after);

    const integration = await service.connectWithApiKey(ProviderId.LINEAR, API_KEY);

    expect(integration.status).toBe(IntegrationStatus.CONNECTED);
    expect(changes).toHaveLength(1);
    expect(after).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

describe('IntegrationService — workspaces', () => {
  let tmpDir: string;

  const makeInfo = (name: string): WorkspaceInfo => ({
    id: `wsp_${name}` as WorkspaceId,
    name,
    color: '#000000',
    path: path.join(tmpDir, name),
    createdAt: Date.now(),
    lastOpenedAt: null,
  });

  beforeAll(() => {
    process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-integrations-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  async function createWorkspace(name: string, cipher: FakeCipher, fetch = scriptedFetch([])) {
    const info = makeInfo(name);
    await fs.mkdir(info.path);
    return { info, workspace: await Workspace.create(info, { cipher, fetch }) };
  }

  it('connecting in one workspace leaves the other empty', async () => {
    const cipher = new FakeCipher();
    const a = await createWorkspace('a', cipher, scriptedFetch([{ body: viewerFixture }]));
    const b = await createWorkspace('b', cipher);

    try {
      await a.workspace.integrations.connectWithApiKey(ProviderId.LINEAR, API_KEY);

      expect(await a.workspace.integrations.list()).toHaveLength(1);
      expect(await b.workspace.integrations.list()).toEqual([]);
    } finally {
      a.workspace.close();
      b.workspace.close();
    }
  });

  it('the same account can be connected in two workspaces', async () => {
    const cipher = new FakeCipher();
    const a = await createWorkspace('a', cipher, scriptedFetch([{ body: viewerFixture }]));
    const b = await createWorkspace('b', cipher, scriptedFetch([{ body: viewerFixture }]));

    try {
      const inA = await a.workspace.integrations.connectWithApiKey(ProviderId.LINEAR, API_KEY);
      const inB = await b.workspace.integrations.connectWithApiKey(ProviderId.LINEAR, API_KEY);
      expect(inA.id).not.toBe(inB.id);
    } finally {
      a.workspace.close();
      b.workspace.close();
    }
  });

  it('the connection survives closing and reopening the workspace', async () => {
    const cipher = new FakeCipher();
    const { info, workspace } = await createWorkspace(
      'a',
      cipher,
      scriptedFetch([{ body: viewerFixture }]),
    );
    const connected = await workspace.integrations.connectWithApiKey(ProviderId.LINEAR, API_KEY);
    workspace.close();

    const reopened = await Workspace.open(info, { cipher });
    try {
      expect(await reopened.integrations.list()).toEqual([connected]);
    } finally {
      reopened.close();
    }
  });

  it('a workspace opened without a cipher refuses to connect and writes nothing', async () => {
    const info = makeInfo('plain');
    await fs.mkdir(info.path);
    const workspace = await Workspace.create(info, {
      fetch: scriptedFetch([{ body: viewerFixture }]),
    });

    try {
      await expect(
        workspace.integrations.connectWithApiKey(ProviderId.LINEAR, API_KEY),
      ).rejects.toThrow(IntegrationAuthError);
      expect(await workspace.integrations.list()).toEqual([]);
    } finally {
      workspace.close();
    }
  });
});
