import { z } from 'zod';

export const workspaceInfoSchema = z.object({
  id: z.string().startsWith('wsp_'),
  name: z.string(),
  color: z.string().nullable(),
  path: z.string(),
  createdAt: z.number(),
  lastOpenedAt: z.number().nullable(),
});

export const workspaceRegistrySchema = z.record(z.string().startsWith('wsp_'), workspaceInfoSchema);
