import path from 'node:path';
import fsSync from 'node:fs';
import { z } from 'zod';
import { isId, type WorkspaceId } from '@common/ids';
import { writeFileAtomicSync } from '../local/atomic';
import { isNotFound } from '../local/utils';
import {
  defaultWorkspaceSettings,
  lastPageSchema,
  workspaceSettingsSchema,
  type WorkspaceInfo,
  type WorkspaceSettings,
} from '@common/types';
import { withDefaults } from '../settings/defaults';

// What a workspace says about itself, kept in its folder: its id, name, colour, creation time, the
// page the app was on when it last closed, and its own `settings` (such as whether the calendar
// shows tasks). One file for everything that is the workspace's own, as the
// DevBrain folder's settings.json is for what every workspace shares.
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
  // added after version 1, so optional; an older DevBrain drops it when it rewrites the manifest.
  // A bad value is dropped alone, never the manifest with the name and colour
  lastPage: lastPageSchema.nullable().optional().catch(null),
  // added after version 1 too, and read by `settingsOf`
  settings: z.unknown().optional(),
});

export type WorkspaceManifest = Pick<
  WorkspaceInfo,
  'id' | 'name' | 'color' | 'createdAt' | 'lastPage' | 'settings'
>;

/**
 * The settings a manifest holds: every value it lacks is the default (a manifest written before the
 * value was added), and one with a wrong value is the defaults whole, never the manifest with the
 * name and colour.
 */
function settingsOf(stored: unknown): WorkspaceSettings {
  const defaults = defaultWorkspaceSettings();
  const parsed = workspaceSettingsSchema.safeParse(withDefaults(stored, defaults));
  return parsed.success ? parsed.data : defaults;
}

function toManifestJson(info: WorkspaceManifest): string {
  const manifest: z.infer<typeof manifestSchema> = {
    version: MANIFEST_VERSION,
    id: info.id,
    name: info.name,
    color: info.color,
    createdAt: info.createdAt,
    lastPage: info.lastPage,
    settings: info.settings,
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
  const { id, name, color, createdAt, lastPage, settings } = parsed.data;
  return {
    id: id as WorkspaceId,
    name,
    color,
    createdAt,
    lastPage: lastPage ?? null,
    settings: settingsOf(settings),
  };
}
