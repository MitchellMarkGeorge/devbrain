/**
 * Drives the built app over a large workspace and times what a person waits for: startup, a
 * workspace switch, each page's first paint, scrolling, opening and typing in a long note, ⌘K,
 * a bulk edit and a sync page arriving. docs/performance.md explains the numbers.
 *
 *   npm run seed:large -- --path=.perf --reset
 *   npm run build
 *   npm run perf:app -- --path=.perf [--json=out.json]      # Linux without a display: xvfb-run -a
 *
 * Each step is timed in the page, from the navigation to the frame its content first shows, with
 * the renderer's long tasks (over 50 ms) counted. Main's IPC handler is wrapped for the run, so each
 * step also reports the calls it made, their time in main and their size. Playwright drives
 * Electron; it isn't a dependency of the app: `npm i --no-save playwright-core` if it is missing.
 *
 * The run writes to the workspace (it creates a second workspace to switch to, types into the long
 * note, sets the status of 200 tasks): seed a copy for it, not your own.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ROOT_PATH = path.resolve(REPO_ROOT, opt('path', '.perf'));
const JSON_OUT = opt('json', '');
const SWITCH_NAME = 'Perf switch';

/* eslint-disable @typescript-eslint/no-explicit-any -- Playwright's types aren't installed with the app */
type App = any;
type Page = any;

const require = createRequire(import.meta.url);
async function loadElectronDriver(): Promise<any> {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return (await import(name))._electron;
    } catch {
      // try the next
    }
  }
  console.error('Playwright is missing: npm i --no-save playwright-core');
  process.exit(1);
}

interface Call {
  at: number;
  path: string;
  type: string;
  ms: number;
  bytes: number;
}
interface Result {
  name: string;
  [key: string]: unknown;
}
const results: Result[] = [];

