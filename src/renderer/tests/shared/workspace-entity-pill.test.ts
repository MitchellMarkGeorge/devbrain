import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { TaskStatus } from '@common/types';
import { RichTextEditor } from '@renderer/editor/RichTextEditor';
import { trpc } from '@renderer/ipc';
import { WorkspaceEntityPill } from '@renderer/shared/components/WorkspaceEntityPill';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
// nothing is stale, so a task put in the cache is never fetched
let queryClient: QueryClient;

// a task in the cache, as tasks.get returns it
function setTask(task: { title: string; status?: TaskStatus; archivedAt?: Date }) {
  act(() => {
    queryClient.setQueryData(trpc.tasks.get.queryKey({ id: 'tsk_1' as never }), {
      status: TaskStatus.NOT_STARTED,
      ...task,
    } as never);
  });
}

async function render(onOpenEntity = vi.fn(), value = 'See [Old title](devbrain://task/tsk_1)') {
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(RichTextEditor, {
          initialValue: value,
          label: 'Note',
          entityPill: WorkspaceEntityPill,
          onOpenEntity,
        }),
      ),
    );
  });
  // React node views mount after the editor
  await act(async () => {});
}

const pill = () => container.querySelector<HTMLElement>('[data-entity-type="task"] button')!;

beforeEach(() => {
  // React Query tells its observers at once, not on a later tick, so each act sees the change
  notifyManager.setScheduler((callback) => callback());
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

describe('WorkspaceEntityPill', () => {
  it("draws again when its entity's query changes, and as missing once it is trashed", async () => {
    setTask({ title: 'First title' });
    await render();
    expect(pill().textContent).toBe('First title');

    setTask({ title: 'Renamed' });
    expect(pill().textContent).toBe('Renamed');
    expect(pill().hasAttribute('data-missing')).toBe(false);

    setTask({ title: 'Renamed', archivedAt: new Date() });
    // gone: the stored label, drawn as missing
    expect(pill().textContent).toBe('Old title');
    expect(pill().hasAttribute('data-missing')).toBe(true);
  });

  it('opens its entity with what it loaded', async () => {
    const onOpenEntity = vi.fn();
    setTask({ title: 'Current title', status: TaskStatus.COMPLETED });
    await render(onOpenEntity);
    act(() => pill().click());
    expect(onOpenEntity).toHaveBeenCalledWith(
      'task',
      'tsk_1',
      expect.objectContaining({ title: 'Current title', status: TaskStatus.COMPLETED }),
    );
  });

  it('draws a link whose id is no id of its type as missing, without a query', async () => {
    // a project's id in a task link
    await render(vi.fn(), 'See [Old title](devbrain://task/prj_1)');
    expect(pill().textContent).toBe('Old title');
    expect(pill().hasAttribute('data-missing')).toBe(true);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
