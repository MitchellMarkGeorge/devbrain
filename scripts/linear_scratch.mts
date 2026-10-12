/**
 * Prints the normalised tasks and projects for a real Linear account, through the same task source
 * the sync engine uses, asked the question an initial sync asks. It checks the hand-written query shapes and fixtures against the live API
 * (feature 8's "done when").
 *
 * Usage:
 *   npx tsx --tsconfig ./tsconfig.node.json scripts/linear_scratch.mts
 *   npx tsx --tsconfig ./tsconfig.node.json scripts/linear_scratch.mts --record .linear-responses
 *
 * DEV_LINEAR_API_KEY is read from the environment or the repo's .env. The script exits without
 * making a request when it is unset. --record saves every raw response body to the given folder,
 * to replace the fixtures in src/main/core/tests/integrations/fixtures/linear/. Recorded bodies
 * hold real names and emails: scrub them before committing anything.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnvFile } from '@dotenvx/dotenvx';
import { createLinearProvider } from '@main/core/integrations/providers/linear';
import type { FetchFn } from '@main/core/integrations/providers/provider';
import { CLOSED_ISSUE_WINDOW_MS } from '@main/core/sync/constants';
import { toAuth } from '@main/core/integrations/auth';
import { AuthType } from '@main/core/integrations/types';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
loadEnvFile({ path: path.join(REPO_ROOT, '.env'), quiet: true });

const apiKey = process.env.DEV_LINEAR_API_KEY;
if (!apiKey) {
  console.log('DEV_LINEAR_API_KEY is not set; nothing to do.');
  process.exit(0);
}

const recordIndex = process.argv.indexOf('--record');
const recordDir = recordIndex === -1 ? null : path.resolve(process.argv[recordIndex + 1]);

let responseCount = 0;
const recordingFetch: FetchFn = async (input, init) => {
  const response = await fetch(input, init);
  if (recordDir) {
    const { query } = JSON.parse(String(init?.body));
    const name = /query\s+(\w+)/.exec(query)?.[1] ?? 'query';
    await fs.mkdir(recordDir, { recursive: true });
    const file = path.join(recordDir, `${String(++responseCount).padStart(2, '0')}-${name}.json`);
    const body = await response.clone().json();
    const headers = Object.fromEntries(
      [...response.headers.entries()].filter(([key]) =>
        key.toLowerCase().startsWith('x-ratelimit'),
      ),
    );
    await fs.writeFile(file, JSON.stringify({ status: response.status, headers, body }, null, 2));
  }
  return response;
};

const auth = toAuth({ type: AuthType.API_KEY, apiKey });
const linear = createLinearProvider({ fetch: recordingFetch });

const account = await linear.getAccount(auth);
console.log('Account:', account);

// open issues, and those closed within the window, as an initial sync asks
const closedSince = new Date(Date.now() - CLOSED_ISSUE_WINDOW_MS).toISOString();
let pageToken: string | null = null;
for (let pageNumber = 1; ; pageNumber++) {
  const page = await linear.tasks!.getAssignedTaskPage(auth, {
    closedSince,
    ...(pageToken !== null && { pageToken }),
  });
  console.log(`\nPage ${pageNumber}:`, {
    tasks: page.tasks.length,
    projects: page.projects.length,
    trashedIds: page.trashedIds,
    skipped: page.skipped,
    latestChange: page.latestChange,
    nextPageToken: page.nextPageToken,
  });
  console.dir({ tasks: page.tasks, projects: page.projects }, { depth: null });
  pageToken = page.nextPageToken;
  if (pageToken === null) {
    break;
  }
}

const assignedIds = await linear.tasks!.listOpenAssignedTaskIds(auth);
console.log(`\nOpen assigned issues: ${assignedIds.length}`);

// A deleted issue looks like an id that no longer resolves. Linear validates the id filter, so the
// stand-in must be a well-formed UUID; a malformed one fails the whole query.
const deletedId = randomUUID();
const resolved = await linear.tasks!.resolveTasks(auth, [...assignedIds.slice(0, 3), deletedId]);
console.log(`Resolution of three ids and one unknown id (${deletedId}):`, {
  found: resolved.found.map((task) => task.key),
  gone: resolved.gone,
  skipped: resolved.skipped,
});
