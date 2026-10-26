import { z } from 'zod';

// A colour as #rrggbb, the only form safe to put in a style. Provider colours are free strings,
// so the renderer parses every one with this and falls back to a theme colour when it fails
// (docs/security/untrusted-content.md).
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Not a #rrggbb colour');
