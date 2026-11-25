import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import {
  LinkState,
  Provider,
  TaskStatus,
  type ExternalRef,
  type SearchResult,
} from '@common/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@renderer/components';
import { queryClient } from '@renderer/ipc';
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
// ask search.search for their type: each match carries the entity it found, as that entity's list
// returns it, with core's highlighted title. Project pickers load every open project and filter
// them in the menu.

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

// a match as search.search answers it: the entity found, and its highlighted title (the entity's
// title with the first word in bold, unless given)
function found(
  entityType: SearchResult['entityType'],
  entity: { title: string } & Record<string, unknown>,
  title = entity.title.replace(/^(\S+)/, '<b>$1</b>'),
): SearchResult {
  return { entityType, entity, title, body: '', key: '', rank: -1 } as unknown as SearchResult;
}
const foundTasks = (...rows: ReturnType<typeof taskRow>[]) => rows.map((row) => found('task', row));
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
    expect(inputsTo('search.search')).toEqual([]);
  });

  it('searches every task once typing pauses, and picks what it found', async () => {
    main.searchResults = foundTasks(taskRow('tsk_far', 'Far away parent'));
    const onPick = open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    await type('Search tasks', 'par');
    await type('Search tasks', 'parent');
    await eventually(() => expect(items()).toEqual(['Far away parent']));
    // debounced, and only tasks
    expect(inputsTo('search.search')).toEqual([
      { query: 'parent', entityType: ['task'], limit: 50 },
    ]);
    // the match in bold, as core highlighted it
    expect(item('Far away parent')?.querySelector('b')?.textContent).toBe('Far');
    click(item('Far away parent'));
    expect(onPick).toHaveBeenCalledWith('tsk_far');
  });

  it('leaves out the task, subtasks, closed tasks and synced tasks it finds', async () => {
    main.searchResults = foundTasks(
      taskRow('tsk_far', 'Far away parent'),
      taskRow(SELF, 'This parent'),
      taskRow('tsk_sub', 'Subtask parent', { parentTaskId: 'tsk_far' }),
      taskRow('tsk_done', 'Done parent', { status: TaskStatus.COMPLETED }),
      taskRow('tsk_cancelled', 'Cancelled parent', { status: TaskStatus.CANCELLED }),
      taskRow('tsk_synced', 'Synced parent', { external: synced }),
    );
    open();
    await type('Search tasks', 'parent');
    await eventually(() => expect(inputsTo('search.search')).toHaveLength(1));
    await eventually(() => expect(items()).toEqual(['Far away parent']));
  });

  it('draws markup in a title that is not search’s as text', async () => {
    main.searchResults = [
      found('task', taskRow('tsk_1', '<img src=x> bold'), '&lt;img src=x&gt; <b>bold</b>'),
      found('task', taskRow('tsk_2', 'raw'), '<img src=x onerror=alert(1)> <b>raw</b>'),
    ];
    open();
    await type('Search tasks', 'b');
    await eventually(() => expect(items()).toHaveLength(2));
    const [escaped, raw] = itemElements();
    expect(escaped.textContent).toContain('<img src=x> bold');
    expect(escaped.querySelector('b')?.textContent).toBe('bold');
    expect(raw.textContent).toContain('<img src=x onerror=alert(1)> raw');
    expect(raw.querySelector('b')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('says "Searching…" until search answers, and only then that nothing matches', async () => {
    answer('tasks.list', { items: [], nextCursor: null });
    const release = main.hold('search.search');
    open();
    await type('Search tasks', 'zzz');
    await eventually(() => expect(inputsTo('search.search')).toHaveLength(1));
    expect(emptyText()).toBe('Searching…');
    release();
    await eventually(() => expect(emptyText()).toBe('No tasks match'));
  });

  it('keeps the loaded tasks on screen until the first search answers', async () => {
    main.searchResults = foundTasks(taskRow('tsk_far', 'Far away parent'));
    const release = main.hold('search.search');
    open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    await type('Search tasks', 'far');
    await eventually(() => expect(inputsTo('search.search')).toHaveLength(1));
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
    main.searchResults = [
      found('event', {
        id: 'evt_old',
        title: 'Old review',
        startAt: lastYear,
        endAt: lastYear,
        color: null,
      }),
      found('note', { id: 'nte_old', title: 'Old notes', project: null }),
    ];
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
  it('leaves out linked and closed tasks and local subtasks, and keeps a synced subtask', async () => {
    answer('tasks.list', {
      items: [
        taskRow('tsk_loaded', 'Loaded task'),
        taskRow('tsk_loaded_sub', 'Loaded subtask', { parentTaskId: 'tsk_loaded' }),
      ],
      nextCursor: null,
    });
    main.searchResults = foundTasks(
      taskRow('tsk_far', 'Far task'),
      taskRow('tsk_linked', 'Linked task'),
      taskRow('tsk_done', 'Done task', { status: TaskStatus.COMPLETED }),
      taskRow('tsk_sub', 'Local subtask', { parentTaskId: 'tsk_far' }),
      taskRow('tsk_synced_sub', 'Synced subtask', { parentTaskId: 'tsk_x', external: synced }),
    );
    render(
      inMenu(createElement(TaskPickerItems, { exclude: new Set(['tsk_linked']), onPick: vi.fn() })),
    );
    await eventually(() => expect(items()).toEqual(['Loaded task']));
    await type('Search tasks', 'task');
    await eventually(() => expect(items()).toEqual(['Far task', 'Synced subtask']));
    expect(inputsTo('search.search')).toEqual([{ query: 'task', entityType: ['task'], limit: 50 }]);
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
      usePickerSearch(['note']);
      return null;
    }
    expect(() => renderToString(createElement(Rows))).toThrow(
      'usePickerSearch needs a PickerSearchFilter around its menu',
    );
  });
});
