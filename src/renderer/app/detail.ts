import { notFound } from '@tanstack/react-router';
import { isId, type EntityType, type Id } from '@common/ids';
import { ipcErrorCode } from '../ipc/errors';

/** A detail page's id, or the route's not-found when it isn't one of `entity`'s ids. */
export function idOrNotFound<T extends EntityType>(entity: T, value: string): Id<T> {
  if (!isId(entity, value)) throw notFound();
  return value;
}

/**
 * Primes the cache with a detail page's entity, so the page renders with it on the first frame,
 * and turns core's `not_found` (deleted, or never there) into the route's not-found.
 */
export async function loadOrNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (ipcErrorCode(error) === 'not_found') throw notFound();
    throw error;
  }
}
