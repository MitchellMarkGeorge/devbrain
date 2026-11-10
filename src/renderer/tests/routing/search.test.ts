// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteId, ProjectId, TaskId, WorkspaceId } from '@common/ids';
import {
  LinkState,
  Provider,
  TaskStatus,
  type ExternalRef,
  type SearchResult,
} from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { eventually, startApp, stopApps } from './harness';

// ⌘K search as the app mounts it: opened by ⌘K or the sidebar's button, over the fake main's
// search.search and recents.list.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

function key(key: string, options: KeyboardEventInit = {}) {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  );
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Search"]');
const input = () => dialog()?.querySelector<HTMLInputElement>('input[aria-label="Search"]') ?? null;
const options = () => [...(dialog()?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
const optionTexts = () => options().map((option) => option.textContent);
const filterButton = (label: string) =>
  [...(dialog()?.querySelectorAll<HTMLElement>('[aria-label="Result type"] button') ?? [])].find(
    (button) => button.textContent?.startsWith(label),
  );

function type(text: string) {
  const field = input();
  if (!field) throw new Error('No search input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

const linear: ExternalRef = {
  provider: Provider.LINEAR,
  state: LinkState.SYNCED,
  key: 'ENG-124',
  url: 'https://linear.app/acme/issue/ENG-124',
  statusLabel: null,
  priorityLabel: null,
  lastSyncedAt: new Date('2026-11-01T00:00:00Z'),
};

function result(fields: Partial<SearchResult> & Pick<SearchResult, 'entityId'>): SearchResult {
  return {
    entityType: 'task',
    title: '',
    body: '',
    rank: -1,
    status: null,
    color: null,
    external: null,
    ...fields,
  };
}

const RESULTS: SearchResult[] = [
  result({
    entityId: 'tsk_1' as TaskId,
    title: 'Implement OAuth2 <b>PKCE</b> flow',
    status: TaskStatus.IN_PROGRESS,
    external: linear,
  }),
  result({ entityId: 'tsk_2' as TaskId, title: 'Write <b>PKCE</b> guide' }),
  result({
    entityId: 'nte_1' as NoteId,
    entityType: 'note',
    title: '&lt;img src=x onerror=alert(1)&gt; <b>PKCE</b> notes',
    body: '…a 10-minute code TTL, behind a <b>PKCE</b> flag…',
  }),
  result({
    entityId: 'prj_1' as ProjectId,
    entityType: 'project',
    title: 'Auth <b>PKCE</b>',
    color: '#3366ff',
  }),
];

async function openSearch(results: SearchResult[] = RESULTS) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.searchResults = results;
  const app = startApp(main, { url: `/app/${WORK}/home` });
  await eventually(() => expect(app.text()).toContain('Work recents.list'));
  key('k', { metaKey: true });
  await eventually(() => expect(input()).not.toBeNull());
  return { app, main };
}

describe('⌘K search', () => {
  it('opens with ⌘K on Recent and the Go to commands, with their keys', async () => {
    await openSearch();
    await eventually(() => expect(dialog()?.textContent).toContain('Recent'));
    const texts = optionTexts();
    expect(texts[0]).toContain('Work recents.list');
    expect(texts).toContainEqual(expect.stringContaining('Home'));
    expect(texts.find((text) => text?.startsWith('Tasks'))).toContain('G T');
    expect(dialog()?.textContent).toContain('Go to');
  });

  it("opens from the sidebar's search button", async () => {
    const main = new FakeMain([workspace(WORK, 'Work')], WORK);
    const app = startApp(main, { url: `/app/${WORK}/home` });
    await eventually(() => expect(app.text()).toContain('Work recents.list'));
    document.querySelector<HTMLElement>('button[aria-label="Search"]')?.click();
    await eventually(() => expect(input()).not.toBeNull());
  });

  it('searches once typing settles, and groups the results with counts', async () => {
    const { main } = await openSearch();
    type('p');
    type('pk');
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    // debounced: the words typed in between were never asked for
    expect(main.callsTo('search.search').map(({ input }) => input)).toEqual([
      { query: 'pkce', entityType: [], limit: 200 },
    ]);
    const text = dialog()?.textContent ?? '';
    expect(text).toMatch(/Tasks2/);
    expect(text).toMatch(/Notes1/);
    expect(text).toMatch(/Projects1/);
    expect(filterButton('All')?.textContent).toBe('All4');
    // a synced task's key as its source pill
    expect(optionTexts()[0]).toContain('ENG-124');
  });

  it('counts every match with search.counts, past the 200 a search returns', async () => {
    const { main } = await openSearch();
    main.searchCounts = { task: 300, note: 12, project: 1, event: 0 };
    type('pkce');
    await eventually(() => expect(filterButton('All')?.textContent).toBe('All313'));
    expect(filterButton('Tasks')?.textContent).toBe('Tasks300');
    expect(dialog()?.textContent).toMatch(/Tasks300/);
    expect(main.callsTo('search.counts').map(({ input }) => input)).toEqual([{ query: 'pkce' }]);
  });

  it("searches the selected type's own results", async () => {
    const { main } = await openSearch();
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    key('Tab');
    await eventually(() =>
      expect(main.callsTo('search.search').map(({ input }) => input)).toContainEqual({
        query: 'pkce',
        entityType: ['task'],
        limit: 200,
      }),
    );
    await eventually(() => expect(optionTexts()).toHaveLength(2));
  });

  it('says which type has nothing under its filter', async () => {
    await openSearch(RESULTS.filter(({ entityType }) => entityType !== 'task'));
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(2));
    key('Tab');
    await eventually(() => expect(dialog()?.textContent).toContain('No tasks for “pkce”'));
  });

  it('draws escaped text as text and only <b> as markup', async () => {
    await openSearch();
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    const note = options()[2];
    expect(note.textContent).toContain('<img src=x onerror=alert(1)> PKCE notes');
    expect(note.querySelector('img')).toBeNull();
    expect([...note.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['PKCE', 'PKCE']);
  });

  it('draws a title with other markup as text', async () => {
    await openSearch([
      result({ entityId: 'tsk_9' as TaskId, title: '<img src=x onerror=alert(1)><b>PKCE</b>' }),
    ]);
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(1));
    expect(options()[0].querySelector('img, b')).toBeNull();
    expect(options()[0].textContent).toContain('PKCE');
  });

  it('switches the type filter with Tab and ⇧Tab', async () => {
    await openSearch();
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    key('Tab');
    await eventually(() => expect(optionTexts()).toHaveLength(2));
    expect(filterButton('Tasks')?.getAttribute('aria-pressed')).toBe('true');
    key('Tab');
    await eventually(() => expect(optionTexts()).toHaveLength(1));
    expect(optionTexts()[0]).toContain('notes');
    key('Tab', { shiftKey: true });
    key('Tab', { shiftKey: true });
    await eventually(() => expect(optionTexts()).toHaveLength(4));
  });

  it('shows the no-results state with New Task', async () => {
    await openSearch([]);
    type('rotation policy');
    await eventually(() =>
      expect(dialog()?.textContent).toContain('No results for “rotation policy”'),
    );
    expect(dialog()?.textContent).toContain('New Task “rotation policy”');
    expect(filterButton('All')?.textContent).toBe('All0');
  });

  it('keeps Recent and Go to, with no counts, while the first search runs', async () => {
    const { main } = await openSearch();
    await eventually(() => expect(dialog()?.textContent).toContain('Go to'));
    const before = optionTexts();
    const release = main.hold('search.search');
    type('pkce');
    await eventually(() => expect(main.callsTo('search.search')).toHaveLength(1));
    expect(optionTexts()).toEqual(before);
    expect(dialog()?.textContent).toContain('Recent');
    expect(filterButton('All')?.textContent).toBe('All');
    expect(dialog()?.textContent).not.toContain('No results');
    release();
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    expect(filterButton('All')?.textContent).toBe('All4');
  });

  it("keeps the last search's results and counts while the next one runs", async () => {
    const { main } = await openSearch();
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    const release = main.hold('search.search');
    main.searchResults = RESULTS.slice(0, 1);
    type('pkce flow');
    await eventually(() => expect(main.callsTo('search.search')).toHaveLength(2));
    expect(optionTexts()).toHaveLength(4);
    expect(filterButton('All')?.textContent).toBe('All4');
    release();
    await eventually(() => expect(optionTexts()).toHaveLength(1));
    expect(filterButton('All')?.textContent).toBe('All1');
  });

  it('keeps the no-results state, naming the query searched, while the next search runs', async () => {
    const { main } = await openSearch([]);
    type('rotation');
    await eventually(() => expect(dialog()?.textContent).toContain('No results for “rotation”'));
    const release = main.hold('search.search');
    type('rotation policy');
    await eventually(() => expect(main.callsTo('search.search')).toHaveLength(2));
    expect(dialog()?.textContent).toContain('No results for “rotation”');
    release();
    await eventually(() =>
      expect(dialog()?.textContent).toContain('No results for “rotation policy”'),
    );
  });

  it('keeps the last results when the box is emptied and typed in again', async () => {
    const { main } = await openSearch();
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    type('');
    await eventually(() => expect(dialog()?.textContent).toContain('Go to'));
    // Recent and Go to have no counts
    expect(filterButton('All')?.textContent).toBe('All');
    const release = main.hold('search.search');
    main.searchResults = RESULTS.slice(0, 1);
    type('n');
    // the last search's results, at once, while the new one waits
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    expect(filterButton('All')?.textContent).toBe('All4');
    await eventually(() => expect(main.callsTo('search.search')).toHaveLength(2));
    expect(optionTexts()).toHaveLength(4);
    release();
    await eventually(() => expect(optionTexts()).toHaveLength(1));
  });

  it('opens the highlighted result with ↵, through useOpenEntity', async () => {
    const { app } = await openSearch();
    type('pkce');
    await eventually(() => expect(optionTexts()).toHaveLength(4));
    key('ArrowDown');
    key('Enter');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks/tsk_2`));
    await eventually(() => expect(dialog()).toBeNull());
  });

  it('runs a Go to command', async () => {
    const { app } = await openSearch();
    await eventually(() => expect(optionTexts()).toContainEqual(expect.stringContaining('Notes')));
    options()
      .find((option) => option.textContent?.startsWith('Notes'))
      ?.click();
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/notes`));
  });
});
