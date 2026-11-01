import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { z } from 'zod';
import { isId, type WorkspaceId } from '@common/ids';
import { writeFileAtomicSync } from '../local/atomic';
import { isNotFound } from '../local/utils';
import type { WorkspaceInfo } from './types';

// The workspace's own record of what the registry says about it, kept in its folder so that a
// folder copied to another computer still says what it was called (WorkspaceService.import), and a
// lost registry can be rebuilt with names and colours (recoverRegistry). The registry stays the
// source of truth on this computer; this is a copy of it.
export const MANIFEST_FILE = 'workspace.json';

// bumped only for a change an older DevBrain can't read; it then ignores the manifest
const MANIFEST_VERSION = 1;

const manifestSchema = z.object({
  version: z.literal(MANIFEST_VERSION),
  id: z.string().refine((value) => isId('workspace', value)),
  name: z.string().min(1),
  color: z.string(),
  createdAt: z.number(),
});

export type WorkspaceManifest = Pick<WorkspaceInfo, 'id' | 'name' | 'color' | 'createdAt'>;

function toManifestJson(info: WorkspaceManifest): string {
  const manifest: z.infer<typeof manifestSchema> = {
    version: MANIFEST_VERSION,
    id: info.id,
    name: info.name,
    color: info.color,
    createdAt: info.createdAt,
  };
  return JSON.stringify(manifest, null, 2);
}

// Writes the manifest into `folder` atomically. Never creates the folder: one that is gone (a
// workspace whose data is missing) throws ENOENT rather than coming back empty. Throws what the
// write throws.
export function writeManifest(folder: string, info: WorkspaceManifest): void {
  if (!fsSync.statSync(folder).isDirectory()) {
    throw Object.assign(new Error(`Not a folder: ${folder}`), { code: 'ENOTDIR' });
  }
  writeFileAtomicSync(path.join(folder, MANIFEST_FILE), toManifestJson(info));
}

/**
 * Writes the manifest only when the one in `folder` is missing or says something else, so opening
 * a workspace doesn't touch a file that a sync tool would then copy around for nothing.
 */
export async function ensureManifest(folder: string, info: WorkspaceManifest): Promise<void> {
  const current = await readManifest(folder);
  if (
    current !== null &&
    current.id === info.id &&
    current.name === info.name &&
    current.color === info.color &&
    current.createdAt === info.createdAt
  ) {
    return;
  }
  writeManifest(folder, info);
}

/**
 * The manifest in `folder`, or null when there is none or it is not one this app can read (invalid
 * JSON, another version). Throws other read errors, such as a folder that can't be read.
 */
export async function readManifest(folder: string): Promise<WorkspaceManifest | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(folder, MANIFEST_FILE), 'utf8');
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) return null;
  const { id, name, color, createdAt } = parsed.data;
  return { id: id as WorkspaceId, name, color, createdAt };
}
