import path from 'node:path';
import fs from 'node:fs/promises';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from './types';
import { workspaceRegistrySchema } from './schema';
import { writeFileAtomicSync } from '../local/atomic';
import { isNotFound } from '../local/utils';
import { readManifest, type WorkspaceManifest } from './manifest';

export type WorkspaceRegistry = Record<WorkspaceId, WorkspaceInfo>;

// in the DevBrain folder
export const REGISTRY_FILE = 'workspaces.json';
// the last registry written, kept to restore one found missing or invalid at start
export const REGISTRY_BACKUP_FILE = 'workspaces.json.bak';
// a workspace directory holds its database here; one without it never finished being created
const WORKSPACE_DB_FILE = 'db.sqlite';
// what a workspace rebuilt from a directory without a manifest gets as its colour; also an imported
// folder without one (WorkspaceService.import)
export const RECOVERED_COLOR = '#808080';

// throws a SyntaxError for invalid JSON and a ZodError for JSON that is not a registry
export function parseRegistry(raw: string): WorkspaceRegistry {
  return workspaceRegistrySchema.parse(JSON.parse(raw)) as WorkspaceRegistry;
}

/**
 * Writes the registry atomically (see writeFileAtomicSync), then the same content to the backup. A
 * failed backup write does not fail the call: the registry is written, and the backup keeps the
 * previous registry, which is still a valid one to restore.
 */
export function writeRegistry(
  rootPath: string,
  registry: WorkspaceRegistry,
  report: (message: string, error: unknown) => void = console.error,
): void {
  const content = JSON.stringify(registry, null, 2);
  writeFileAtomicSync(path.join(rootPath, REGISTRY_FILE), content);
  try {
    writeFileAtomicSync(path.join(rootPath, REGISTRY_BACKUP_FILE), content);
  } catch (error) {
    report(`Could not update ${REGISTRY_BACKUP_FILE}:`, error);
  }
}

export type RegistryFileState =
  | { state: 'valid'; registry: WorkspaceRegistry }
  | { state: 'missing' }
  | { state: 'invalid'; reason: 'json' | 'schema' };

export async function readRegistryFile(filePath: string): Promise<RegistryFileState> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return { state: 'missing' };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'invalid', reason: 'json' };
  }
  const result = workspaceRegistrySchema.safeParse(parsed);
  if (!result.success) return { state: 'invalid', reason: 'schema' };
  return { state: 'valid', registry: result.data as WorkspaceRegistry };
}

// Where a missing or invalid registry can be rebuilt from: the backup, or the workspace
// directories. A missing registry with neither is not a DevBrain folder, so nothing is rebuilt.
export type RegistryRecoverySource = 'backup' | 'directories';

export interface RegistryInspection {
  registry: RegistryFileState;
  // null when the registry is valid, or cannot be recovered
  recoverableFrom: RegistryRecoverySource | null;
}

// Read-only: says whether the registry is valid and, if not, whether recoverRegistry can rebuild it
export async function inspectRegistry(rootPath: string): Promise<RegistryInspection> {
  const registry = await readRegistryFile(path.join(rootPath, REGISTRY_FILE));
  if (registry.state === 'valid') return { registry, recoverableFrom: null };
  const backup = await readRegistryFile(path.join(rootPath, REGISTRY_BACKUP_FILE));
  if (backup.state === 'valid') return { registry, recoverableFrom: 'backup' };
  // an invalid registry stood for some set of workspaces, all of which have a directory
  if (registry.state === 'invalid' || (await workspacesDirectoryExists(rootPath))) {
    return { registry, recoverableFrom: 'directories' };
  }
  return { registry, recoverableFrom: null };
}

async function workspacesDirectoryExists(rootPath: string): Promise<boolean> {
  try {
    return (await fs.stat(path.join(rootPath, 'workspaces'))).isDirectory();
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

// a registry entry for every workspace directory with a database, as far as the directory can say:
// its manifest's name and colour when it has one for the same id
async function scanWorkspaceDirectories(rootPath: string): Promise<WorkspaceInfo[]> {
  const workspacesPath = path.join(rootPath, 'workspaces');
  let names: string[];
  try {
    names = await fs.readdir(workspacesPath);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const infos: WorkspaceInfo[] = [];
  for (const name of names.filter((n) => n.startsWith('wsp_')).sort()) {
    const workspacePath = path.join(workspacesPath, name);
    let createdAt: number;
    try {
      const stat = await fs.stat(path.join(workspacePath, WORKSPACE_DB_FILE));
      createdAt = Math.round(stat.birthtimeMs || stat.mtimeMs);
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
    // a manifest that can't be read only loses the name, never the workspace
    const manifest: WorkspaceManifest | null = await readManifest(workspacePath).catch(() => null);
    const own = manifest !== null && manifest.id === name ? manifest : null;
    infos.push({
      id: name as WorkspaceId,
      name: own?.name ?? `Recovered workspace ${name}`,
      color: own?.color ?? RECOVERED_COLOR,
      path: workspacePath,
      createdAt: own?.createdAt ?? createdAt,
      lastOpenedAt: null,
    });
  }
  return infos;
}

/**
 * Restores a registry found missing or invalid at start: from the backup when it is valid, plus an
 * entry for each workspace directory the backup lacks (one created after the backup's last write).
 * Without a backup every entry comes from the directories, named by its manifest (manifest.ts), or
 * after its id when it has none. An invalid registry
 * is kept beside it as `workspaces.json.corrupt-<time>`, never deleted. Returns where the registry
 * came from, or null when it was valid or cannot be recovered (see inspectRegistry).
 */
export async function recoverRegistry(
  rootPath: string,
  log: (message: string) => void = console.warn,
): Promise<RegistryRecoverySource | null> {
  const { registry, recoverableFrom } = await inspectRegistry(rootPath);
  if (recoverableFrom === null) return null;

  const restored: WorkspaceRegistry = {} as WorkspaceRegistry;
  if (recoverableFrom === 'backup') {
    const backup = await readRegistryFile(path.join(rootPath, REGISTRY_BACKUP_FILE));
    if (backup.state === 'valid') Object.assign(restored, backup.registry);
  }
  const added: WorkspaceId[] = [];
  for (const info of await scanWorkspaceDirectories(rootPath)) {
    if (info.id in restored) continue;
    restored[info.id] = info;
    added.push(info.id);
  }

  let keptAs = '';
  if (registry.state === 'invalid') {
    const corruptName = `${REGISTRY_FILE}.corrupt-${Date.now()}`;
    // a copy, so a failed restore below leaves the registry as it was rather than missing
    await fs.copyFile(path.join(rootPath, REGISTRY_FILE), path.join(rootPath, corruptName));
    keptAs = ` The invalid file is kept as ${corruptName}.`;
  }
  writeRegistry(rootPath, restored);

  const source =
    recoverableFrom === 'backup'
      ? `${REGISTRY_BACKUP_FILE}${added.length > 0 ? ' and the workspace directories' : ''}`
      : 'the workspace directories';
  log(
    `${REGISTRY_FILE} was ${registry.state}; restored it from ${source}.${keptAs}` +
      (added.length > 0 ? ` Rebuilt entries: ${added.join(', ')}.` : ''),
  );
  return recoverableFrom;
}
