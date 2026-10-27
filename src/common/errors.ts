// Every error core throws on purpose, with a stable `code` the IPC layer can serialise and the
// renderer can switch on without parsing messages. Core's error classes (core/shared/errors.ts) each
// set one; a new class adds its code here. A runtime list, so the IPC layer can tell core's errors
// from anything else thrown.
export const CORE_ERROR_CODES = [
  'not_found',
  'invalid_input',
  'task_hierarchy',
  'already_archived',
  'not_archived',
  'external_read_only',
  'detach_failed',
  'integration_auth',
  'integration_already_connected',
  'connect_in_progress',
  'integration_account_mismatch',
  'integration_disabled',
  'unsupported_by_provider',
  'oauth_unavailable',
  'rate_limited',
  'sync_page_limit',
  'provider_unavailable',
  'provider_api',
  'change_token_expired',
  'oauth_error',
  'oauth_callback_timeout',
  'invalid_cursor',
  'malformed_note_file',
  'devbrain_folder',
  'file_exists',
  'workspace_not_open',
  'workspace_data_missing',
  'workspace_closed',
  'workspace_migration',
  'unsafe_url',
] as const;

export type CoreErrorCode = (typeof CORE_ERROR_CODES)[number];

export function isCoreErrorCode(value: unknown): value is CoreErrorCode {
  return (CORE_ERROR_CODES as readonly unknown[]).includes(value);
}
