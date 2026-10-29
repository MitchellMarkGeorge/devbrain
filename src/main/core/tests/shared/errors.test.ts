import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntegrationId, TaskId, WorkspaceId } from '@common/ids';
import {
  AlreadyArchivedError,
  ConnectCancelledError,
  ConnectInProgressError,
  CoreError,
  CoreErrorCode,
  DetachError,
  DevBrainFolderError,
  ExternalReadOnlyError,
  FileExistsError,
  IntegrationAccountMismatchError,
  IntegrationAlreadyConnectedError,
  IntegrationAuthError,
  IntegrationDisabledError,
  InvalidInputError,
  NotArchivedError,
  NotFoundError,
  OAuthUnavailableError,
  ProviderUnavailableError,
  RateLimitError,
  SyncPageLimitError,
  TaskHierarchyError,
  UnsupportedByProviderError,
  UnsafeUrlError,
  WorkspaceClosedError,
  WorkspaceDataMissingError,
  WorkspaceMigrationError,
  WorkspaceNotOpenError,
} from '../../shared/errors';
import { InvalidCursorError } from '../../shared/pagination';
import { OAuthCallbackTimeoutError } from '../../integrations/oauth/loopback';
import { OAuthError } from '../../integrations/oauth/client';
import { LinearApiError } from '../../integrations/providers/linear/client';
import { GoogleApiError } from '../../integrations/providers/google-calendar/client';
import { ChangeTokenExpiredError } from '../../integrations/providers/provider';
import { MalformedNoteFileError } from '../../local/notes';
import { Provider } from '../../integrations/types';

// Every error core throws carries a stable code, so the IPC layer can serialise it without parsing
// its message.

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const taskId = 'tsk_1' as TaskId;
const integrationId = 'int_1' as IntegrationId;

const errors: [CoreError, CoreErrorCode][] = [
  [new NotFoundError(taskId), 'not_found'],
  [new InvalidInputError('An API key is required'), 'invalid_input'],
  [new TaskHierarchyError(taskId, 'cycle', 'Tasks cannot be their own parent'), 'task_hierarchy'],
  [new AlreadyArchivedError(taskId), 'already_archived'],
  [new NotArchivedError(taskId), 'not_archived'],
  [new ExternalReadOnlyError(taskId), 'external_read_only'],
  [new DetachError(taskId, 'Task is local'), 'detach_failed'],
  [new IntegrationAuthError('Rejected'), 'integration_auth'],
  [
    new IntegrationAlreadyConnectedError(Provider.LINEAR, 'Ada', integrationId),
    'integration_already_connected',
  ],
  [new ConnectInProgressError(), 'connect_in_progress'],
  [new ConnectCancelledError(), 'cancelled'],
  [
    new IntegrationAccountMismatchError(integrationId, 'Ada', 'Bob'),
    'integration_account_mismatch',
  ],
  [new IntegrationDisabledError(integrationId), 'integration_disabled'],
  [
    new UnsupportedByProviderError(Provider.LINEAR, "linear can't serve as a source for events"),
    'unsupported_by_provider',
  ],
  [new OAuthUnavailableError('No OAuth client is configured'), 'oauth_unavailable'],
  [new RateLimitError(new Date('2026-10-14T12:00:00Z')), 'rate_limited'],
  [new SyncPageLimitError(500), 'sync_page_limit'],
  [new ProviderUnavailableError('Down'), 'provider_unavailable'],
  [new LinearApiError(400, 'Bad query'), 'provider_api'],
  [new GoogleApiError(404, 'No calendar'), 'provider_api'],
  [new ChangeTokenExpiredError(), 'change_token_expired'],
  [new OAuthError(400, 'invalid_request', null), 'oauth_error'],
  [new OAuthCallbackTimeoutError(300_000), 'oauth_callback_timeout'],
  [new InvalidCursorError(), 'invalid_cursor'],
  [new MalformedNoteFileError('/notes/a.md', null), 'malformed_note_file'],
  [new DevBrainFolderError('missing', 'No DevBrain folder'), 'devbrain_folder'],
  [new FileExistsError('/brain/settings.json'), 'file_exists'],
  [new WorkspaceNotOpenError('wsp_1' as WorkspaceId), 'workspace_not_open'],
  [
    new WorkspaceDataMissingError('wsp_1' as WorkspaceId, 'No workspace data found'),
    'workspace_data_missing',
  ],
  [new WorkspaceClosedError(), 'workspace_closed'],
  [new UnsafeUrlError(), 'unsafe_url'],
  [
    new WorkspaceMigrationError('Failed', {
      committed: false,
      restoredFromBackup: false,
      backupPath: null,
    }),
    'workspace_migration',
  ],
];

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
}

describe('Core errors — codes', () => {
  it.each(errors.map(([error, code]) => [error.name, error, code] as const))(
    '%s exposes its code',
    (_name, error, code) => {
      expect(error).toBeInstanceOf(CoreError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
    },
  );

  it('keeps the code on a plain copy, as the IPC layer will send it', () => {
    const error = new ExternalReadOnlyError(taskId);
    expect({ ...error }).toMatchObject({ code: 'external_read_only' });
  });

  it("keeps an OAuth endpoint's own error apart from the code", () => {
    const error = new OAuthError(400, 'invalid_request', 'Missing parameter');
    expect(error).toMatchObject({ code: 'oauth_error', oauthError: 'invalid_request' });
  });

  it('every error class in core extends CoreError, and each is listed above', () => {
    const declared = sourceFiles(coreDir).flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/class (\w+)(?:<[^>]*>)? extends (\w+)/g)]
        .filter(([, name, base]) => base === 'Error' || name.endsWith('Error'))
        .map(([, name, base]) => ({ name, base })),
    );
    expect(declared.filter(({ base }) => base !== 'CoreError' && base !== 'Error')).toEqual([]);
    expect(declared.filter(({ base }) => base === 'Error').map(({ name }) => name)).toEqual([
      'CoreError',
    ]);
    const tested = new Set(errors.map(([error]) => error.constructor.name));
    expect(declared.map(({ name }) => name).filter((name) => name !== 'CoreError')).toEqual(
      expect.arrayContaining([...tested]),
    );
    expect(tested.size).toBe(declared.length - 1);
  });
});
