import { z } from 'zod';
import { isId, type EntityType, type Id } from '@common/ids';

// Pieces of the routes' search schemas (src/renderer/pages/*/search.ts). Every field is
// `.optional().catch(undefined)`: a bad value (an old link, a typo, a removed option) drops that
// field back to its default instead of failing the page, and a missing one means "the setting's
// default", read at render, so a default is never written into the URL.

/** An optional search param that falls back to undefined on a bad value. */
export function optional<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

/** An id of `entity`, checked by its prefix as main's `zId` checks it. */
export function zPrefixedId<T extends EntityType>(entity: T) {
  return z.custom<Id<T>>((value) => isId(entity, value), `Not a ${entity} id`);
}

export const sortDirection = z.enum(['asc', 'desc']);
