// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ProjectId, TaskId, WorkspaceId } from '@common/ids';
import {
  LinkState,
  ProjectStatus,
  Provider,
  TaskStatus,
  type ExternalRef,
  type SearchResult,
} from '@common/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../components';
import { queryClient } from '../../ipc';
import { TaskPickerItems } from '../../pages/notes/menus/NoteMenus';
import { PickerSearchFilter } from '../../pages/search/picker-search';
import { TaskParentPicker } from '../../pages/tasks/detail/TaskLinkPicker';
import { ProjectItems } from '../../pages/tasks/menus/TaskMenus';
import { click, eventually } from '../routing/harness';
import { FakeMain, workspace } from '../routing/fake-main';

// The pickers with a search row list what they loaded until something is typed, then ask
// search.search for their types: they find what they never loaded, leave out what they can't
// offer, and draw core's highlighted titles as search's HTML only.

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

// a picker's open menu, with the search row and items
const items = () =>
  [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map((item) =>
    item.textContent?.trim(),
  );
const item = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
    (element) => element.textContent?.trim() === text,
  ) ?? null;

// types into the search row, once the menu is open
async function type(label: string, text: string) {
  const input = () => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  await eventually(() => expect(input()).not.toBeNull());
  const field = input()!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function result(fields: Partial<SearchResult> & Pick<SearchResult, 'entityId'>): SearchResult {
  return {
    entityType: 'task',
    title: '',
    body: '',
    rank: -1,
    status: TaskStatus.NOT_STARTED,
    parentTaskId: null,
    projectStatus: null,
    color: null,
    external: null,
    ...fields,
  };
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

// tasks.list's first page: one open top-level task
function loadTasks(...titles: string[]) {
  main.routes.set('tasks.list', () => [
    {
      items: titles.map((title, n) => ({
        id: `tsk_loaded_${n}`,
        title,
        status: TaskStatus.NOT_STARTED,
        parentTaskId: null,
        dueDate: null,
        external: null,
      })),
      nextCursor: 'more',
    },
    [],
  ]);
}

const searchCalls = () => main.callsTo('search.search').map(({ input }) => input);

describe('Make subtask of ›', () => {
  const SELF = 'tsk_self' as TaskId;

  beforeEach(() => {
    loadTasks('Loaded parent');
    main.searchResults = [
      result({ entityId: 'tsk_far' as TaskId, title: 'Far away <b>parent</b>' }),
      result({ entityId: SELF, title: 'This <b>parent</b>' }),
      result({
        entityId: 'tsk_sub' as TaskId,
        title: 'Its subtask <b>parent</b>',
        parentTaskId: SELF,
      }),
      result({
        entityId: 'tsk_done' as TaskId,
        title: 'Done <b>parent</b>',
        status: TaskStatus.COMPLETED,
      }),
      result({ entityId: 'tsk_synced' as TaskId, title: 'Synced <b>parent</b>', external: synced }),
    ];
  });

  const open = (onPick = vi.fn()) => {
    render(
      createElement(TaskParentPicker, {
        taskId: SELF,
        onPick,
        open: true,
        trigger: createElement('button', null, 'Make subtask of'),
      }),
    );
    return onPick;
  };

  it('lists its loaded tasks while nothing is typed', async () => {
    open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    expect(searchCalls()).toEqual([]);
  });

  it('finds a task outside its first page, and picks it', async () => {
    const onPick = open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    await type('Search tasks', 'par');
    await type('Search tasks', 'parent');
    await eventually(() => expect(items()).toEqual(['Far away parent']));
    // debounced, and only tasks
    expect(searchCalls()).toEqual([{ query: 'parent', entityType: ['task'], limit: 50 }]);
    click(item('Far away parent'));
    expect(onPick).toHaveBeenCalledWith('tsk_far');
  });

  it('leaves out the task, its subtasks, closed tasks and synced tasks', async () => {
    open();
    await type('Search tasks', 'parent');
    await eventually(() => expect(searchCalls()).toHaveLength(1));
    await eventually(() => expect(items()).toEqual(['Far away parent']));
  });

  it('narrows its loaded tasks by title until the search answers', async () => {
    open();
    await eventually(() => expect(items()).toEqual(['Loaded parent']));
    await type('Search tasks', 'zzz');
    await eventually(() => expect(items()).toEqual([]));
  });
});

describe('a search result’s title', () => {
  beforeEach(() => loadTasks());

  it('draws the matches in bold, and markup that is not search’s as text', async () => {
    main.searchResults = [
      result({ entityId: 'tsk_1' as TaskId, title: '&lt;img src=x&gt; <b>bold</b>' }),
      result({ entityId: 'tsk_2' as TaskId, title: '<img src=x onerror=alert(1)> <b>raw</b>' }),
    ];
    render(
      createElement(TaskParentPicker, {
        taskId: 'tsk_self' as TaskId,
        onPick: vi.fn(),
        open: true,
        trigger: createElement('button', null, 'Make subtask of'),
      }),
    );
    await type('Search tasks', 'b');
    await eventually(() => expect(items()).toHaveLength(2));
    const [escaped, raw] = document.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    // core's escaped text stays text; the match is a <b>
    expect(escaped.textContent).toContain('<img src=x> bold');
    expect(escaped.querySelector('b')?.textContent).toBe('bold');
    // HTML that isn't escaped text and <b> is never parsed
    expect(raw.textContent).toContain('<img src=x onerror=alert(1)> raw');
    expect(document.querySelector('img')).toBeNull();
    expect(raw.querySelector('b')).toBeNull();
  });
});

describe('Link existing task › (a note’s)', () => {
  it('leaves out closed tasks, linked ones and local subtasks, and keeps a synced subtask', async () => {
    loadTasks('Loaded task');
    main.searchResults = [
      result({ entityId: 'tsk_far' as TaskId, title: 'Far <b>task</b>' }),
      result({ entityId: 'tsk_linked' as TaskId, title: 'Linked <b>task</b>' }),
      result({
        entityId: 'tsk_done' as TaskId,
        title: 'Cancelled <b>task</b>',
        status: TaskStatus.CANCELLED,
      }),
      result({
        entityId: 'tsk_sub' as TaskId,
        title: 'Local subtask <b>task</b>',
        parentTaskId: 'tsk_far' as TaskId,
      }),
      result({
        entityId: 'tsk_synced_sub' as TaskId,
        title: 'Synced subtask <b>task</b>',
        parentTaskId: 'tsk_synced' as TaskId,
        external: synced,
      }),
    ];
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
            createElement(TaskPickerItems, { exclude: new Set(['tsk_linked']), onPick: vi.fn() }),
          ),
        ),
      ),
    );
    await eventually(() => expect(items()).toEqual(['Loaded task']));
    await type('Search tasks', 'task');
    await eventually(() => expect(items()).toEqual(['Far task', 'Synced subtask task']));
  });
});

describe('the project picker', () => {
  beforeEach(() => {
    main.routes.set('projects.list', () => [
      {
        items: [
          { id: 'prj_loaded', title: 'Loaded project', color: null, status: ProjectStatus.ACTIVE },
        ],
        nextCursor: 'more',
      },
      [],
    ]);
    main.searchResults = [
      result({
        entityId: 'prj_far' as ProjectId,
        entityType: 'project',
        title: 'Far <b>project</b>',
        status: null,
        projectStatus: ProjectStatus.ACTIVE,
      }),
      result({
        entityId: 'prj_done' as ProjectId,
        entityType: 'project',
        title: 'Finished <b>project</b>',
        status: null,
        projectStatus: ProjectStatus.COMPLETED,
      }),
    ];
  });

  it('finds a project beyond the loaded ones, leaving out completed ones and "No project"', async () => {
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
    await eventually(() => expect(items()).toEqual(['Loaded project', 'No project']));
    await type('Search projects', 'project');
    await eventually(() => expect(items()).toEqual(['Far project']));
    expect(searchCalls()).toEqual([{ query: 'project', entityType: ['project'], limit: 50 }]);
    click(item('Far project'));
    expect(onPick).toHaveBeenCalledWith('prj_far');
  });
});
