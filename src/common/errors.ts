// Every error core throws on purpose, with a stable `code` the IPC layer can serialise and the
// renderer can switch on without parsing messages. Core's error classes (core/shared/errors.ts) each
// set one; a new class adds its code here.
export type CoreErrorCode =
  | 'not_found'
  | 'invalid_input'
  | 'task_hierarchy'
  | 'already_archived'
  | 'not_archived'
  | 'external_read_only'
  | 'detach_failed'
  | 'integration_auth'
  | 'integration_already_connected'
  | 'connect_in_progress'
  // an OAuth sign-in the user cancelled while it waited on the browser
  | 'cancelled'
  | 'integration_account_mismatch'
  | 'integration_disabled'
  | 'unsupported_by_provider'
  | 'oauth_unavailable'
  | 'rate_limited'
  | 'sync_page_limit'
  | 'provider_unavailable'
  | 'provider_api'
  | 'change_token_expired'
  | 'oauth_error'
  | 'oauth_callback_timeout'
  | 'invalid_cursor'
  | 'malformed_note_file'
  | 'devbrain_folder'
  | 'file_exists'
  | 'workspace_not_open'
  | 'workspace_data_missing'
  | 'workspace_closed'
  | 'workspace_migration'
  | 'unsafe_url'
  // an import file DevBrain can't read: too large, not text, malformed, or of an unknown kind
  | 'import_file'
  // a workspace database written by a newer DevBrain than this one
  | 'workspace_too_new'
  // a folder that can't be added as a workspace (WorkspaceImportError's `reason` says why)
  | 'workspace_import';
