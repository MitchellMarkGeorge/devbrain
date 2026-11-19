import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { scaffoldDevBrain } from '@main/core/local/scaffold';
import { REPO_ROOT } from './paths';

// A DevBrain folder for one test: settings.json, workspaces.json and workspaces/<id>/, in the
// system's temporary directory, never a developer's own (.dev, ~/.devbrain).

/** A new, empty directory for a test's DevBrain folder (and anything else it writes). */
export function makeTempDir(prefix = 'devbrain-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Makes `root` a DevBrain folder with no workspace, as the packaged app does on its first run
 * (core's own scaffoldDevBrain): the app opens on the Welcome screen. The built app runs
 * unpackaged, and an unpackaged app doesn't create a missing folder, so the harness does.
 */
export async function scaffoldFolder(root: string): Promise<void> {
  await scaffoldDevBrain(root);
}

export interface SeedOptions {
  name?: string;
  // seed:dev's --seed: the shape of the dataset
  seed?: number;
  // 'showcase': the small hand-written workspace the website's screenshots show
  // (scripts/setup_showcase_workspace.mts) instead of seed:dev's generated one
  dataset?: 'dev' | 'showcase';
}

/**
 * Fills `root` with one workspace from `npm run seed:dev`'s code (scripts/setup_dev_workspace.mts):
 * projects, tasks with subtasks, notes and events made through core's services. Never connects
 * Linear: DEV_LINEAR_API_KEY is set empty, which the repository's .env doesn't override.
 */
export async function seedDevFolder(root: string, options: SeedOptions = {}): Promise<void> {
  const args = [
    path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'),
    'scripts/run-with-vite.mts',
    ...(options.dataset === 'showcase'
      ? ['scripts/setup_showcase_workspace.mts']
      : ['scripts/setup_dev_workspace.mts', `--seed=${options.seed ?? 42}`]),
    `--path=${root}`,
    `--name=${options.name ?? 'Seeded'}`,
  ];
  const output: string[] = [];
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, DEV_LINEAR_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) throw new Error(`seed:dev failed (exit ${code}):\n${output.join('')}`);
}

// --- Reading the app's state back -----------------------------------------------------------

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export interface SettingsFileJson {
  settings: Record<string, unknown> & {
    general: { timeFormat: string; openToLastPage: boolean };
    calendar: { hideWeekends: boolean };
  };
  state: { lastWorkspaceId: string | null };
}

export interface ManifestJson {
  id: string;
  name: string;
  color: string;
  lastPage?: string;
}

export interface RegistryEntryJson {
  id: string;
  path: string;
  lastOpenedAt: number | null;
}

/** What one DevBrain folder holds, read from its files. Read after the app has quit. */
export class FolderState {
  constructor(readonly root: string) {}

  settings(): SettingsFileJson {
    return readJson(path.join(this.root, 'settings.json'));
  }

  registry(): Record<string, RegistryEntryJson> {
    return readJson(path.join(this.root, 'workspaces.json'));
  }

  workspaceIds(): string[] {
    return Object.keys(this.registry());
  }

  workspacePath(id: string): string {
    const entry = this.registry()[id];
    if (entry === undefined) throw new Error(`No workspace ${id} in ${this.root}`);
    return entry.path;
  }

  manifest(id: string): ManifestJson {
    return readJson(path.join(this.workspacePath(id), 'workspace.json'));
  }

  /** The id of the workspace with this name, from the manifests. */
  workspaceNamed(name: string): string {
    const id = this.workspaceIds().find((wsId) => this.manifest(wsId).name === name);
    if (id === undefined) throw new Error(`No workspace named ${name} in ${this.root}`);
    return id;
  }

  /** Runs a query on a workspace's database, read-only. */
  query<T = Record<string, unknown>>(id: string, sql: string, ...params: SQLInputValue[]): T[] {
    return queryDatabase<T>(path.join(this.workspacePath(id), 'db.sqlite'), sql, ...params);
  }
}

export function queryDatabase<T = Record<string, unknown>>(
  dbPath: string,
  sql: string,
  ...params: SQLInputValue[]
): T[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}
