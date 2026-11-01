import path from 'node:path';
import fsSync from 'node:fs';
import { z } from 'zod';
import { isId, type WorkspaceId } from '@common/ids';
import { writeFileAtomicSync } from '../local/atomic';
import { isNotFound } from '../local/utils';
import type { WorkspaceInfo } from './types';

// What a workspace says about itself, kept in its folder: its id, name, colour and creation time.
// This is the only place they are stored, so they move with the folder to another computer
// (WorkspaceService.import), and a lost workspaces.json, which keeps only where each folder is
// (registry.ts), loses none of them.
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
 * The manifest in `folder`, or null when there is none or it is not one this app can read (invalid
 * JSON, another version). Throws other read errors, such as a folder that can't be read.
 */
export function readManifest(folder: string): WorkspaceManifest | null {
  let raw: string;
  try {
    raw = fsSync.readFileSync(path.join(folder, MANIFEST_FILE), 'utf8');
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
