// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { CalendarId, ExternalSourceId, IntegrationId, WorkspaceId } from '@common/ids';
import {
  AuthType,
  IntegrationStatus,
  Provider,
  SourceType,
  type Calendar,
  type Integration,
  type SourceSyncStatus,
} from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The integrations page: an account per integration with its sources and their status, the
// switches, Choose calendars, Disconnect with its preview, Connect (Linear's key, rejected; Google's
// sign-in, waiting and cancelled), Reconnect, the switches locked while one runs, live status
// from the push events, and the offer to reattach the tasks a disconnect kept.

const WORK = 'wsp_work' as WorkspaceId;
const SYNCED = new Date(Date.now() - 3 * 60_000);

afterEach(() => stopApps());

function linear(extra: Partial<Integration> = {}): Integration {
  return {
    id: 'int_linear' as IntegrationId,
    provider: Provider.LINEAR,
    authType: AuthType.API_KEY,
    accountLabel: 'Mitchell George · Acme',
    status: IntegrationStatus.CONNECTED,
    sources: [
      {
        id: 'src_tasks' as ExternalSourceId,
        sourceType: SourceType.TASKS,
        enabled: true,
        initialSyncCompleted: true,
        lastSyncedAt: SYNCED,
        lastError: null,
        retryAt: null,
      },
    ],
    createdAt: SYNCED,
    updatedAt: SYNCED,
    ...extra,
  };
}

function google(extra: Partial<Integration> = {}): Integration {
  return {
    id: 'int_google' as IntegrationId,
    provider: Provider.GOOGLE_CALENDAR,
    authType: AuthType.OAUTH,
    accountLabel: 'mitchell@example.com',
    status: IntegrationStatus.NEEDS_REAUTH,
    sources: [
      {
        id: 'src_events' as ExternalSourceId,
        sourceType: SourceType.EVENTS,
        enabled: true,
        initialSyncCompleted: true,
        lastSyncedAt: SYNCED,
        lastError: null,
        retryAt: null,
      },
    ],
    createdAt: SYNCED,
    updatedAt: SYNCED,
    ...extra,
  };
}

function calendar(id: string, name: string, selected: boolean, isPrimary = false): Calendar {
  return {
    id: id as CalendarId,
    sourceId: 'src_events' as ExternalSourceId,
    externalId: id,
    name,
    color: '#2b7fff',
    timeZone: null,
    isPrimary,
    selected,
    visible: true,
    historyLoadedFrom: null,
    createdAt: SYNCED,
    updatedAt: SYNCED,
  };
}

function integrationsPage(integrations: Integration[]) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  const accounts = integrations.map((i) => structuredClone(i));
  const statuses: SourceSyncStatus[] = [];
  // kept copies by integration id (integrations.keptCopies)
  const kept = new Map<string, number>();
  main.routes.set('integrations.keptCopies', (args) => [
    { tasks: kept.get(args.id as string) ?? 0 },
    [],
  ]);
  const calendars = [
    calendar('cal_work', 'Work', true),
    calendar('cal_me', 'Mitchell', true, true),
    calendar('cal_holidays', 'Holidays', false),
  ];
  main.routes.set('integrations.list', () => [structuredClone(accounts), []]);
  main.routes.set('sync.status', () => [structuredClone(statuses), []]);
  main.routes.set('calendars.list', () => [structuredClone(calendars), []]);
  main.routes.set('integrations.setEnabled', (args) => {
    const account = accounts.find((a) => a.id === args.id)!;
    account.status = args.enabled ? IntegrationStatus.CONNECTED : IntegrationStatus.DISABLED;
    return [account, ['integration', 'externalSource']];
  });
  main.routes.set('sources.setEnabled', (args) => {
    const source = accounts.flatMap((a) => a.sources).find((s) => s.id === args.id)!;
    source.enabled = args.enabled as boolean;
    return [source, ['externalSource']];
  });
  main.routes.set('calendars.setSelected', (args) => {
    const found = calendars.find((c) => c.id === args.id)!;
    found.selected = args.selected as boolean;
    return [found, ['calendar']];
  });
  main.routes.set('integrations.previewDisconnect', () => [
    {
      deleted: { tasks: 6, projects: 1, events: 0 },
      kept: { tasks: 2, projects: 1, events: 0 },
    },
    [],
  ]);
  main.routes.set('integrations.disconnect', (args) => {
    accounts.splice(
      accounts.findIndex((a) => a.id === args.id),
      1,
    );
    return [
      {
        deleted: { tasks: 0, projects: 0, events: 0 },
        kept: { tasks: 8, projects: 2, events: 0 },
        changed: ['task', 'project'],
        revoked: false,
      },
      ['integration', 'task', 'project'],
    ];
  });
  const app = startApp(main, { url: `/app/${WORK}/integrations` });
  return { main, app, accounts, statuses, kept };
}

