import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { AppEventName, AppEvents } from '@common/events';
import { generateId, type ExternalSourceId } from '@common/ids';
import type { IpcResult } from '@common/ipc/types';
import type { DevBrain, Workspace } from '@main/core';
import type { Auth } from '@main/core/integrations/auth';
import type { OAuthConfig, OpenExternal } from '@main/core/integrations/oauth/types';
import type { ExternalAccount } from '@main/core/integrations/providers/provider';
import type { Calendar } from '@main/core/calendars/types';
import { DEFAULT_CALENDAR_ID } from '@main/core/calendars/types';
import {
  AuthType,
  IntegrationStatus,
  Provider,
  type ExternalTask,
  type Integration,
} from '@main/core/integrations/types';
import { IntegrationAuthError } from '@main/core/shared/errors';
import type { SourceSyncStatus } from '@main/core/sync/scheduler';
import { TaskPriority, TaskStatus } from '@main/core/tasks/types';
import { FakeCipher } from '@main/core/tests/__mocks__/fake-cipher';
import { FakeAuthServer, fakeBrowser } from '@main/core/tests/integrations/oauth/fake-auth-server';
import {
  createFakeCalendarProvider,
  createFakeProvider,
  FAKE_API_KEY,
  fakeRegistry,
  type FakeProvider,
} from '@main/core/tests/sync/fake-provider';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// The integrations, sources, sync and calendars routes end to end: through the transport, over a
// real DevBrain folder with fake providers, a fake OAuth server and a change tracker watching it.

const CLIENT = { clientId: 'calendar-client', clientSecret: 'calendar-secret' };
const CALENDAR_ACCOUNT: ExternalAccount = {
  accountId: 'subject-1',
  label: 'ada@example.com',
  userId: 'subject-1',
};

let server: FakeAuthServer;
let oauthConfig: OAuthConfig;
let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let linear: FakeProvider;
// the system browser the OAuth flow opens: by default one that signs in at once
let browser: OpenExternal;
let sendToWindows: Mock<
  (name: AppEventName, payload: AppEvents[AppEventName], skipWindow?: unknown) => void
>;

