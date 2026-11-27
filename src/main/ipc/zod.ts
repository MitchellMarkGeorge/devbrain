import { z } from 'zod';
import { isId, type EntityType, type Id } from '@common/ids';

// Input schemas routes share.

// an id of `entity`, checked by its prefix; the resolver gets it branded
export function zId<T extends EntityType>(entity: T) {
  return z.custom<Id<T>>((value) => isId(entity, value), `Not a ${entity} id`);
}

// core's PageOptions: `cursor` from the previous page's nextCursor, and how many to return (core
// caps it). A list with filters spreads these next to them, keeping `cursor` at the top of its input
// as infiniteQueryOptions expects. A null cursor, which tRPC's infinite queries can send for the
// first page, is the first page.
export const zPageFields = {
  cursor: z
    .string()
    .nullish()
    .transform((cursor) => cursor ?? undefined),
  limit: z.number().int().positive().optional(),
};

export const zPage = z.object(zPageFields).optional();

// core's OneOrMany: a filter's one value, or a list of them meaning "any of these". An empty list
// is refused: it would ask for nothing.
export function zOneOrMany<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.array(schema).min(1)]);
}

// every dot path under `prefix` into `schema`, each with its part of the schema: 'settings.calendar'
// with the calendar group's schema, 'settings.calendar.defaultView' with the view's
function pathSchemas(schema: z.ZodObject, prefix: string): [string, z.ZodType][] {
  return Object.entries(schema.shape).flatMap(([key, part]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const entry: [string, z.ZodType] = [path, part];
    return part instanceof z.ZodObject ? [entry, ...pathSchemas(part, path)] : [entry];
  });
}

/**
 * The input of a route that writes one value by its dot path (`settings.set`,
 * `workspace.setState`): `{ path, value }`, where the path picks the part of `schema` the value is
 * checked against, and a path outside it is refused. `Update` is the union of each path with its
 * value's type, which the caller builds from the schema's type.
 */
export function zPathUpdate<Update>(schema: z.ZodObject, prefix = ''): z.ZodType<Update, Update> {
  const [first, ...rest] = pathSchemas(schema, prefix).map(([path, value]) =>
    z.object({ path: z.literal(path), value }),
  );
  return z.discriminatedUnion('path', [first, ...rest]) as unknown as z.ZodType<Update, Update>;
}