const card = (id: string) =>
  document.querySelector<HTMLElement>(`[data-integration-id="${id}"]`) ?? undefined;
const switchIn = (root: Element, label: string) =>
  root.querySelector<HTMLElement>(`[aria-label="${label}"]`);

describe('the integrations page', () => {
  it('shows each account with its state and its sources’ status', async () => {
    const { app } = integrationsPage([linear(), google()]);
    await eventually(() => expect(card('int_linear')).toBeDefined());
    const linearCard = card('int_linear')!;
    expect(linearCard.textContent).toContain('Connected');
    expect(linearCard.textContent).toContain('Mitchell George · Acme · API key');
    expect(linearCard.textContent).toMatch(/Synced \dm ago/);
    const googleCard = card('int_google')!;
    expect(googleCard.textContent).toContain('Needs reconnect');
    expect(googleCard.textContent).toContain('Google rejected the saved sign-in');
    expect(googleCard.textContent).toContain('Paused until you reconnect');
    await eventually(() => expect(googleCard.textContent).toContain('2 of 3 calendars'));
    expect(app.text()).toContain('Coming later');
  });

  it('shows every provider with Connect when nothing is connected', async () => {
    const { app } = integrationsPage([]);
    await eventually(() => expect(app.text()).toContain('Connect an account to bring'));
    expect(app.container.querySelector('[aria-label="Connect Linear"]')).not.toBeNull();
    expect(app.container.querySelector('[aria-label="Connect Google Calendar"]')).not.toBeNull();
  });

  it('switches an account and a source', async () => {
    const { main } = integrationsPage([linear()]);
    await eventually(() => expect(card('int_linear')).toBeDefined());
    click(switchIn(card('int_linear')!, 'Sync tasks'));
    await eventually(() => expect(main.callsTo('sources.setEnabled')).toHaveLength(1));
    expect(main.callsTo('sources.setEnabled')[0].input).toEqual({
      id: 'src_tasks',
      enabled: false,
    });
    await eventually(() => expect(card('int_linear')!.textContent).toContain('Off'));
    click(switchIn(card('int_linear')!, 'Linear on'));
    await eventually(() => expect(main.callsTo('integrations.setEnabled')).toHaveLength(1));
    expect(main.callsTo('integrations.setEnabled')[0].input).toEqual({
      id: 'int_linear',
      enabled: false,
    });
    await eventually(() =>
      expect(card('int_linear')!.textContent).toContain('Off · mirrored items are kept'),
    );
  });

  it('follows the push events: a run in flight and its progress', async () => {
    const { main, statuses } = integrationsPage([linear()]);
    await eventually(() => expect(card('int_linear')).toBeDefined());
    statuses.push({
      sourceId: 'src_tasks' as ExternalSourceId,
      integrationId: 'int_linear' as IntegrationId,
      provider: Provider.LINEAR,
      sourceType: SourceType.TASKS,
      status: IntegrationStatus.CONNECTED,
      enabled: true,
      running: true,
      lastSyncedAt: SYNCED,
      lastError: null,
      retryAt: null,
    });
    main.push('sources.changed', { sourceId: 'src_tasks' as ExternalSourceId });
    await eventually(() => expect(card('int_linear')!.textContent).toContain('Syncing…'));
    main.push('sync.progress', {
      sourceId: 'src_tasks' as ExternalSourceId,
      phase: 'initial',
      itemsApplied: 24,
    });
    await eventually(() => expect(card('int_linear')!.textContent).toContain('24 so far'));
  });

  it('chooses calendars, saving each tick', async () => {
    const { main } = integrationsPage([google({ status: IntegrationStatus.CONNECTED })]);
    await eventually(() => expect(card('int_google')).toBeDefined());
    click(byText(card('int_google')!, 'button', 'Choose Calendars'));
    await eventually(() => expect(document.body.textContent).toContain('2 of 3 selected'));
    const holidays = byText(document.body, 'label', 'Holidays')!;
    click(holidays.querySelector('[role="checkbox"]'));
    await eventually(() => expect(main.callsTo('calendars.setSelected')).toHaveLength(1));
    expect(main.callsTo('calendars.setSelected')[0].input).toEqual({
      id: 'cal_holidays',
      selected: true,
    });
    await eventually(() => expect(document.body.textContent).toContain('3 of 3 selected'));
  });

  it('disconnects after counting what goes and what stays', async () => {
    const { main, app } = integrationsPage([linear()]);
    await eventually(() => expect(card('int_linear')).toBeDefined());
    click(byText(card('int_linear')!, 'button', 'Disconnect…'));
    await eventually(() => expect(document.body.textContent).toContain('Disconnect Linear?'));
    expect(document.body.textContent).toContain('8 tasks and 2 projects stay in DevBrain');
    expect(document.body.textContent).toContain('Deletes 6 tasks and 1 project.');
    click(byText(document.querySelector('[role="alertdialog"]')!, 'button', 'Disconnect'));
    await eventually(() => expect(main.callsTo('integrations.disconnect')).toHaveLength(1));
    expect(main.callsTo('integrations.disconnect')[0].input).toEqual({
      id: 'int_linear',
      keepLocalCopies: true,
    });
    await eventually(() => expect(document.body.textContent).toContain('Linear disconnected'));
    expect(document.body.textContent).toContain(
      '8 tasks and 2 projects kept as local copies. Connect the account again to sync them.',
    );
    await eventually(() => expect(app.text()).toContain('Connect an account to bring'));
  });

  it('connects Linear with a key, saying when Linear rejects it', async () => {
    const { main, app, accounts } = integrationsPage([]);
    let attempts = 0;
    main.routes.set('integrations.connect', () => {
      attempts += 1;
      if (attempts === 1) throw FakeMain.error('integration_auth', 'Linear rejected the API key');
      accounts.push(linear());
      return [accounts[0], ['integration']];
    });
    await eventually(() => expect(app.text()).toContain('Connect an account'));
    click(app.container.querySelector('[aria-label="Connect Linear"]'));
    await eventually(() => expect(document.body.textContent).toContain('Personal API key'));
    const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(input, 'lin_api_bad');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    click(byText(document.body, 'button', 'Check Key and Connect'));
    await eventually(() => expect(document.body.textContent).toContain('Linear didn’t accept'));
    expect(main.callsTo('integrations.connect')[0].input).toEqual({
      auth: 'api_key',
      provider: 'linear',
      apiKey: 'lin_api_bad',
      enableSources: ['tasks'],
    });
    click(byText(document.body, 'button', 'Check Key and Connect'));
    await eventually(() => expect(document.body.textContent).toContain('Linear connected'));
    await eventually(() => expect(card('int_linear')).toBeDefined());
  });

  it('waits for Google’s sign-in with the switches locked, and Cancel cancels it', async () => {
    const { main } = integrationsPage([linear(), google()]);
    const release = main.hold('integrations.reconnect');
    main.routes.set('integrations.reconnect', () => {
      throw FakeMain.error('cancelled', 'The sign-in was cancelled');
    });
    main.routes.set('integrations.cancelConnect', () => {
      release();
      return [true, []];
    });
    await eventually(() => expect(card('int_google')).toBeDefined());
    click(byText(card('int_google')!, 'button', 'Reconnect'));
    await eventually(() =>
      expect(document.body.textContent).toContain('Finish signing in in your browser'),
    );
    expect(main.callsTo('integrations.reconnect')[0].input).toEqual({
      auth: 'oauth',
      id: 'int_google',
    });
    // a switch flipped now would be overwritten by the status the reconnect writes
    await eventually(() =>
      expect(switchIn(card('int_linear')!, 'Linear on')?.hasAttribute('data-disabled')).toBe(true),
    );
    click(byText(document.body, 'button', 'Cancel'));
    await eventually(() => expect(main.callsTo('integrations.cancelConnect')).toHaveLength(1));
    await eventually(() =>
      expect(document.body.textContent).not.toContain('Finish signing in in your browser'),
    );
    await eventually(() =>
      expect(switchIn(card('int_linear')!, 'Linear on')?.hasAttribute('data-disabled')).toBe(false),
    );
    // a cancelled sign-in is no error
    expect(document.body.textContent).not.toContain('Couldn’t reconnect');
  });

  it('offers to reattach the tasks a disconnect kept, after asking, and says what stayed local', async () => {
    const { main, kept } = integrationsPage([linear()]);
    kept.set('int_linear', 3);
    main.routes.set('integrations.reattachKept', () => {
      kept.set('int_linear', 1);
      return [
        {
          reattached: 2,
          failed: [
            {
              taskId: 'tsk_gone',
              message: 'Task ENG-4 can’t be reattached because it no longer exists',
            },
          ],
        },
        ['task'],
      ];
    });
    await eventually(() =>
      expect(card('int_linear')!.textContent).toContain(
        '3 tasks from Linear are still local copies from when this account was disconnected. Reattach to sync them again',
      ),
    );
    click(byText(card('int_linear')!, 'button', 'Reattach…'));
    await eventually(() => expect(document.body.textContent).toContain('Reattach 3 tasks?'));
    expect(document.body.textContent).toContain(
      'Anything changed in them in DevBrain since the disconnect is replaced with Linear’s copy.',
    );
    // nothing is written until the user confirms
    expect(main.callsTo('integrations.reattachKept')).toEqual([]);
    click(byText(document.querySelector('[role="alertdialog"]')!, 'button', 'Reattach Tasks'));

    await eventually(() => expect(main.callsTo('integrations.reattachKept')).toHaveLength(1));
    expect(main.callsTo('integrations.reattachKept')[0].input).toEqual({ id: 'int_linear' });
    await eventually(() => expect(document.body.textContent).toContain('2 tasks reattached'));
    expect(document.body.textContent).toContain(
      '1 task stays local. Task ENG-4 can’t be reattached because it no longer exists.',
    );
    // the task change refetches the offer, which counts what is left
    await eventually(() =>
      expect(card('int_linear')!.textContent).toContain('1 task from Linear is still a local copy'),
    );
  });

  it('keeps the kept tasks local, and the offer goes', async () => {
    const { main, kept } = integrationsPage([linear()]);
    kept.set('int_linear', 2);
    main.routes.set('integrations.keepKeptLocal', () => {
      kept.delete('int_linear');
      return [undefined, ['task']];
    });
    await eventually(() =>
      expect(card('int_linear')!.querySelector('[data-testid="kept-copies"]')).not.toBeNull(),
    );
    click(byText(card('int_linear')!, 'button', 'Keep Local'));
    await eventually(() => expect(main.callsTo('integrations.keepKeptLocal')).toHaveLength(1));
    await eventually(() =>
      expect(card('int_linear')!.querySelector('[data-testid="kept-copies"]')).toBeNull(),
    );
  });

  it('offers nothing while there are no kept tasks, or while the account needs reconnecting', async () => {
    const { main, kept } = integrationsPage([
      linear({ status: IntegrationStatus.NEEDS_REAUTH }),
      linear({ id: 'int_other' as IntegrationId }),
    ]);
    kept.set('int_linear', 4);
    await eventually(() => expect(card('int_other')).toBeDefined());
    await eventually(() =>
      expect(card('int_linear')!.textContent).toContain('Linear rejected the saved API key'),
    );
    // both counts have answered
    await eventually(() => expect(main.callsTo('integrations.keptCopies')).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.querySelector('[data-testid="kept-copies"]')).toBeNull();
  });

  it('offers Update API Key for a rejected Linear key', async () => {
    const { main } = integrationsPage([linear({ status: IntegrationStatus.NEEDS_REAUTH })]);
    main.routes.set('integrations.reconnect', () => [linear(), ['integration']]);
    await eventually(() => expect(card('int_linear')).toBeDefined());
    expect(card('int_linear')!.textContent).toContain('Paused until you update the key');
    click(byText(card('int_linear')!, 'button', 'Update API Key'));
    await eventually(() => expect(document.body.textContent).toContain('Update Linear API key'));
  });
});
