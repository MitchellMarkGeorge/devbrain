import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { affects, compile, invalidateFor, isPrefix } from '../../data/invalidation';

describe('isPrefix', () => {
  it('matches equal paths and shorter prefixes', () => {
    expect(isPrefix(['tasks'], ['tasks', 'get'])).toBe(true);
    expect(isPrefix(['tasks', 'get'], ['tasks', 'get'])).toBe(true);
    expect(isPrefix([], ['tasks'])).toBe(true);
  });

  it('rejects longer paths, other routers and partial names', () => {
    expect(isPrefix(['tasks', 'get'], ['tasks'])).toBe(false);
    expect(isPrefix(['notes'], ['tasks', 'get'])).toBe(false);
    expect(isPrefix(['task'], ['tasks', 'get'])).toBe(false);
    expect(isPrefix(['tasks', 'get'], ['tasks', 'getAll'])).toBe(false);
  });
});

describe('compile', () => {
  it('gives nothing for no entities', () => {
    expect(compile([])).toEqual([]);
  });

  it("gives an entity's paths", () => {
    expect(compile(['calendar'])).toEqual(affects.calendar);
  });

  it('merges entities without duplicates', () => {
    expect(compile(['task', 'project', 'task'])).toEqual([
      ['tasks'],
      ['projects'],
      ['favorites'],
      ['search'],
      ['archive'],
    ]);
  });

  it('drops a path another one covers', () => {
    const original = affects.integration;
    affects.integration = [['sync', 'status'], ['integrations', 'list'], ['sync']];
    try {
      expect(compile(['integration', 'externalSource'])).toEqual([
        ['sync'],
        ['integrations'],
        ['sources'],
      ]);
    } finally {
      affects.integration = original;
    }
  });
});

describe('invalidateFor', () => {
  const key = (router: string) => [[router, 'list'], { type: 'query' }];

  it("invalidates the queries under the entities' paths, and leaves the rest", async () => {
    const queryClient = new QueryClient();
    for (const router of ['tasks', 'projects', 'favorites', 'notes']) {
      queryClient.setQueryData(key(router), []);
    }
    queryClient.setQueryData(['tasks'], 'not a tRPC key');

    await invalidateFor(queryClient, ['task']);

    const invalidated = (queryKey: unknown[]) => queryClient.getQueryState(queryKey)?.isInvalidated;
    expect(invalidated(key('tasks'))).toBe(true);
    expect(invalidated(key('projects'))).toBe(true);
    expect(invalidated(key('favorites'))).toBe(true);
    expect(invalidated(key('notes'))).toBe(false);
    expect(invalidated(['tasks'])).toBe(false);
  });

  it('does nothing for no entities', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key('tasks'), []);

    await invalidateFor(queryClient, []);

    expect(queryClient.getQueryState(key('tasks'))?.isInvalidated).toBe(false);
  });
});
