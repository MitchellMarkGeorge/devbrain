// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import { LinkState, Provider, TaskStatus, type ExternalRef } from '@common/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@renderer/components';
import { queryClient, trpc } from '@renderer/ipc';
import { TaskPickerItems } from '@renderer/features/notes/components/menus/NoteMenus';
import {
  PickerSearchFilter,
  usePickerSearch,
} from '@renderer/features/search/components/picker-search';
import {
  TaskLinkPicker,
  TaskParentPicker,
} from '@renderer/features/tasks/components/detail/TaskLinkPicker';
import { ProjectItems } from '@renderer/features/tasks/components/menus/TaskMenus';
import { click, eventually } from '../../routing/harness';
import { FakeMain, workspace } from '../../routing/fake-main';

// The pickers of events, notes and tasks list what they loaded until something is typed, then
// search every row of their type through its own route (tasks.search, notes.search,
// events.search), which answers with the same rows as the type's list. Project pickers load every
// open project and filter them in the menu.

const WORK = 'wsp_work' as WorkspaceId;

let main: FakeMain;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  main = new FakeMain([workspace(WORK, 'Work')], WORK);
  window.ipcBridge = main.bridge();
  queryClient.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
  delete window.ipcBridge;
});

const render = (element: ReactElement) =>
  root.render(createElement(QueryClientProvider, { client: queryClient }, element));

// a menu of its own, as the Notes pages' pickers are drawn
const inMenu = (items: ReactElement) =>
  createElement(
    PickerSearchFilter,
    null,
    createElement(
      DropdownMenu,
      { open: true },
      createElement(DropdownMenuTrigger, { render: createElement('button') }),
      createElement(DropdownMenuContent, null, items),
    ),
  );

const itemElements = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const items = () => itemElements().map((item) => item.textContent?.trim());
const item = (text: string) =>
  itemElements().find((element) => element.textContent?.trim().startsWith(text)) ?? null;
const emptyText = () => document.querySelector('[role="status"]')?.textContent ?? null;

// types into the search row, once the menu is open
async function type(label: string, text: string) {
  const input = () => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  await eventually(() => expect(input()).not.toBeNull());
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input()!, text);
  input()!.dispatchEvent(new Event('input', { bubbles: true }));
}

const synced: ExternalRef = {
  provider: Provider.LINEAR,
  state: LinkState.SYNCED,
  key: 'ENG-1',
  url: 'https://linear.app/acme/issue/ENG-1',
  statusLabel: null,
  priorityLabel: null,
  lastSyncedAt: new Date('2026-11-01T00:00:00Z'),
};

// a task as tasks.list and tasks.search return it, with what the pickers read
function taskRow(id: string, title: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    title,
    status: TaskStatus.NOT_STARTED,
    parentTaskId: null,
    dueDate: null,
    external: null,
    ...fields,
  };
}

const answer = (path: string, data: unknown) => main.routes.set(path, () => [data, []]);
const inputsTo = (path: string) => main.callsTo(path).map(({ input }) => input);

describe('Make subtask of ›', () => {
  const SELF = 'tsk_self';

  const open = (onPick = vi.fn()) => {
    render(
      createElement(TaskParentPicker, {
        taskId: SELF as never,
        onPick,
        open: true,
        trigger: createElement('button', null, 'Make subtask of'),
      }),
    );
    return onPick;
  };

  beforeEach(() => {
    answer('tasks.list', { items: [taskRow('tsk_loaded', 'Loaded parent')], nextCursor: 'more' });
  });

  it('lists its loaded tasks while nothing is typed, searching nothing', async () => {
    open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    expect(inputsTo('tasks.search')).toEqual([]);
  });

  it('searches every open local top-level task once typing pauses, and picks what it found', async () => {
    answer('tasks.search', [taskRow('tsk_far', 'Far away parent'), taskRow(SELF, 'This task')]);
    const onPick = open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    await type('Search tasks', 'par');
    await type('Search tasks', 'parent');
    // the task itself is never offered
    await eventually(() => expect(items()).toEqual(['Far away parent']));
    // debounced, with the loaded list's own filter
    expect(inputsTo('tasks.search')).toEqual([
      {
        query: 'parent',
        filter: { excludeSubtasks: true, excludeClosed: true, origin: 'local' },
        limit: 50,
      },
    ]);
    expect(inputsTo('tasks.list')).toContainEqual(
      expect.objectContaining({
        filter: { excludeSubtasks: true, excludeClosed: true, origin: 'local' },
      }),
    );
    click(item('Far away parent'));
    expect(onPick).toHaveBeenCalledWith('tsk_far');
  });

  it('says "Searching…" until search answers, and only then that nothing matches', async () => {
    answer('tasks.list', { items: [], nextCursor: null });
    answer('tasks.search', []);
    const release = main.hold('tasks.search');
    open();
    await type('Search tasks', 'zzz');
    await eventually(() => expect(inputsTo('tasks.search')).toHaveLength(1));
    expect(emptyText()).toBe('Searching…');
    release();
    await eventually(() => expect(emptyText()).toBe('No tasks match'));
  });

  it('keeps the loaded tasks on screen until the first search answers', async () => {
    answer('tasks.search', [taskRow('tsk_far', 'Far away parent')]);
    const release = main.hold('tasks.search');
    open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    await type('Search tasks', 'far');
    await eventually(() => expect(inputsTo('tasks.search')).toHaveLength(1));
    expect(items()).toEqual(['Loaded parent']);
    release();
    await eventually(() => expect(items()).toEqual(['Far away parent']));
  });
});

