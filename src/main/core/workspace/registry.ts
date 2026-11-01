import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import type { z } from 'zod';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from './types';
import { workspaceRegistrySchema, type registryEntrySchema } from './schema';
import { writeFileAtomicSync } from '../local/atomic';
import { isNotFound } from '../local/utils';
import { readManifest, writeManifest, type WorkspaceManifest } from './manifest';

// What workspaces.json keeps about one workspace: where its folder is and when it was last opened
// here. Its name, colour and creation time are in the folder's manifest (manifest.ts).
export type RegistryEntry = z.infer<typeof registryEntrySchema> & { id: WorkspaceId };
export type WorkspaceRegistry = Record<WorkspaceId, RegistryEntry>;

// in the DevBrain folder
export const REGISTRY_FILE = 'workspaces.json';
// the last registry written, kept to restore one found missing or invalid at start
export const REGISTRY_BACKUP_FILE = 'workspaces.json.bak';
// a workspace directory holds its database here; one without it never finished being created
const WORKSPACE_DB_FILE = 'db.sqlite';
// the colour of a workspace whose folder has no manifest, and of an imported folder without one
export const RECOVERED_COLOR = '#808080';

// the name of a workspace whose folder has no manifest
export function recoveredName(id: WorkspaceId): string {
  return `Recovered workspace ${id}`;
}

/**
 * A registry entry with what its folder's manifest says: the WorkspaceInfo the rest of the app
 * sees. A folder without a manifest for this id (gone, unreadable, never written) falls back to
 * the details an older workspaces.json kept, then to a recovered name, grey, and the database's
 * creation time. Never throws: a workspace whose folder is gone still lists, and fails on open.
 */
export function describeWorkspace(entry: RegistryEntry): WorkspaceInfo {
  let manifest: WorkspaceManifest | null = null;
  try {
    manifest = readManifest(entry.path);
  } catch {
    // an unreadable folder lists with what the entry has
  }
  const own = manifest?.id === entry.id ? manifest : null;
  return {
    id: entry.id,
    name: own?.name ?? entry.name ?? recoveredName(entry.id),
    color: own?.color ?? entry.color ?? RECOVERED_COLOR,
    path: entry.path,
    createdAt: own?.createdAt ?? entry.createdAt ?? databaseCreatedAt(entry.path),
    lastOpenedAt: entry.lastOpenedAt,
  };
}

// when the folder's database was made, as near as the file system can say; 0 when it can't
function databaseCreatedAt(folder: string): number {
  try {
    const stat = fsSync.statSync(path.join(folder, WORKSPACE_DB_FILE));
    return Math.round(stat.birthtimeMs || stat.mtimeMs);
  } catch {
    return 0;
  }
}

// the entry workspaces.json keeps for a workspace: only what belongs to this computer
export function registryEntry(
  info: Pick<WorkspaceInfo, 'id' | 'path' | 'lastOpenedAt'>,
): RegistryEntry {
  return { id: info.id, path: info.path, lastOpenedAt: info.lastOpenedAt };
}

/**
 * Moves the name, colour and creation time an older workspaces.json kept for each workspace into
 * its folder's manifest, then drops them from the registry, so each is stored once. A folder that
 * already has a manifest keeps it (it wins over the registry). An entry whose folder is gone, or
 * refuses the write (reported), keeps its details, so nothing is lost; the next start tries again. Run at
 * start (DevBrain.open), after recoverRegistry. Returns the ids moved.
 */
export function moveDetailsToManifests(
  rootPath: string,
  report: (message: string, error: unknown) => void = console.error,
): WorkspaceId[] {
  let registry: WorkspaceRegistry;
  try {
    registry = parseRegistry(fsSync.readFileSync(path.join(rootPath, REGISTRY_FILE), 'utf8'));
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const moved: WorkspaceId[] = [];
  for (const entry of Object.values(registry)) {
    if (entry.name === undefined && entry.color === undefined && entry.createdAt === undefined) {
      continue;
    }
    try {
      const existing = readManifest(entry.path);
      if (existing?.id !== entry.id) {
        const { name, color, createdAt } = describeWorkspace(entry);
        writeManifest(entry.path, { id: entry.id, name, color, createdAt });
      }
    } catch (error) {
      // a folder that is gone keeps its details here quietly: the workspace fails on open anyway
      if (!isNotFound(error))
        report(`Could not move the details of ${entry.id} into its folder:`, error);
      continue;
    }
    registry[entry.id] = registryEntry(entry);
    moved.push(entry.id);
  }
  if (moved.length > 0) writeRegistry(rootPath, registry, report);
  return moved;
}

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

// a registry entry for every workspace directory with a database; its name and colour come from
// its manifest (describeWorkspace)
async function scanWorkspaceDirectories(rootPath: string): Promise<RegistryEntry[]> {
  const workspacesPath = path.join(rootPath, 'workspaces');
  let names: string[];
  try {
    names = await fs.readdir(workspacesPath);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const entries: RegistryEntry[] = [];
  for (const name of names.filter((n) => n.startsWith('wsp_')).sort()) {
    const workspacePath = path.join(workspacesPath, name);
    try {
      await fs.stat(path.join(workspacePath, WORKSPACE_DB_FILE));
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
    entries.push(
      registryEntry({ id: name as WorkspaceId, path: workspacePath, lastOpenedAt: null }),
    );
  }
  return entries;
}

/**
 * Restores a registry found missing or invalid at start: from the backup when it is valid, plus an
 * entry for each workspace directory the backup lacks (one created after the backup's last write).
 * Without a backup every entry comes from the directories; either way names and colours are in the
 * folders' manifests (manifest.ts), so none are lost. An invalid registry is kept beside it as `workspaces.json.corrupt-<time>`, never deleted. Returns where the registry
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
  for (const entry of await scanWorkspaceDirectories(rootPath)) {
    if (entry.id in restored) continue;
    restored[entry.id] = entry;
    added.push(entry.id);
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
