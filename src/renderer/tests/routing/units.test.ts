import { describe, expect, it } from 'vitest';
import { landingPage } from '../../app/landing-page';
import { SWATCH_HEX, safeColor, swatchOf } from '../../app/swatches';
import { calendarSearch } from '../../pages/calendar/search';
import { tasksSearch } from '../../pages/tasks/search';
import { describeWorkspaceError } from '../../pages/onboarding/WorkspaceErrorDialog';
import { byLastOpened } from '../../pages/onboarding/WorkspacePicker';
import { settings, workspace } from './harness';

describe('landingPage', () => {
  const at = (lastPage: string | null) => ({ lastPage });

  it('is the default landing page', () => {
    expect(landingPage(settings({ defaultLandingPage: 'calendar' }), at('/app/tasks'))).toBe(
      '/app/calendar',
    );
  });

  it('is the workspace\'s last page when "Reopen last page" is on and it saved one', () => {
    const on = settings({ openToLastPage: true });
    expect(landingPage(on, at('/app/tasks?view=board'))).toBe('/app/tasks?view=board');
    expect(landingPage(on, at(null))).toBe('/app/home');
    expect(landingPage(on, null)).toBe('/app/home');
  });

  it('ignores a last page outside the app', () => {
    const on = settings({ openToLastPage: true });
    expect(landingPage(on, at('/onboarding'))).toBe('/app/home');
    expect(landingPage(on, at('https://example.com'))).toBe('/app/home');
  });

  it('is Home without settings', () => {
    expect(landingPage(undefined, at('/app/notes'))).toBe('/app/home');
  });
});

describe('swatches', () => {
  it("draws a swatch's own colour in that swatch", () => {
    for (const [swatch, hex] of Object.entries(SWATCH_HEX)) expect(swatchOf(hex)).toBe(swatch);
  });

  it('draws any other colour in the nearest swatch', () => {
    expect(swatchOf('#3b82f6')).toBe('blue');
    expect(swatchOf('#ff0000')).toBe('red');
  });

  it('draws a colour that is not #rrggbb in no swatch, and keeps it out of styles', () => {
    expect(swatchOf('red; background: url(x)')).toBeUndefined();
    expect(swatchOf(null)).toBeUndefined();
    expect(safeColor('url(x)')).toBeUndefined();
    expect(safeColor('#00bc7d')).toBe('#00bc7d');
  });
});

describe('search params', () => {
  it('keep the values given', () => {
    expect(tasksSearch.parse({ view: 'board', project: 'prj_1', open: 'tsk_2' })).toEqual({
      view: 'board',
      project: 'prj_1',
      open: 'tsk_2',
    });
  });

  it('drop a bad value to its default, keeping the rest', () => {
    expect(tasksSearch.parse({ view: 'grid', status: 'all', open: 'prj_1' })).toEqual({
      view: undefined,
      status: 'all',
      open: undefined,
    });
  });

  it('never write a default', () => {
    expect(tasksSearch.parse({})).toEqual({});
  });

  it('take an event or a task in the calendar sheet, and a day as YYYY-MM-DD', () => {
    expect(calendarSearch.parse({ open: 'evt_1', date: '2026-11-06' })).toEqual({
      open: 'evt_1',
      date: '2026-11-06',
    });
    expect(calendarSearch.parse({ open: 'nte_1', date: 'tomorrow' })).toEqual({
      open: undefined,
      date: undefined,
    });
  });
});

describe('workspace errors', () => {
  it('names the remedy by reason', () => {
    const failure = (reason: string, workspaceId: string | null = null) => ({
      code: 'workspace_import' as const,
      message: 'm',
      data: { reason, workspaceId },
    });
    expect(describeWorkspaceError(failure('not_a_workspace')).remedy).toBe('choose_folder');
    expect(describeWorkspaceError(failure('already_added', 'wsp_1')).remedy).toBe('open_existing');
    expect(describeWorkspaceError(failure('unreadable')).remedy).toBe('choose_folder');
    expect(
      describeWorkspaceError({ code: 'workspace_too_new', message: 'm', data: {} }).title,
    ).toBe('This workspace needs a newer DevBrain');
  });
});

describe('byLastOpened', () => {
  it('puts the most recently opened first, and never-opened ones last, newest first', () => {
    const a = workspace('A', { lastOpenedAt: 1 });
    const b = workspace('B', { lastOpenedAt: 2 });
    const c = workspace('C', { lastOpenedAt: null, createdAt: 5 });
    const d = workspace('D', { lastOpenedAt: null, createdAt: 9 });
    expect([a, c, b, d].sort(byLastOpened).map(({ name }) => name)).toEqual(['B', 'A', 'D', 'C']);
  });
});