describe('Link to › (a task’s)', () => {
  it('draws a searched event as a loaded one, with its date, at any date', async () => {
    answer('events.listForCalendar', []);
    answer('notes.list', { items: [], nextCursor: null });
    const lastYear = new Date(2025, 2, 4, 9);
    answer('events.search', [
      { id: 'evt_old', title: 'Old review', startAt: lastYear, endAt: lastYear, color: null },
    ]);
    answer('notes.search', [{ id: 'nte_old', title: 'Old notes', project: null }]);
    const onPick = vi.fn();
    render(
      createElement(TaskLinkPicker, {
        task: { linkedEventId: null, linkedNoteId: null },
        onPick,
        open: true,
        trigger: createElement('button', null, 'Link to'),
      }),
    );
    await type('Search events and notes', 'old');
    await eventually(() => expect(items()).toHaveLength(2));
    expect(item('Old review')?.textContent).toMatch(/Mar 4/);
    expect(item('Old notes')).not.toBeNull();
    click(item('Old review'));
    expect(onPick).toHaveBeenCalledWith({ linkedEventId: 'evt_old' });
  });
});

describe('Link existing task › (a note’s)', () => {
  it('leaves out linked tasks and local subtasks, loaded or searched, and keeps a synced subtask', async () => {
    answer('tasks.list', {
      items: [
        taskRow('tsk_loaded', 'Loaded task'),
        taskRow('tsk_loaded_sub', 'Loaded subtask', { parentTaskId: 'tsk_loaded' }),
      ],
      nextCursor: null,
    });
    answer('tasks.search', [
      taskRow('tsk_far', 'Far task'),
      taskRow('tsk_linked', 'Linked task'),
      taskRow('tsk_sub', 'Local subtask', { parentTaskId: 'tsk_far' }),
      taskRow('tsk_synced_sub', 'Synced subtask', { parentTaskId: 'tsk_x', external: synced }),
    ]);
    render(
      inMenu(createElement(TaskPickerItems, { exclude: new Set(['tsk_linked']), onPick: vi.fn() })),
    );
    await eventually(() => expect(items()).toEqual(['Loaded task']));
    await type('Search tasks', 'task');
    await eventually(() => expect(items()).toEqual(['Far task', 'Synced subtask']));
    expect(inputsTo('tasks.search')).toEqual([
      { query: 'task', filter: { excludeClosed: true }, limit: 50 },
    ]);
  });
});

describe('the project picker', () => {
  it('loads every open project, page after page, and filters them as typed', async () => {
    main.routes.set('projects.list', (args) => [
      args.cursor === 'page2'
        ? { items: [{ id: 'prj_2', title: 'Second page project', color: null }], nextCursor: null }
        : {
            items: [{ id: 'prj_1', title: 'First page project', color: null }],
            nextCursor: 'page2',
          },
      [],
    ]);
    const onPick = vi.fn();
    render(
      createElement(
        PickerSearchFilter,
        null,
        createElement(
          DropdownMenu,
          { open: true },
          createElement(DropdownMenuTrigger, { render: createElement('button') }),
          createElement(
            DropdownMenuContent,
            null,
            createElement(ProjectItems, { projectId: null, onPick }),
          ),
        ),
      ),
    );
    await eventually(() =>
      expect(items()).toEqual(['First page project', 'Second page project', 'No project']),
    );
    expect(inputsTo('projects.list')[0]).toMatchObject({
      filter: { excludeCompleted: true },
      limit: 200,
    });
    expect(inputsTo('search.search')).toEqual([]);
  });
});

describe('usePickerSearch', () => {
  it('throws outside a PickerSearchFilter, where it would never search', () => {
    function Rows() {
      usePickerSearch((query) => trpc.notes.search.queryOptions({ query }));
      return null;
    }
    expect(() => renderToString(createElement(Rows))).toThrow(
      'usePickerSearch needs a PickerSearchFilter around its menu',
    );
  });
});
