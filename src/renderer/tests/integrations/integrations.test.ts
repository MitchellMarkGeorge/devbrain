import { describe, expect, it } from 'vitest';
import { AuthType, IntegrationStatus } from '@common/types';
import { countsText, disconnectChoices } from '../../pages/integrations/DisconnectDialog';
import { accountMeta, accountState, sourceStatus } from '../../pages/integrations/providers';

// What the Integrations page says of an account and its sources, and the disconnect choices.

const NOW = new Date(2026, 10, 10, 12);
const source = {
  enabled: true,
  initialSyncCompleted: true,
  lastSyncedAt: new Date(2026, 10, 10, 11, 57),
  lastError: null,
  retryAt: null,
};
const connected = { status: IntegrationStatus.CONNECTED, authType: AuthType.API_KEY };
const status = (overrides: Partial<Parameters<typeof sourceStatus>[0]> = {}) =>
  sourceStatus({
    integration: connected,
    source,
    running: false,
    now: NOW,
    relative: () => '3m ago',
    time: () => '1:00 PM',
    ...overrides,
  });

describe('accountState and accountMeta', () => {
  it('maps core’s status to the pill', () => {
    expect(accountState({ status: IntegrationStatus.CONNECTED })).toBe('connected');
    expect(accountState({ status: IntegrationStatus.NEEDS_REAUTH })).toBe('needs-reconnect');
    expect(accountState({ status: IntegrationStatus.DISABLED })).toBe('off');
  });

  it('says how the account signs in', () => {
    expect(accountMeta({ accountLabel: 'Me · Acme', authType: AuthType.API_KEY })).toBe(
      'Me · Acme · API key',
    );
    expect(accountMeta({ accountLabel: 'me@x.com', authType: AuthType.OAUTH })).toBe(
      'me@x.com · Google sign-in',
    );
  });
});

describe('sourceStatus', () => {
  it('says when it last synced', () => {
    expect(status()).toEqual({ text: 'Synced 3m ago', tone: 'subtle' });
  });

  it('puts the account’s state first', () => {
    expect(status({ integration: { ...connected, status: IntegrationStatus.DISABLED } }).text).toBe(
      'Off · mirrored items are kept',
    );
    expect(
      status({ integration: { ...connected, status: IntegrationStatus.NEEDS_REAUTH } }),
    ).toEqual({ text: 'Paused until you update the key', tone: 'warning' });
    expect(
      status({
        integration: { status: IntegrationStatus.NEEDS_REAUTH, authType: AuthType.OAUTH },
      }).text,
    ).toBe('Paused until you reconnect');
  });

  it('then the source being off, a run, a back-off and a failure', () => {
    expect(status({ source: { ...source, enabled: false } }).text).toBe('Off');
    expect(status({ running: true }).text).toBe('Syncing…');
    expect(status({ running: true, applied: 24 }).text).toBe('Syncing… 24 so far');
    expect(status({ source: { ...source, retryAt: new Date(2026, 10, 10, 13) } })).toEqual({
      text: 'Paused until 1:00 PM',
      tone: 'warning',
    });
    expect(status({ source: { ...source, lastError: 'boom' } })).toEqual({
      text: 'Last sync failed',
      tone: 'error',
    });
    expect(status({ source: { ...source, initialSyncCompleted: false } }).text).toBe(
      'Waiting for the first sync',
    );
  });
});

describe('the disconnect choices', () => {
  it('counts in words, leaving out what is none', () => {
    expect(countsText({ tasks: 8, projects: 2, events: 0 })).toBe('8 tasks and 2 projects');
    expect(countsText({ tasks: 1, projects: 1, events: 3 })).toBe('1 task, 1 project and 3 events');
    expect(countsText({ tasks: 0, projects: 0, events: 0 })).toBeNull();
  });

  it('says what each choice does with the preview’s counts', () => {
    const choices = disconnectChoices({
      deleted: { tasks: 6, projects: 1, events: 0 },
      kept: { tasks: 2, projects: 1, events: 0 },
    });
    expect(choices.keep).toBe(
      '8 tasks and 2 projects stay in DevBrain as your own. They stop syncing and become editable.',
    );
    expect(choices.remove).toBe(
      'Deletes 6 tasks and 1 project. 2 tasks and 1 project stay as local copies because a note or task links to them.',
    );
  });
});
