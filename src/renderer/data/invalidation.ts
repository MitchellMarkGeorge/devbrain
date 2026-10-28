import type { QueryClient } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';

// A procedure path, or a prefix of one: ['tasks'] covers every procedure of the tasks router.
export type Path = readonly string[];

// The queries each kind of row can appear in, by router. A view that shows a row of another router
// (a project's task counts, a favorite, a search hit) is listed under that row's entity too.
export const affects: Record<ChangedEntity, Path[]> = {
  task: [['tasks'], ['projects'], ['favorites'], ['search'], ['archive']],
  note: [['notes'], ['favorites'], ['search'], ['archive']],
  project: [['projects'], ['tasks'], ['favorites'], ['search'], ['archive']],
  event: [['events'], ['favorites'], ['search']],
  calendar: [['calendars'], ['events']],
  integration: [['integrations'], ['sync']],
  externalSource: [['integrations'], ['sources'], ['sync']],
};

export function isPrefix(prefix: Path, path: Path): boolean {
  return prefix.length <= path.length && prefix.every((part, i) => part === path[i]);
}

// The paths to invalidate for `entities`: merged, without duplicates, and without a path another
// one already covers.
export function compile(entities: Iterable<ChangedEntity>): Path[] {
  const paths = new Map<string, Path>();
  for (const entity of entities) {
    for (const path of affects[entity]) paths.set(path.join('.'), path);
  }
  const all = [...paths.values()];
  return all.filter((path) => !all.some((other) => other !== path && isPrefix(other, path)));
}

// Marks every query under the paths `entities` affect as stale, in one pass over the cache, and
// resolves once the mounted ones have refetched. tRPC's query keys start with the procedure's path
// (`[['tasks', 'get'], { input, type }]`); a key that doesn't is not tRPC's, and is left alone.
export function invalidateFor(
  queryClient: QueryClient,
  entities: Iterable<ChangedEntity>,
): Promise<void> {
  const paths = compile(entities);
  if (paths.length === 0) return Promise.resolve();
  return queryClient.invalidateQueries({
    predicate: ({ queryKey: [path] }) =>
      Array.isArray(path) && paths.some((prefix) => isPrefix(prefix, path)),
  });
}
