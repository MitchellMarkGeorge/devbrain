import { z } from 'zod';

// Pieces of the list pages' search params (tasks, notes, projects: each feature's `api/search.ts`).

/**
 * A filter param that holds several values, meaning "any of these", read as a list. One value
 * alone is a list of one, so a link or a saved last page from when the filter held a single value
 * (`?priority=high`) still works. A value the schema refuses is dropped on its own, and repeats
 * are; with none left the param is missing (undefined), never an empty list.
 */
export function multiParam<T extends z.ZodType>(schema: T) {
  return z
    .unknown()
    .transform((value): z.output<T>[] | undefined => {
      const items: unknown[] = Array.isArray(value) ? value : [value];
      const valid = items.flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
      return valid.length > 0 ? [...new Set(valid)] : undefined;
    })
    .optional();
}

/**
 * A multi-value filter's values as its param: with the last one unticked the param leaves the URL
 * (undefined), never an empty list.
 */
export function listParam<T>(values: readonly T[]): T[] | undefined {
  return values.length > 0 ? [...values] : undefined;
}