beforeAll(async () => {
  server = await FakeAuthServer.start(CLIENT);
  oauthConfig = {
    ...CLIENT,
    authorizeUrl: server.authorizeUrl,
    tokenUrl: server.tokenUrl,
    revokeUrl: server.revokeUrl,
    scopes: ['calendar'],
    redirect: { ports: 'any', path: '/callback' },
  };
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  server.reset();
  browser = fakeBrowser().openExternal;
  linear = createFakeProvider();
  // the reconcile pass of a manual sync finds every task still assigned
  linear.tasks.assigned = [];
  linear.tasks.respondToLookup = () => ({});
  const calendar = {
    ...createFakeCalendarProvider(),
    oauth: oauthConfig,
    // accepts any token the fake server issued
    async getAccount(auth: Auth) {
      if (!/^Bearer access-\d+$/.test(auth.authorization)) {
        throw new IntegrationAuthError('rejected');
      }
      return CALENDAR_ACCOUNT;
    },
  };
  ({ devBrain, cleanup } = await tempDevBrain({
    cipher: new FakeCipher(),
    providers: fakeRegistry(linear, calendar),
    openExternal: (url) => browser(url),
  }));
  await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
  sendToWindows = vi.fn();
  const tracker = new ChangeTracker(sendToWindows);
  tracker.watch(devBrain);
  attachRouter(appRouter, { createContext: testContext(devBrain), changeTracker: tracker });
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

function workspace(): Workspace {
  return devBrain.currentWorkspace!;
}

const code = (result: IpcResult<unknown>) => (result.ok ? undefined : result.error.data.code);

function data<T>(result: IpcResult<unknown>): T {
  if (!result.ok) throw new Error(`call failed: ${result.error.data.code}`);
  return result.data as T;
}

// the payloads of every `name` event sent so far
function sent<K extends AppEventName>(name: K): AppEvents[K][] {
  return sendToWindows.mock.calls
    .filter(([sentName]) => sentName === name)
    .map(([, payload]) => payload as AppEvents[K]);
}

let issueCount = 0;
function issue(): ExternalTask {
  issueCount += 1;
  return {
    externalId: `issue-${issueCount}`,
    key: `ENG-${issueCount}`,
    url: `https://linear.app/acme/issue/ENG-${issueCount}`,
    title: `Issue ${issueCount}`,
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
  };
}

// Connects Linear with the fake's key, its first sync pulling one page of `tasks`, and waits for
// that sync to end.
async function connectLinear(tasks: ExternalTask[] = []): Promise<Integration> {
  linear.tasks.script({ tasks });
  const integration = data<Integration>(
    await call(
      'integrations.connect',
      { auth: 'api_key', provider: 'linear', apiKey: FAKE_API_KEY },
      'mutation',
    ),
  );
  const [source] = integration.sources;
  await vi.waitFor(() => expect(sent('sources.changed')).toContainEqual({ sourceId: source.id }));
  return integration;
}

// connects the calendar provider through the fake OAuth server, and waits for its first sync to
// list the account's calendars
async function connectCalendar(): Promise<Integration> {
  const integration = data<Integration>(
    await call('integrations.connect', { auth: 'oauth', provider: 'google_calendar' }, 'mutation'),
  );
  const [source] = integration.sources;
  await vi.waitFor(() => expect(sent('sources.changed')).toContainEqual({ sourceId: source.id }));
  return integration;
}

describe('integrations', () => {
  it('connects with an API key, returning the integration without its credentials', async () => {
    // answered after the response, as a provider over the network would be
    linear.tasks.script({ tasks: [issue()], delayMs: 20 });

    const result = await call(
      'integrations.connect',
      { auth: 'api_key', provider: 'linear', apiKey: FAKE_API_KEY },
      'mutation',
    );

    const integration = data<Integration>(result);
    expect(integration).toMatchObject({
      provider: Provider.LINEAR,
      authType: AuthType.API_KEY,
      status: IntegrationStatus.CONNECTED,
      sources: [{ sourceType: 'tasks', enabled: true }],
    });
    expect(JSON.stringify(result)).not.toContain(FAKE_API_KEY);
    expect([...result.changed].sort()).toEqual(['externalSource', 'integration']);
    expect(sent('integrations.changed')).toEqual([
      { integrationId: integration.id, type: 'connected' },
    ]);

    // the first sync runs after the response, and reaches the windows as events
    const sourceId = integration.sources[0].id;
    await vi.waitFor(() => expect(sent('sources.changed')).toContainEqual({ sourceId }));
    expect(sent('sync.progress')).toEqual([{ sourceId, phase: 'initial', itemsApplied: 1 }]);
    // batched to the end of the turn
    await vi.waitFor(() =>
      expect(sent('db.changes').flatMap(({ entities }) => entities)).toContain('task'),
    );
    expect(data(await call('integrations.list'))).toEqual([
      expect.objectContaining({ id: integration.id }),
    ]);
    expect(data(await call('integrations.get', { id: integration.id }))).toMatchObject({
      id: integration.id,
    });
  });

  it("passes core's errors to the renderer with their fields", async () => {
    const rejected = await call(
      'integrations.connect',
      { auth: 'api_key', provider: 'linear', apiKey: 'wrong' },
      'mutation',
    );
    expect(rejected).toMatchObject({ ok: false, changed: [] });
    expect(code(rejected)).toBe('integration_auth');

    const { id } = await connectLinear();
    const again = await call(
      'integrations.connect',
      { auth: 'api_key', provider: 'linear', apiKey: FAKE_API_KEY },
      'mutation',
    );
    expect(code(again)).toBe('integration_already_connected');
    expect(!again.ok && again.error.data.data).toMatchObject({ integrationId: id });

    expect(code(await call('integrations.get', { id: generateId('integration') }))).toBe(
      'not_found',
    );
    expect(code(await call('integrations.get', { id: 'tsk_nope' }))).toBe('invalid_input');
  });

  it('connects through OAuth once the browser flow ends', async () => {
    const integration = await connectCalendar();

    expect(integration).toMatchObject({
      provider: Provider.GOOGLE_CALENDAR,
      authType: AuthType.OAUTH,
      accountLabel: 'ada@example.com',
    });
    expect(JSON.stringify(integration)).not.toMatch(/access-\d|refresh-\d/);
  });

  it('fails a pending OAuth connect with cancelled when cancelConnect is called', async () => {
    const opened = vi.fn(async () => {});
    // a browser that never signs in
    browser = opened;

    const pending = call(
      'integrations.connect',
      { auth: 'oauth', provider: 'google_calendar' },
      'mutation',
    );
    await vi.waitFor(() => expect(opened).toHaveBeenCalledOnce());
    // one flow per workspace
    expect(
      code(
        await call(
          'integrations.connect',
          { auth: 'oauth', provider: 'google_calendar' },
          'mutation',
        ),
      ),
    ).toBe('connect_in_progress');

    expect(await call('integrations.cancelConnect', undefined, 'mutation')).toMatchObject({
      ok: true,
      data: true,
    });
    const result = await pending;
    expect(code(result)).toBe('cancelled');
    expect(result.changed).toEqual([]);
    expect(data(await call('integrations.list'))).toEqual([]);
    // nothing is waiting any more, and a new flow can start
    expect(await call('integrations.cancelConnect', undefined, 'mutation')).toMatchObject({
      data: false,
    });
  });

  it('reconnects with a new API key, keeping the integration', async () => {
    const { id } = await connectLinear();
    linear.tasks.script({});

    const result = await call(
      'integrations.reconnect',
      { auth: 'api_key', id, apiKey: FAKE_API_KEY },
      'mutation',
    );

    expect(data(result)).toMatchObject({ id, status: IntegrationStatus.CONNECTED });
    expect(result.changed).toContain('integration');
    expect(sent('integrations.changed')).toContainEqual({
      integrationId: id,
      type: 'status_changed',
    });
    expect(
      code(
        await call('integrations.reconnect', { auth: 'api_key', id, apiKey: 'wrong' }, 'mutation'),
      ),
    ).toBe('integration_auth');
  });

  it('disables an integration with its sources, sending the status deltas', async () => {
    const { id, sources } = await connectLinear();
    sendToWindows.mockClear();

    const result = await call('integrations.setEnabled', { id, enabled: false }, 'mutation');

    expect(data(result)).toMatchObject({
      status: IntegrationStatus.DISABLED,
      sources: [{ enabled: false }],
    });
    expect([...result.changed].sort()).toEqual(['externalSource', 'integration']);
    expect(sent('integrations.changed')).toEqual([
      { integrationId: id, type: 'status_changed' },
      { integrationId: id, type: 'source_changed' },
    ]);
    expect(sent('sources.changed')).toEqual([{ sourceId: sources[0].id }]);
  });

  it('previews a disconnect, then disconnects', async () => {
    const { id } = await connectLinear([issue(), issue()]);

    expect(data(await call('integrations.previewDisconnect', { id }))).toMatchObject({
      deleted: { tasks: 2 },
      kept: { tasks: 0 },
    });

    const result = await call('integrations.disconnect', { id, keepLocalCopies: true }, 'mutation');

    expect(data(result)).toMatchObject({
      deleted: { tasks: 0 },
      kept: { tasks: 2 },
      revoked: false,
    });
    expect(result.changed).toEqual(
      expect.arrayContaining(['integration', 'externalSource', 'task']),
    );
    expect(sent('integrations.changed')).toContainEqual({
      integrationId: id,
      type: 'disconnected',
    });
    expect(data(await call('integrations.list'))).toEqual([]);
    expect(
      code(await call('integrations.disconnect', { id, keepLocalCopies: true }, 'mutation')),
    ).toBe('not_found');
  });
});

describe('sources', () => {
  it('switches a source off and on', async () => {
    const { sources } = await connectLinear();
    const sourceId = sources[0].id;
    sendToWindows.mockClear();

    const result = await call('sources.setEnabled', { id: sourceId, enabled: false }, 'mutation');

    expect(data(result)).toMatchObject({ id: sourceId, enabled: false });
    expect([...result.changed].sort()).toEqual(['externalSource', 'integration']);
    expect(sent('sources.changed')).toEqual([{ sourceId }]);
  });

  it('refuses to switch on a source of a disabled integration', async () => {
    const { id, sources } = await connectLinear();
    await call('integrations.setEnabled', { id, enabled: false }, 'mutation');

    const result = await call(
      'sources.setEnabled',
      { id: sources[0].id, enabled: true },
      'mutation',
    );

    expect(code(result)).toBe('integration_disabled');
    expect(result.changed).toEqual([]);
    expect(
      code(
        await call(
          'sources.setEnabled',
          { id: generateId('externalSource'), enabled: true },
          'mutation',
        ),
      ),
    ).toBe('not_found');
  });
});

describe('sync', () => {
  it('syncs a source now, returning what the run wrote', async () => {
    const { sources } = await connectLinear();
    const sourceId: ExternalSourceId = sources[0].id;
    const task = issue();
    linear.tasks.script({ tasks: [task] });
    linear.tasks.assigned = [task.externalId];
    sendToWindows.mockClear();

    const result = await call('sync.now', { sourceId }, 'mutation');

    expect(result).toMatchObject({ ok: true });
    expect(result.changed).toEqual(expect.arrayContaining(['task', 'externalSource']));
    expect(sent('sync.progress')).toContainEqual({
      sourceId,
      phase: 'incremental',
      itemsApplied: 1,
    });
    expect(sent('sources.changed')).toContainEqual({ sourceId });

    const status = data<SourceSyncStatus[]>(await call('sync.status'));
    expect(status).toEqual([
      expect.objectContaining({
        sourceId,
        provider: Provider.LINEAR,
        enabled: true,
        running: false,
        lastError: null,
      }),
    ]);
    expect(code(await call('sync.now', { sourceId: 'src' }, 'mutation'))).toBe('invalid_input');
  });

  it('syncs every source when none is named', async () => {
    await connectLinear();
    linear.tasks.script({});

    expect(await call('sync.now', undefined, 'mutation')).toMatchObject({ ok: true });
    expect(linear.tasks.pending).toBe(0);
  });
});

describe('calendars', () => {
  it('lists calendars and shows or hides one', async () => {
    expect(data<Calendar[]>(await call('calendars.list')).map(({ id }) => id)).toEqual([
      DEFAULT_CALENDAR_ID,
    ]);

    const result = await call(
      'calendars.setVisible',
      { id: DEFAULT_CALENDAR_ID, visible: false },
      'mutation',
    );

    expect(data(result)).toMatchObject({ id: DEFAULT_CALENDAR_ID, visible: false });
    expect(result.changed).toEqual(['calendar']);
    expect(
      code(
        await call(
          'calendars.setVisible',
          { id: generateId('calendar'), visible: true },
          'mutation',
        ),
      ),
    ).toBe('not_found');
  });

  it('refuses to deselect a local calendar', async () => {
    const result = await call(
      'calendars.setSelected',
      { id: DEFAULT_CALENDAR_ID, selected: false },
      'mutation',
    );

    expect(code(result)).toBe('invalid_input');
    expect(result.changed).toEqual([]);
  });

  it('selects a synced calendar and syncs its source', async () => {
    const { sources } = await connectCalendar();
    const synced = data<Calendar[]>(await call('calendars.list')).find(
      (calendar) => calendar.sourceId !== null,
    )!;
    expect(synced.sourceId).toBe(sources[0].id);
    const syncNow = vi.spyOn(workspace().sync, 'syncNow');

    const result = await call(
      'calendars.setSelected',
      { id: synced.id, selected: false },
      'mutation',
    );

    expect(data(result)).toMatchObject({ id: synced.id, selected: false });
    expect(result.changed).toContain('calendar');
    expect(syncNow).toHaveBeenCalledExactlyOnceWith(sources[0].id);
  });
});