async function launch(electron: any): Promise<{ app: App; page: Page }> {
  const app = await electron.launch({
    executablePath: require('electron') as string,
    args: ['.'],
    cwd: REPO_ROOT,
    env: { ...process.env, DEV_PATH: ROOT_PATH },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(60_000);
  // tsx names the functions this file hands to the page and to main with a helper of its own,
  // which isn't defined there; strings are passed as they are
  const defineName = 'globalThis.__name = (fn) => fn';
  await page.addInitScript(defineName);
  await page.evaluate(defineName);
  await app.evaluate(defineName);
  // main's one IPC handler, wrapped to log each call
  await app.evaluate(({ ipcMain }: any) => {
    const log: Call[] = [];
    (globalThis as any).__perfCalls = log;
    const handler = ipcMain._invokeHandlers.get('ipc:call');
    ipcMain.removeHandler('ipc:call');
    ipcMain.handle('ipc:call', async (event: unknown, request: any) => {
      const start = performance.now();
      const at = Date.now();
      const result = await handler(event, request);
      log.push({
        at,
        path: request?.path,
        type: request?.type,
        ms: performance.now() - start,
        bytes: JSON.stringify(result ?? null).length,
      });
      return result;
    });
  });
  return { app, page };
}

const takeCalls = (app: App): Promise<Call[]> =>
  app.evaluate(() => (globalThis as any).__perfCalls.splice(0));

// resolves once main has answered no call for `quietMs`
async function settle(app: App, quietMs = 400) {
  const start = Date.now();
  for (;;) {
    let last: number;
    try {
      last = await app.evaluate(() => {
        const calls = (globalThis as any).__perfCalls as Call[];
        return calls.length > 0 ? calls[calls.length - 1].at : 0;
      });
    } catch {
      // Playwright now and then loses an evaluate's answer in main ("Resulting promise was
      // garbage collected"); ask again
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const now = Date.now();
    if (now - Math.max(last, start) >= quietMs || now - start > 20_000) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__perfLong) return;
    const durations: number[] = [];
    (window as any).__perfLong = durations;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
}
const takeLongTasks = (page: Page): Promise<number[]> =>
  page.evaluate(() => (window as any).__perfLong.splice(0));

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const round = (value: number) => Math.round(value * 10) / 10;

function callStats(calls: Call[]) {
  const byRoute = new Map<string, { n: number; ms: number; bytes: number }>();
  for (const call of calls) {
    const entry = byRoute.get(call.path) ?? { n: 0, ms: 0, bytes: 0 };
    entry.n++;
    entry.ms += call.ms;
    entry.bytes += call.bytes;
    byRoute.set(call.path, entry);
  }
  return {
    calls: calls.length,
    mainMs: round(sum(calls.map((call) => call.ms))),
    kb: Math.round(sum(calls.map((call) => call.bytes)) / 1024),
    routes: [...byRoute]
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 4)
      .map(
        ([route, { n, ms, bytes }]) =>
          `${route} ×${n} ${round(ms)}ms ${Math.round(bytes / 1024)}KB`,
      )
      .join(', '),
  };
}

function longTaskStats(durations: number[]) {
  return {
    longTaskMs: Math.round(sum(durations)),
    maxLongTask: Math.round(Math.max(0, ...durations)),
  };
}

function record(result: Result) {
  results.push(result);
  const { name, ...rest } = result;
  console.log(`${name}: ${JSON.stringify(rest)}`);
}

interface Ready {
  sel: string;
  n?: number;
  minText?: number;
  contains?: string;
}

// navigates to `url` and times it until `ready` holds in a frame, with the splash gone
async function timeNavigation(page: Page, url: string, ready: Ready): Promise<number> {
  const start: number = await page.evaluate((to: string) => {
    const now = performance.now();
    location.hash = `#${to}`;
    return now;
  }, url);
  const handle = await page.waitForFunction(
    ({ sel, n = 1, minText = 0, contains }: Ready) => {
      const elements = document.querySelectorAll(sel);
      if (elements.length < n || document.querySelector('[data-testid=splash]')) return false;
      if (minText && (elements[0].textContent ?? '').length < minText) return false;
      if (contains && ![...elements].some((el) => el.textContent?.includes(contains))) return false;
      return performance.now();
    },
    ready,
    { polling: 'raf', timeout: 60_000 },
  );
  return (await handle.jsonValue()) - start;
}

async function step(app: App, page: Page, name: string, url: string, ready: Ready, quietMs = 400) {
  await settle(app);
  await takeCalls(app);
  await takeLongTasks(page);
  const ms = await timeNavigation(page, url, ready);
  await settle(app, quietMs);
  record({
    name,
    ms: Math.round(ms),
    ...callStats(await takeCalls(app)),
    ...longTaskStats(await takeLongTasks(page)),
  });
}

const ROWS: Ready = { sel: '[role=grid] [role=row][aria-rowindex]' };

// what the run needs from the workspace, found through the app's own calls
async function findTargets(page: Page) {
  return page.evaluate(async (switchName: string) => {
    const bridge = (window as any).ipcBridge;
    const call = async (path: string, input: unknown, type = 'query') => {
      const result = await bridge.invoke({ path, type, input });
      if (!result.ok) throw new Error(`${path}: ${JSON.stringify(result.error)}`);
      return result.data;
    };
    const listed = await call('workspaces.list', undefined);
    const workspaces = (Array.isArray(listed) ? listed : listed.items) as {
      id: string;
      name: string;
    }[];
    const large = workspaces.find((ws) => ws.name !== switchName)!;
    let other = workspaces.find((ws) => ws.name === switchName);
    other ??= await call('workspaces.create', { name: switchName, color: '#22c55e' }, 'mutation');
    return { large: large.id, other: other!.id };
  }, SWITCH_NAME);
}

async function findEntities(page: Page) {
  return page.evaluate(async () => {
    const bridge = (window as any).ipcBridge;
    const call = async (path: string, input: unknown) => {
      const result = await bridge.invoke({ path, type: 'query', input });
      if (!result.ok) throw new Error(`${path}: ${JSON.stringify(result.error)}`);
      return result.data;
    };
    const [note] = await call('search.search', {
      query: 'Engineering handbook',
      entityType: ['note'],
      limit: 1,
    });
    const tasks = (
      await call('tasks.list', {
        filter: { excludeSubtasks: true },
        sort: { sortBy: 'priority', direction: 'desc' },
        limit: 200,
      })
    ).items as { id: string; subtaskProgress: unknown; link: { type: string } | null }[];
    const task =
      tasks.find((t) => t.subtaskProgress !== null && t.link?.type === 'note') ??
      tasks.find((t) => t.subtaskProgress !== null) ??
      tasks[0];
    return { note: note?.entity.id as string | undefined, task: task.id };
  });
}

async function main() {
  const electron = await loadElectronDriver();
  await fs.stat(path.join(ROOT_PATH, 'workspaces.json')).catch(() => {
    console.error(`No DevBrain folder at ${ROOT_PATH}: npm run seed:large -- --path=… first`);
    process.exit(1);
  });

  // find the workspaces, and leave the large one's Home as the page each launch opens on
  let ids: { large: string; other: string };
  {
    const { app, page } = await launch(electron);
    await page.waitForFunction(() => (window as any).ipcBridge !== undefined);
    ids = await findTargets(page);
    await page.evaluate((to: string) => (location.hash = `#${to}`), `/app/${ids.large}/home`);
    await page.waitForSelector('[role=row]');
    await page.waitForTimeout(1_500);
    await app.close();
  }

  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    const { app, page } = await launch(electron);
    const handle = await page.waitForFunction(
      () =>
        document.querySelectorAll('[role=row]').length > 0 &&
        !document.querySelector('[data-testid=splash]')
          ? performance.timeOrigin + performance.now()
          : false,
      null,
      { polling: 'raf', timeout: 60_000 },
    );
    record({
      name: `Startup, launch to Home #${i}`,
      ms: Math.round((await handle.jsonValue()) - start),
    });
    await app.close();
  }

  const { app, page } = await launch(electron);
  await page.waitForSelector('[role=row]');
  await page.waitForTimeout(2_000);
  await watchLongTasks(page);
  const W = `/app/${ids.large}`;
  const { note, task } = await findEntities(page);

  await step(app, page, 'Switch to another workspace', `/app/${ids.other}/tasks`, {
    sel: '[data-testid=page]',
  });
  await watchLongTasks(page);
  await step(app, page, 'Switch back (to Tasks)', `${W}/tasks`, ROWS);
  await watchLongTasks(page);
  await step(app, page, 'Home', `${W}/home`, { sel: '[role=row]' });
  await step(app, page, 'Tasks list, first paint', `${W}/tasks`, ROWS);

  // the list scrolled to its end: until its row count stops growing
  {
    await settle(app);
    await takeCalls(app);
    await takeLongTasks(page);
    const start = Date.now();
    let last = '';
    for (let same = 0; same <= 3; ) {
      const now: string = await page.evaluate(() => {
        const grid = document.querySelector('[role=grid]')!;
        grid.scrollTop = grid.scrollHeight;
        return `${grid.getAttribute('aria-rowcount')}:${grid.scrollHeight}`;
      });
      await page.waitForTimeout(30);
      if (now === last) {
        same++;
        await settle(app, 300);
      } else {
        same = 0;
        last = now;
      }
    }
    record({
      name: `Tasks list, scrolled to the end (${last.split(':')[0]} rows)`,
      ms: Date.now() - start,
      ...callStats(await takeCalls(app)),
      ...longTaskStats(await takeLongTasks(page)),
    });
  }

  await step(app, page, 'Tasks grouped by project', `${W}/tasks?view=group&group_by=project`, {
    sel: '[role=grid] [role=heading]',
  });
  await step(app, page, 'Tasks board', `${W}/tasks?view=board`, {
    sel: '[role=list] [role=listitem]',
    n: 3,
  });
  await step(app, page, 'Open a task', `${W}/tasks/${task}`, {
    sel: '[data-testid=task-page] .tiptap',
  });
  await step(app, page, 'Notes cards', `${W}/notes?view=card`, {
    sel: '[role=gridcell] [role=link]',
  });
  if (note) {
    await step(
      app,
      page,
      'Open the 200 KB note',
      `${W}/notes/${note}`,
      { sel: '[data-testid=note-page] .tiptap', minText: 100_000 },
      1_500,
    );
    // typing in a paragraph: each key, to the frame after it
    await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('.tiptap')!;
      editor.focus();
      const paragraph = editor.querySelectorAll(':scope > p')[40];
      getSelection()!.selectAllChildren(paragraph);
      getSelection()!.collapseToEnd();
    });
    await settle(app);
    await takeCalls(app);
    await takeLongTasks(page);
    const keys: number[] = await page.evaluate(async () => {
      const times: number[] = [];
      for (const character of ' typing into a long note to time it') {
        const start = performance.now();
        document.execCommand('insertText', false, character);
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        times.push(performance.now() - start);
      }
      return times.sort((a, b) => a - b);
    });
    // the autosave, 500 ms after the last key, and what it refetches
    await page.waitForTimeout(800);
    await settle(app, 600);
    record({
      name: 'Type in the 200 KB note (per key), then its autosave',
      p50: round(keys[Math.floor(keys.length / 2)]),
      p95: round(keys[Math.floor(keys.length * 0.95)]),
      ...callStats(await takeCalls(app)),
      ...longTaskStats(await takeLongTasks(page)),
    });
  }
  await step(app, page, 'Projects list (leaving the note)', `${W}/projects`, {
    sel: '[role=progressbar]',
  });
  const EVENTS: Ready = { sel: '[role=listitem] [role=button]', n: 10 };
  await step(app, page, 'Calendar month', `${W}/calendar?view=month`, EVENTS);
  await step(app, page, 'Calendar week', `${W}/calendar?view=week`, EVENTS);
  await step(app, page, 'Trash', `${W}/trash`, ROWS);

  // ⌘K, typed a key every 60 ms: from the last key to the last answer
  {
    await step(app, page, 'Tasks list, again', `${W}/tasks`, ROWS);
    await page.keyboard.press('Control+K');
    await page.waitForSelector('[role=dialog] input');
    await settle(app);
    await takeCalls(app);
    await page.keyboard.type('design system', { delay: 60 });
    const typed = Date.now();
    await settle(app, 500);
    const calls = await takeCalls(app);
    const searches = calls.filter((call) => call.path.startsWith('search.'));
    record({
      name: '⌘K: "design system", last key to last answer',
      ms: Math.round(Math.max(...searches.map((call) => call.at + call.ms)) - typed),
      ...callStats(calls),
    });
    await page.keyboard.press('Escape');
  }

  // the status of 200 tasks from the selection bar's keys: x and ↓ to select, 2 for In progress
  {
    const first = page.locator(`${ROWS.sel}`).first();
    await first.hover();
    await page.locator(`${ROWS.sel} [role=checkbox]`).first().click();
    for (let i = 0; i < 199; i++) {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('x');
    }
    await settle(app);
    await takeCalls(app);
    await takeLongTasks(page);
    await page.keyboard.press('2');
    await settle(app, 600);
    const calls = await takeCalls(app);
    const write = calls.find((call) => call.type === 'mutation');
    record({
      name: 'Status of 200 tasks, and the refetch after it',
      writeMs: write && round(write.ms),
      ...callStats(calls),
      ...longTaskStats(await takeLongTasks(page)),
    });
    await page.keyboard.press('Escape');
  }

  // a sync page arriving: main's push for the tasks, projects and events it wrote
  for (const [label, url, ready] of [
    ['Tasks list', `${W}/tasks`, ROWS],
    ['Calendar month', `${W}/calendar?view=month`, EVENTS],
    ['Home', `${W}/home`, { sel: '[role=row]' }],
  ] as const) {
    await step(app, page, `${label} (before a sync page)`, url, ready);
    await settle(app);
    await takeCalls(app);
    await takeLongTasks(page);
    await app.evaluate(({ BrowserWindow }: any) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('ipc-event:db.changes', {
          entities: ['task', 'project', 'event', 'externalSource'],
        });
      }
    });
    await settle(app, 600);
    record({
      name: `A sync page with ${label} open: the refetch`,
      ...callStats(await takeCalls(app)),
      ...longTaskStats(await takeLongTasks(page)),
    });
  }

  await app.close();
  if (JSON_OUT) await fs.writeFile(JSON_OUT, JSON.stringify(results, null, 1));
}

main().catch((error) => {
  console.error(error);
  if (JSON_OUT) void fs.writeFile(JSON_OUT, JSON.stringify(results, null, 1));
  process.exit(1);
});
