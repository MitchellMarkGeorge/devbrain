import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS_PATH, migrationsWithExtra } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { WorkspaceService } from '../../workspace/service';
import { Workspace } from '../../workspace/workspace';
import type { WorkspaceInfo, WorkspaceOptions } from '../../workspace/types';
import { WorkspaceClosedError, WorkspaceMigrationError } from '../../shared/errors';
import type { OAuthConfig, OpenExternal } from '../../integrations/oauth/types';
import type { ExternalAccount } from '../../integrations/providers/provider';
import { AuthType, Provider, SourceType } from '../../integrations/types';
import { FakeAuthServer, fakeBrowser } from '../integrations/oauth/fake-auth-server';

// WorkspaceService over real workspaces in a temp folder: opens, switches, closes and deletes that
// overlap. Timing is held with deferred promises around the real Workspace.open, never with sleeps.

let tmpDir: string;

beforeAll(() => {
  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-lifecycle-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

// a service with two registered workspaces, both closed
async function setup(options: WorkspaceOptions = {}) {
  const service = new WorkspaceService(tmpDir, { cipher: new FakeCipher(), ...options });
  const infos: WorkspaceInfo[] = [];
  for (const name of ['A', 'B']) {
    const created = await service.create({ name, color: '#000000' });
    await created.close();
    infos.push(created.info);
  }
  return { service, a: infos[0].id, b: infos[1].id };
}

// Records every workspace Workspace.open hands out. With `hold`, each open finishes opening the
// database and then waits for it, so a test can act while an open is in flight; `opening` resolves
// once the database is open.
function trackOpens(hold?: Promise<void>) {
  const realOpen = Workspace.open.bind(Workspace);
  const opened: Workspace[] = [];
  const opening = deferred();
  vi.spyOn(Workspace, 'open').mockImplementation(async (info, options) => {
    const workspace = await realOpen(info, options);
    opened.push(workspace);
    opening.resolve();
    if (hold) await hold;
    return workspace;
  });
  return { opened, opening: opening.promise };
}

// whether the workspace's database still answers, i.e. it was never closed
async function isOpen(workspace: Workspace): Promise<boolean> {
  return workspace.tasks.listTasks().then(
    () => true,
    () => false,
  );
}

// the scheduler's own flag; its only public trace is that triggers do nothing once stopped
function isSyncing(workspace: Workspace): boolean {
  return (workspace.sync as unknown as { isStarted: boolean }).isStarted;
}

describe('WorkspaceService — overlapping lifecycle calls', () => {
  it('runs two opens at once in order: the second closes the first', async () => {
    const { service, a, b } = await setup();
    const { opened } = trackOpens();

    const [first, second] = await Promise.all([service.open(a), service.open(b)]);
    expect(first.info.id).toBe(a);
    expect(second.info.id).toBe(b);
    expect(service.currentWorkspace).toBe(second);
    expect(opened).toEqual([first, second]);
    expect(await isOpen(first)).toBe(false);
    expect(isSyncing(first)).toBe(false);

    await service.close();
    expect(await isOpen(second)).toBe(false);
    expect(isSyncing(second)).toBe(false);
  });

  it('a switch during an open closes the workspace that open opened', async () => {
    const { service, a, b } = await setup();
    const hold = deferred();
    const { opened, opening } = trackOpens(hold.promise);

    const first = service.open(a);
    await opening;
    const second = service.switch(b);
    hold.resolve();

    await first;
    expect((await second).info.id).toBe(b);
    expect(opened).toHaveLength(2);
    expect(await isOpen(opened[0])).toBe(false);
    expect(service.currentWorkspace).toBe(opened[1]);
    await service.close();
  });

  it('a close during an open waits for it and closes what it opened', async () => {
    const { service, a } = await setup();
    const hold = deferred();
    const { opened, opening } = trackOpens(hold.promise);

    const open = service.open(a);
    await opening;
    // nothing is current yet, so the trigger forwarding sees no workspace
    expect(service.currentWorkspace).toBeNull();
    let closed = false;
    const closing = service.close().then(() => (closed = true));
    // close is queued behind the open, not returning at once because nothing is current
    await Promise.resolve();
    expect(closed).toBe(false);

    hold.resolve();
    await open;
    await closing;
    expect(service.currentWorkspace).toBeNull();
    expect(await isOpen(opened[0])).toBe(false);
    expect(isSyncing(opened[0])).toBe(false);
  });

  it('a failed open does not block the next one', async () => {
    const { service, a, b } = await setup();
    // a migration that fails makes every open throw WorkspaceMigrationError until it is removed
    process.env.DB_MIGRATIONS_PATH = migrationsWithExtra(
      path.join(tmpDir, 'broken'),
      'broken',
      'SELECT * FROM no_such_table;',
    );

    const failed = service.open(a);
    const next = service.open(b);
    await expect(failed).rejects.toBeInstanceOf(WorkspaceMigrationError);
    await expect(next).rejects.toBeInstanceOf(WorkspaceMigrationError);
    expect(service.currentWorkspace).toBeNull();

    process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
    const workspace = await service.open(b);
    expect(service.currentWorkspace).toBe(workspace);
    expect(isSyncing(workspace)).toBe(true);
    await service.close();
  });

  it('a delete during an open of that workspace waits for it, then deletes it', async () => {
    const { service, a } = await setup();
    const hold = deferred();
    const { opened, opening } = trackOpens(hold.promise);

    const open = service.open(a);
    await opening;
    const deleting = service.delete(a);
    hold.resolve();

    await open;
    await deleting;
    expect(service.currentWorkspace).toBeNull();
    expect(await isOpen(opened[0])).toBe(false);
    expect(isSyncing(opened[0])).toBe(false);
    expect(service.listAll().items.map((info) => info.id)).not.toContain(a);
    await expect(fs.stat(opened[0].info.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('an open queued behind a delete of the same workspace fails and leaves none open', async () => {
    const { service, a } = await setup();
    await service.open(a);

    const deleting = service.delete(a);
    const reopening = service.open(a);
    await deleting;
    await expect(reopening).rejects.toThrow();
    expect(service.currentWorkspace).toBeNull();
  });
});

describe('Workspace.close — OAuth connect in flight', () => {
  const CLIENT = { clientId: 'calendar-client', clientSecret: 'calendar-secret' };
  const ACCOUNT: ExternalAccount = {
    accountId: 'subject-1',
    label: 'ada@example.com',
    userId: 'subject-1',
  };
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

  // a browser that waits on `consent` before following the sign-in page, as a user would
  function browserWaitingOn(consent: Promise<void>) {
    const browser = fakeBrowser();
    const shown = deferred();
    const openExternal: OpenExternal = async (url) => {
      shown.resolve();
      await consent;
      await browser.openExternal(url);
    };
    return { openExternal, shown: shown.promise };
  }

  it('rejects the connect with WorkspaceClosedError and writes nothing', async () => {
    const consent = deferred();
    const browser = browserWaitingOn(consent.promise);
    const providers = new Map([
      [
        Provider.GOOGLE_CALENDAR,
        {
          id: Provider.GOOGLE_CALENDAR,
          supports: [SourceType.EVENTS],
          authMethods: [AuthType.OAUTH],
          oauth: config,
          getAccount: async () => ACCOUNT,
        },
      ],
    ]);
    const { service, a } = await setup({ providers, openExternal: browser.openExternal });
    const workspace = await service.open(a);

    const connecting = workspace.integrations.connectWithOAuth(Provider.GOOGLE_CALENDAR);
    // seen however it settles, so an early rejection is not reported as unhandled
    const outcome = connecting.then(
      () => null,
      (error: unknown) => error,
    );
    await browser.shown;
    await service.close();

    // the user grants consent after the workspace has closed
    consent.resolve();
    const error = await outcome;
    expect(error).toBeInstanceOf(WorkspaceClosedError);
    expect(error).toMatchObject({ code: 'workspace_closed' });
    // no code was exchanged, and the database holds no integration
    expect(server.tokenRequests).toHaveLength(0);
    const sqlite = new Database(path.join(workspace.info.path, 'db.sqlite'), { readonly: true });
    try {
      expect(sqlite.prepare('SELECT count(*) AS n FROM integrations').get()).toEqual({ n: 0 });
    } finally {
      sqlite.close();
    }
  });
});
