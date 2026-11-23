import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@common/types';
import { keepsTask } from '../../sync/presence';

// The rule every provider's tasks follow: what sync keeps of an item it listed or resolved. Deleted
// and gone items never get here; a provider reports their ids instead.

const task = (status: TaskStatus, hidden: boolean, assignedToViewer = true) => ({
  status,
  hidden,
  assignedToViewer,
});

describe('keepsTask', () => {
  it('keeps a live task, open or closed', () => {
    expect(keepsTask(task(TaskStatus.IN_PROGRESS, false))).toBe(true);
    expect(keepsTask(task(TaskStatus.COMPLETED, false))).toBe(true);
  });

  it('takes out a hidden open task, and keeps a hidden closed one as the user’s record', () => {
    expect(keepsTask(task(TaskStatus.NOT_STARTED, true))).toBe(false);
    expect(keepsTask(task(TaskStatus.IN_PROGRESS, true))).toBe(false);
    expect(keepsTask(task(TaskStatus.COMPLETED, true))).toBe(true);
    expect(keepsTask(task(TaskStatus.CANCELLED, true))).toBe(true);
  });

  it('takes out a task no longer assigned to the viewer, whatever else', () => {
    expect(keepsTask(task(TaskStatus.IN_PROGRESS, false, false))).toBe(false);
    expect(keepsTask(task(TaskStatus.COMPLETED, true, false))).toBe(false);
  });
});
