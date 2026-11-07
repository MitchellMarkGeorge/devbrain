// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import {
  ensureWorkspaceOpen,
  followOpenWorkspace,
  isOpeningWorkspace,
  isSettledOn,
  openWorkspaceId,
} from '../../workspace/open';
import { FakeMain, workspace } from '../routing/fake-main';

const A = 'wsp_a' as WorkspaceId;
const B = 'wsp_b' as WorkspaceId;

let stop = () => {};
afterEach(() => {
  stop();
  delete window.ipcBridge;
});

function start(open: WorkspaceId | null, known = true) {
  const main = new FakeMain([workspace(A, 'A'), workspace(B, 'B', {})], open);
  window.ipcBridge = main.bridge();
  stop = followOpenWorkspace(known ? main.initialLoadContext().current : undefined);
  return main;
}

const opened = (main: FakeMain) => main.callsTo('workspaces.open').map((call) => call.input);

describe('ensureWorkspaceOpen', () => {
  it('opens nothing for the workspace already open, and opens another', async () => {
    const main = start(A);
    await ensureWorkspaceOpen(A);
    expect(opened(main)).toEqual([]);
    await ensureWorkspaceOpen(B);
    expect(opened(main)).toEqual([{ id: B }]);
    expect(openWorkspaceId()).toBe(B);
    expect(isSettledOn(B)).toBe(true);
  });

  it('asks main which is open, once, when the page loaded without knowing', async () => {
    const main = start(A, false);
    await Promise.all([ensureWorkspaceOpen(A), ensureWorkspaceOpen(A)]);
    expect(main.callsTo('workspaces.current')).toHaveLength(1);
    expect(opened(main)).toEqual([]);
  });

  it('joins an open under way for the same workspace, and queues one for another after it', async () => {
    const main = start(A);
    const release = main.hold('open');
    const toB = ensureWorkspaceOpen(B);
    const toBAgain = ensureWorkspaceOpen(B);
    // Back to A while B opens: A opens again after it, though it was open a moment ago
    const toA = ensureWorkspaceOpen(A);
    expect(isOpeningWorkspace()).toBe(true);
    expect(isSettledOn(A)).toBe(false);
    release();
    await Promise.all([toB, toBAgain, toA]);
    expect(opened(main)).toEqual([{ id: B }, { id: A }]);
    expect(main.open).toBe(A);
    expect(isSettledOn(A)).toBe(true);
  });

  it("rejects with the open's error, keeping the workspace main says is open", async () => {
    const main = start(A);
    main.workspaces[1].missing = true;
    await expect(ensureWorkspaceOpen(B)).rejects.toMatchObject({
      data: { code: 'workspace_data_missing' },
    });
    expect(openWorkspaceId()).toBe(A);
    expect(isOpeningWorkspace()).toBe(false);
  });

  it('follows changes main makes on its own, such as a delete', async () => {
    const main = start(A);
    await (await import('../../ipc')).ipc.workspaces.delete.mutate({ id: A });
    expect(openWorkspaceId()).toBeNull();
    expect(main.open).toBeNull();
  });
});
