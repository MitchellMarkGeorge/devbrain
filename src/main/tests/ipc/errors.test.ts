import { describe, expect, it } from 'vitest';
import { IpcError, serializeError } from '@common/ipc/errors';
import {
  DevBrainFolderError,
  IntegrationAlreadyConnectedError,
  NotFoundError,
  RateLimitError,
} from '@main/core/shared/errors';
import type { IntegrationId, TaskId } from '@common/ids';
import { Provider } from '@common/integrations';

describe('serializeError', () => {
  it("keeps a RateLimitError's code, message and retryAt", () => {
    const retryAt = new Date('2026-01-01T00:00:00.000Z');
    const error = new RateLimitError(retryAt, { cause: new Error('429') });

    expect(serializeError(error)).toEqual({
      code: 'rate_limited',
      message: error.message,
      // no cause or stack
      data: { retryAt },
    });
  });

  it("keeps a DevBrainFolderError's reason", () => {
    const error = new DevBrainFolderError('missing', 'No DevBrain folder at /tmp/x');

    expect(serializeError(error)).toEqual({
      code: 'devbrain_folder',
      message: 'No DevBrain folder at /tmp/x',
      data: { reason: 'missing' },
    });
  });

  it("keeps an IntegrationAlreadyConnectedError's integrationId", () => {
    const integrationId = 'int_123' as IntegrationId;
    const error = new IntegrationAlreadyConnectedError(Provider.LINEAR, 'Acme', integrationId);

    expect(serializeError(error)).toEqual({
      code: 'integration_already_connected',
      message: 'Acme is already connected to linear in this workspace',
      data: { integrationId },
    });
  });

  it('gives a core error without fields of its own empty data', () => {
    expect(serializeError(new NotFoundError('tsk_1' as TaskId)).data).toEqual({});
  });

  it('turns a plain Error into internal with a generic message', () => {
    expect(serializeError(new Error('SQLITE_CORRUPT: /home/me/.devbrain/db'))).toEqual({
      code: 'internal',
      message: 'Something went wrong',
      data: {},
    });
  });

  it('turns an error with a code core does not use, and a non-error, into internal', () => {
    const systemError = Object.assign(new Error('ENOENT: /secret'), { code: 'ENOENT' });

    expect(serializeError(systemError).code).toBe('internal');
    expect(serializeError({ code: 'not_found', message: 'not an Error' }).code).toBe('internal');
    expect(serializeError('boom').code).toBe('internal');
  });

  it('keeps an IpcError as it is', () => {
    const error = new IpcError('no_workspace_open', 'Open a workspace first', { hint: 1 });

    expect(serializeError(error)).toEqual({
      code: 'no_workspace_open',
      message: 'Open a workspace first',
      data: { hint: 1 },
    });
  });

  it('gives data that survives structuredClone', () => {
    const serialized = serializeError(new RateLimitError(new Date(0)));

    expect(structuredClone(serialized)).toEqual(serialized);
  });
});
