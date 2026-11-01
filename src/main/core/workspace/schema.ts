import { z } from 'zod';

// What workspaces.json keeps about a workspace: only what belongs to this computer. Its name,
// colour and creation time belong to the workspace and live in its folder's manifest
// (manifest.ts), so they move with it.
export const registryEntrySchema = z.object({
  id: z.string().startsWith('wsp_'),
  path: z.string(),
  lastOpenedAt: z.number().nullable(),
  // Written by DevBrain before manifests. DevBrain.open moves them into the manifest and drops them
  // (moveDetailsToManifests); until then, and for a workspace whose folder is gone, they stand in
  // for a missing manifest.
  name: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.number().optional(),
});

export const workspaceRegistrySchema = z.record(z.string().startsWith('wsp_'), registryEntrySchema);
