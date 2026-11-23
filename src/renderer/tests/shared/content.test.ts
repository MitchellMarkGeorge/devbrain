import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { TaskId } from '@common/ids';
import { primeContent, taskContentQuery } from '@renderer/shared/api/content';

// How a page's loader primes a description's content query from the entity it read.

const ID = 'tsk_1' as TaskId;
const ENTITY_KEY = [['tasks', 'get'], { input: { id: ID }, type: 'query' }];

function setup() {
  const queryClient = new QueryClient();
  const read = vi.fn(async () => 'Read again');
  const content = { ...taskContentQuery(ID), queryFn: read };
  queryClient.setQueryData(ENTITY_KEY, { id: ID, description: 'From the task' });
  return { queryClient, read, content };
}

describe('primeContent', () => {
  it('takes the description from the entity the loader read, reading nothing more', async () => {
    const { queryClient, read, content } = setup();
    await primeContent(queryClient, content, ENTITY_KEY, 'From the task');
    expect(queryClient.getQueryData(content.queryKey)).toBe('From the task');
    expect(read).not.toHaveBeenCalled();
  });

  it('stores none as an empty text', async () => {
    const { queryClient, content } = setup();
    await primeContent(queryClient, content, ENTITY_KEY, null);
    expect(queryClient.getQueryData(content.queryKey)).toBe('');
  });

  it('keeps what is cached: the editor’s latest save', async () => {
    const { queryClient, read, content } = setup();
    queryClient.setQueryData(content.queryKey, 'Saved since');
    await primeContent(queryClient, content, ENTITY_KEY, 'From the task');
    expect(queryClient.getQueryData(content.queryKey)).toBe('Saved since');
    expect(read).not.toHaveBeenCalled();
  });

  it('reads the description itself when the entity’s query was invalidated, as it may be older', async () => {
    const { queryClient, read, content } = setup();
    await queryClient.invalidateQueries({ queryKey: ENTITY_KEY });
    await primeContent(queryClient, content, ENTITY_KEY, 'From the task');
    expect(queryClient.getQueryData(content.queryKey)).toBe('Read again');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
