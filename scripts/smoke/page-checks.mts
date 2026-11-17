// Expressions the smoke check evaluates in the app's page (scripts/smoke.mts). They run as page
// scripts, so they reach main only through the bridge the preload exposes, as the app does.

/** What the page can reach, and its Content-Security-Policy (docs/security/untrusted-content.md). */
export const PAGE_CHECKS = `(() => ({
  csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '',
  nodeInPage: typeof require !== 'undefined' || typeof process !== 'undefined',
  bridge: typeof window.ipcBridge?.invoke === 'function',
}))()`;

export interface PageCheckResult {
  csp: string;
  nodeInPage: boolean;
  bridge: boolean;
}

/**
 * Creates a workspace (its database, in better-sqlite3, migrated with the migrations the app
 * ships), lets the route open it as the app does (docs/renderer/routing.md), writes a task, and
 * waits for the tasks page to draw it in the bundled fonts.
 */
export const WORKSPACE_CHECK = `(async () => {
  const bridge = window.ipcBridge;
  const call = async (path, type, input) => {
    const result = await bridge.invoke({ path, type, input });
    if (!result.ok) throw new Error(path + ' failed: ' + JSON.stringify(result.error.data ?? result.error));
    return result.data;
  };
  const waitFor = async (what, test) => {
    for (let i = 0; i < 300; i++) {
      if (await test()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('timed out waiting for ' + what);
  };

  const workspace = await call('workspaces.create', 'mutation', { name: 'Smoke check', color: '#2563eb' });
  location.hash = '#/app/' + workspace.id;
  await waitFor('the workspace to open', async () => (await call('workspaces.current', 'query'))?.id === workspace.id);

  const title = 'Smoke check task';
  await call('tasks.create', 'mutation', { title });
  location.hash = '#/app/' + workspace.id + '/tasks';
  await waitFor('the tasks page to draw the task', () => document.body.innerText.includes(title));

  await document.fonts.ready;
  const fonts = [...new Set([...document.fonts]
    .filter((face) => face.status === 'loaded')
    .map((face) => face.family.replace(/["']/g, '')))];
  if (!fonts.includes('Inter')) throw new Error('Inter did not load: ' + JSON.stringify(fonts));
  return { workspaceId: workspace.id, fonts };
})()`;

export interface WorkspaceCheckResult {
  workspaceId: string;
  fonts: string[];
}
