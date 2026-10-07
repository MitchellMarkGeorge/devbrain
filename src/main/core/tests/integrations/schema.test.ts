import { describe, it, expect } from 'vitest';
import { generateId } from '@common/ids';
import {
  eventLinkMetadataSchema,
  googleEventConfigSchema,
  googleEventCursorSchema,
  linearTaskConfigSchema,
  linearTaskCursorSchema,
  projectLinkMetadataSchema,
  taskLinkMetadataSchema,
} from '../../integrations/schema';
import {
  ExternalReadOnlyError,
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../shared/errors';

describe('integration ids — prefixes', () => {
  it('prefixes integration, source and link ids', () => {
    expect(generateId('integration')).toMatch(/^int_/);
    expect(generateId('externalSource')).toMatch(/^src_/);
    expect(generateId('externalLink')).toMatch(/^xln_/);
  });
});

describe('integration schemas — cursors', () => {
  it('accepts both Linear cursor modes', () => {
    expect(
      linearTaskCursorSchema.parse({ mode: 'initial', after: null, maxUpdatedAt: null }),
    ).toEqual({ mode: 'initial', after: null, maxUpdatedAt: null });
    expect(
      linearTaskCursorSchema.parse({ mode: 'incremental', updatedSince: '2026-10-01T00:00:00Z' }),
    ).toEqual({ mode: 'incremental', updatedSince: '2026-10-01T00:00:00Z' });
  });

  it('rejects an unreadable Linear cursor', () => {
    expect(linearTaskCursorSchema.safeParse(null).success).toBe(false);
    expect(linearTaskCursorSchema.safeParse({ mode: 'other' }).success).toBe(false);
    expect(
      linearTaskCursorSchema.safeParse({ mode: 'incremental', updatedSince: 'yesterday' }).success,
    ).toBe(false);
  });

  it('accepts a Google cursor keyed by calendar', () => {
    const cursor = { calendars: { primary: { syncToken: null, pageToken: 'p2' } } };
    expect(googleEventCursorSchema.parse(cursor)).toEqual(cursor);
    expect(googleEventCursorSchema.safeParse({ calendars: { primary: {} } }).success).toBe(false);
  });
});

describe('integration schemas — config', () => {
  it('parses Linear and Google config', () => {
    expect(linearTaskConfigSchema.parse({})).toEqual({});
    expect(googleEventConfigSchema.parse({ calendarIds: ['primary'] })).toEqual({
      calendarIds: ['primary'],
    });
    expect(googleEventConfigSchema.safeParse({}).success).toBe(false);
  });
});

describe('integration schemas — link metadata', () => {
  it('fills missing task and project keys with null', () => {
    expect(taskLinkMetadataSchema.parse({ statusLabel: 'In Review' })).toEqual({
      statusLabel: 'In Review',
      priorityLabel: null,
      parentExternalId: null,
      parentKey: null,
      parentTitle: null,
    });
    expect(projectLinkMetadataSchema.parse({})).toEqual({ statusLabel: null });
  });

  it('requires a calendar id and a known response on event metadata', () => {
    expect(eventLinkMetadataSchema.parse({ calendarId: 'primary', response: 'declined' })).toEqual({
      calendarId: 'primary',
      timeZone: null,
      response: 'declined',
      recurringEventExternalId: null,
      originalStartAt: null,
    });
    expect(eventLinkMetadataSchema.safeParse({}).success).toBe(false);
    expect(
      eventLinkMetadataSchema.safeParse({ calendarId: 'primary', response: 'maybe' }).success,
    ).toBe(false);
  });
});

describe('integration errors — shape', () => {
  it('names each error and keeps its details', () => {
    const id = generateId('task');
    expect(new ExternalReadOnlyError(id)).toMatchObject({ name: 'ExternalReadOnlyError' });
    expect(new ExternalReadOnlyError(id).message).toContain(id);

    const cause = new Error('401');
    expect(new IntegrationAuthError('Linear rejected the API key', { cause })).toMatchObject({
      name: 'IntegrationAuthError',
      message: 'Linear rejected the API key',
      cause,
    });

    const retryAt = new Date('2026-10-07T12:00:00Z');
    const rateLimited = new RateLimitError(retryAt);
    expect(rateLimited.name).toBe('RateLimitError');
    expect(rateLimited.retryAt).toBe(retryAt);
    expect(rateLimited.message).toContain('2026-10-07T12:00:00.000Z');

    expect(new ProviderUnavailableError('timed out')).toMatchObject({
      name: 'ProviderUnavailableError',
      message: 'timed out',
    });
  });
});
