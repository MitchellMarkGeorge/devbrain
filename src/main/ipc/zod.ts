import { z } from 'zod';
import { isId, type EntityType, type Id } from '@common/ids';

// Input schemas routes share.

// an id of `entity`, checked by its prefix; the resolver gets it branded
export function zId<T extends EntityType>(entity: T) {
  return z.custom<Id<T>>((value) => isId(entity, value), `Not a ${entity} id`);
}

// core's PageOptions: `cursor` from the previous page's nextCursor, and how many to return (core
// caps it)
export const zPage = z
  .object({
    cursor: z.string().optional(),
    limit: z.number().int().positive().optional(),
  })
  .optional();
