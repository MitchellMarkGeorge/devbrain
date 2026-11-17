import { describe, expect, it, vi } from 'vitest';
import type { EntitySummary, StampedId } from '@common/types';
import { TaskStatus } from '@common/types';
import { createSummaryLoader } from '@renderer/editor/use-entity-resolver';
import { entitiesReadBy } from '@renderer/ipc/query-invalidator';

const summary = (id: string): EntitySummary => ({
  type: 'task',
  id: id as never,
  title: `Task ${id}`,
  status: TaskStatus.NOT_STARTED,
});
const id = (n: number) => `tsk_${n}` as StampedId;

describe('createSummaryLoader', () => {
  it('asks for every id wanted in one turn in one call, each once', async () => {
    const fetch = vi.fn(async (ids: StampedId[]) => ids.map(summary));
    const load = createSummaryLoader(fetch);
    const loaded = await Promise.all([load(id(1)), load(id(2)), load(id(1))]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith([id(1), id(2)]);
    expect(loaded.map((s) => s?.id)).toEqual([id(1), id(2), id(1)]);

    // the next turn is a call of its own
    await load(id(3));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('splits a large turn into calls of 500, and gives null for an entity left out', async () => {
    const fetch = vi.fn(async (ids: StampedId[]) =>
      ids.filter((wanted) => wanted !== id(7)).map(summary),
    );
    const load = createSummaryLoader(fetch);
    const loaded = await Promise.all(Array.from({ length: 1_200 }, (_, n) => load(id(n))));
    expect(fetch.mock.calls.map(([ids]) => ids.length)).toEqual([500, 500, 200]);
    expect(loaded[7]).toBeNull();
    expect(loaded[8]?.title).toBe('Task tsk_8');
  });

  it('fails each id of a call that failed', async () => {
    const load = createSummaryLoader(async () => {
      throw new Error('no_workspace_open');
    });
    await expect(Promise.all([load(id(1)), load(id(2))])).rejects.toThrow('no_workspace_open');
  });
});

it('refetches pills when a task, project, note, event or calendar changes', () => {
  expect(entitiesReadBy(['entities', 'summaries'])).toEqual([
    'task',
    'project',
    'note',
    'event',
    'calendar',
  ]);
});
