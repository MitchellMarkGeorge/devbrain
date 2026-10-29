import { describe, expect, it } from 'vitest';
import type { WorkspaceEntry } from '@main/core';
import type { BootSnapshot } from '../ipc/boot';
import { chooseScreen, opensLastOnLoad, type StartupState } from '../startup';

const workspace = (name: string): WorkspaceEntry =>
  ({
    id: `wsp_${name}`,
    name,
    color: '#112233',
    path: `/w/${name}`,
    createdAt: 0,
    lastOpenedAt: null,
  }) as WorkspaceEntry;

const work = workspace('work');
const home = workspace('home');

const boot = (overrides: Partial<BootSnapshot> = {}): BootSnapshot => ({
  devBrainAvailable: true,
  current: null,
  last: null,
  workspaces: { items: [work, home], nextCursor: null },
  ...overrides,
});

// the state of a page whose snapshot was seeded and whose startup open has run
const state = (overrides: Partial<StartupState> = {}): StartupState => ({
  boot: boot(),
  askedForLast: true,
  opening: null,
  openError: null,
  current: null,
  currentError: null,
  workspaces: [work, home],
  creatingNew: false,
  ...overrides,
});

describe('opensLastOnLoad', () => {
  it('opens the last workspace only while none is open and there is one to open', () => {
    expect(opensLastOnLoad(boot({ last: work }))).toBe(true);
    expect(opensLastOnLoad(boot({ current: work }))).toBe(false);
    expect(opensLastOnLoad(boot())).toBe(false);
  });

  it('asks main when there is no snapshot: openLast returns the open one', () => {
    expect(opensLastOnLoad(null)).toBe(true);
  });
});

describe('chooseScreen', () => {
  it('shows the splash for the last workspace from the very first render', () => {
    expect(chooseScreen(state({ boot: boot({ last: work }), askedForLast: false }))).toEqual({
      screen: 'splash',
      workspace: work,
    });
  });

  it('shows the open workspace at once on a reload or a reopened window', () => {
    expect(
      chooseScreen(state({ boot: boot({ current: work }), askedForLast: false, current: work })),
    ).toEqual({ screen: 'workspace', workspace: work });
  });

  it('shows the splash while a workspace opens, is created or is switched to', () => {
    expect(chooseScreen(state({ opening: { kind: 'open', workspace: home } }))).toEqual({
      screen: 'splash',
      workspace: home,
    });
    expect(
      chooseScreen(state({ opening: { kind: 'create', name: 'New', color: '#000000' } })),
    ).toEqual({ screen: 'splash', workspace: { name: 'New', color: '#000000' } });
    // switching: the old one is still current until the open closes it
    expect(
      chooseScreen(state({ current: work, opening: { kind: 'open', workspace: home } })),
    ).toMatchObject({ screen: 'splash', workspace: home });
  });

  it('shows the create page when there are no workspaces', () => {
    expect(
      chooseScreen(
        state({ boot: boot({ workspaces: { items: [], nextCursor: null } }), workspaces: [] }),
      ),
    ).toEqual({
      screen: 'create',
      error: null,
      canCancel: false,
    });
  });

  it('shows the picker when none is open, with why the last open failed', () => {
    expect(chooseScreen(state({ openError: new Error('Workspace data missing') }))).toEqual({
      screen: 'picker',
      workspaces: [work, home],
      error: 'Workspace data missing',
    });
  });

  it('shows the create page from the picker, which it can go back to', () => {
    expect(chooseScreen(state({ creatingNew: true }))).toEqual({
      screen: 'create',
      error: null,
      canCancel: true,
    });
  });

  it('shows the splash while the queries load, without a snapshot', () => {
    expect(chooseScreen(state({ boot: null, current: undefined, workspaces: undefined }))).toEqual({
      screen: 'splash',
      workspace: null,
    });
  });

  it('says DevBrain is unavailable, from the snapshot or from a failed call', () => {
    expect(chooseScreen(state({ boot: boot({ devBrainAvailable: false }) }))).toEqual({
      screen: 'unavailable',
    });
    expect(
      chooseScreen(
        state({
          boot: null,
          current: undefined,
          currentError: { data: { code: 'devbrain_unavailable' } },
        }),
      ),
    ).toEqual({ screen: 'unavailable' });
  });
});
