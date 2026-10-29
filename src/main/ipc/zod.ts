import { z } from 'zod';
import { isId, type EntityType, type Id } from '@common/ids';

// Input schemas routes share.

// an id of `entity`, checked by its prefix; the resolver gets it branded
export function zId<T extends EntityType>(entity: T) {
  return z.custom<Id<T>>((value) => isId(entity, value), `Not a ${entity} id`);
}

// core's PageOptions: `cursor` from the previous page's nextCursor, and how many to return (core
// caps it). A list with filters extends zPageFields, keeping `cursor` at the top of its input as
// infiniteQueryOptions needs. A null cursor, which tRPC's infinite queries can send for the first
// page, is the first page.
export const zPageFields = z.object({
  cursor: z
    .string()
    .nullish()
    .transform((cursor) => cursor ?? undefined),
  limit: z.number().int().positive().optional(),
});

export const zPage = zPageFields.optional();
