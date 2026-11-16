import { describe, it, expect } from 'vitest';
import { generateId } from '@common/ids';
import {
  eventLinkMetadataSchema,
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

  it('requires a calendar id on event metadata, and keeps only provider bookkeeping', () => {
    expect(eventLinkMetadataSchema.parse({ calendarId: 'primary' })).toEqual({
      calendarId: 'primary',
      recurringEventExternalId: null,
    });
    // metadata in the earlier shape still reads; what moved to columns on events is dropped
    expect(
      eventLinkMetadataSchema.parse({
        calendarId: 'primary',
        timeZone: 'America/New_York',
        response: 'declined',
        recurringEventExternalId: 'primary:series',
        originalStartAt: '2026-10-12T14:00:00.000Z',
      }),
    ).toEqual({ calendarId: 'primary', recurringEventExternalId: 'primary:series' });
    expect(eventLinkMetadataSchema.safeParse({}).success).toBe(false);
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
