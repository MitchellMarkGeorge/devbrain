import { describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { landingHref } from '@renderer/shared/lib/workspace/landing';
import { SWATCH_HEX, swatchOf } from '@renderer/shared/lib/workspace/colors';
import { importFailure, openFailure } from '@renderer/shared/lib/workspace/errors';

const W = 'wsp_w' as WorkspaceId;
const general = (openToLastPage: boolean) => ({
  general: {
    openToLastPage,
    defaultLandingPage: 'tasks' as const,
    launchOnStartup: false,
    confirmBeforeDeleting: true,
    confirmBeforeArchiving: false,
    timeFormat: '12' as const,
  },
});

describe('landingHref', () => {
  it("is the workspace's last page with Reopen last page on", () => {
    expect(landingHref(general(true), { id: W, lastPage: `/app/${W}/notes?view=card` }, W)).toBe(
      `/app/${W}/notes?view=card`,
    );
  });

  it('is the landing page with the setting off, no page, or a page that is not this workspace’s', () => {
    const landing = `/app/${W}/tasks`;
    expect(landingHref(general(false), { id: W, lastPage: `/app/${W}/notes` }, W)).toBe(landing);
    expect(landingHref(general(true), { id: W, lastPage: null }, W)).toBe(landing);
    expect(landingHref(general(true), { id: W, lastPage: '/app/wsp_other/notes' }, W)).toBe(
      landing,
    );
    expect(landingHref(general(true), { id: W, lastPage: '/app/notes' }, W)).toBe(landing);
    expect(landingHref(general(true), { id: W, lastPage: 'https://example.com' }, W)).toBe(landing);
    // another workspace's info
    expect(
      landingHref(general(true), { id: 'wsp_x' as WorkspaceId, lastPage: `/app/${W}/notes` }, W),
    ).toBe(landing);
  });

  it('never leads back to the workspace link itself', () => {
    expect(landingHref(general(true), { id: W, lastPage: `/app/${W}` }, W)).toBe(`/app/${W}/tasks`);
    expect(landingHref(general(true), { id: W, lastPage: `/app/${W}/?x=1` }, W)).toBe(
      `/app/${W}/tasks`,
    );
  });
});

describe('swatchOf', () => {
  it('is the swatch of a swatch colour, the nearest for another, and blue for none', () => {
    expect(swatchOf(SWATCH_HEX.green)).toBe('green');
    expect(swatchOf('#ef4444')).toBe('red');
    expect(swatchOf('#6366f1')).toBe('indigo');
    expect(swatchOf(undefined)).toBe('blue');
    expect(swatchOf('not a colour')).toBe('blue');
  });
});

const ipcError = (code: string, message = 'm', data: Record<string, unknown> = {}) => ({
  data: { code, message, data },
});

describe('openFailure', () => {
  it('says why by code', () => {
    expect(openFailure(ipcError('workspace_data_missing'), 'Work').title).toBe(
      'Can’t find Work’s folder',
    );
    expect(openFailure(ipcError('workspace_too_new'), 'Work').title).toBe(
      'Work needs a newer DevBrain',
    );
    expect(openFailure(ipcError('not_found'), null).title).toBe(
      'This workspace isn’t in your list',
    );
    expect(openFailure(new Error('boom'), null)).toEqual({
      title: 'This workspace couldn’t be opened',
      description: 'Something went wrong.',
    });
  });
});

describe('importFailure', () => {
  it('says why, and offers the way forward', () => {
    expect(
      importFailure(ipcError('workspace_import', 'x', { reason: 'not_a_workspace' })),
    ).toMatchObject({
      title: 'This folder isn’t a DevBrain workspace',
      chooseAnother: true,
      alreadyAdded: null,
    });
    expect(
      importFailure(
        ipcError('workspace_import', 'In your list as "Work"', {
          reason: 'already_added',
          workspaceId: 'wsp_work',
        }),
      ),
    ).toMatchObject({
      title: 'In your list as "Work"',
      alreadyAdded: 'wsp_work',
      chooseAnother: false,
    });
    expect(importFailure(ipcError('workspace_too_new'))).toMatchObject({
      title: 'This workspace needs a newer DevBrain',
    });
    expect(importFailure(ipcError('internal', 'Something went wrong'))).toMatchObject({
      title: 'This folder couldn’t be added',
    });
  });
});
