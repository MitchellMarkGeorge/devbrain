import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { trpc } from '@renderer/ipc';
import { listedNote } from '@renderer/features/tasks/api/queries';
import { fakeNote } from '../../routing/fake-tasks';

// A task's note link draws from a loaded notes.list while notes.get loads: a picker's list is one
// page, the Notes page's is an infinite list. Both sit under notes.list's key.

describe('listedNote', () => {
  it('finds a note in a picker’s page and in the Notes page’s pages alike', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(trpc.notes.list.queryKey({ limit: 50 }), {
      items: [fakeNote('nte_picker', 'From a picker')],
      nextCursor: null,
    });
    queryClient.setQueryData(trpc.notes.list.infiniteQueryKey({ limit: 100 }), {
      pages: [{ items: [fakeNote('nte_page', 'From the Notes page')], nextCursor: null }],
      pageParams: [null],
    });
    expect(listedNote(queryClient, 'nte_picker')?.title).toBe('From a picker');
    expect(listedNote(queryClient, 'nte_page')?.title).toBe('From the Notes page');
    expect(listedNote(queryClient, 'nte_none')).toBeUndefined();
  });
});
