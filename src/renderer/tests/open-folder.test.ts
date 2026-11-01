import { describe, expect, it } from 'vitest';
import { openFolderErrorMessage } from '../workspaces/open-folder';

describe('openFolderErrorMessage', () => {
  const importError = (reason: string) => ({
    code: 'workspace_import' as const,
    message: 'core message',
    data: { reason },
  });

  it('says what to do for each reason a folder is refused', () => {
    expect(openFolderErrorMessage(importError('not_a_workspace'))).toMatch(/isn't a DevBrain/);
    expect(openFolderErrorMessage(importError('already_added'))).toMatch(/already in your list/);
    expect(openFolderErrorMessage(importError('unreadable'))).toMatch(/permission/);
    expect(openFolderErrorMessage(importError('something new'))).toBe('core message');
  });

  it('asks for an update for a workspace from a newer DevBrain', () => {
    expect(openFolderErrorMessage({ code: 'workspace_too_new', message: '', data: {} })).toMatch(
      /Update DevBrain/,
    );
  });

  it('falls back to a generic message, never an internal one', () => {
    expect(openFolderErrorMessage({ code: 'internal', message: 'SQL…', data: {} })).toBe(
      "That folder couldn't be opened.",
    );
    expect(openFolderErrorMessage(undefined)).toBe("That folder couldn't be opened.");
  });
});
