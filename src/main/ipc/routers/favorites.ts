import { z } from 'zod';
import type { FavoritableEntityType, FavoritedEntity } from '@main/core/favorites/types';
import type { Page } from '@main/core/shared/pagination';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zPageFields } from '../zod';

// The favorites view. Favoriting itself is each entity router's setFavorite.

const ENTITY_TYPES = [
  'tasks',
  'projects',
  'notes',
  'events',
] as const satisfies readonly FavoritableEntityType[];

export const favoritesRouter = t.router({
  // summaries, most recently favorited first, of one entity type or all of them
  list: wsProcedure
    .input(z.object({ entityType: z.enum([...ENTITY_TYPES, 'all']).optional(), ...zPageFields }))
    .query(
      ({ ctx, input: { entityType, ...page } }): Page<FavoritedEntity> =>
        ctx.workspace.favorites.listFavorites({ entityType }, page),
    ),
});
