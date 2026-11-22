import { useCallback, useState } from 'react';

/** A `Map` held in state, with the changes a component makes to it (`useMap`). */
export interface MapState<K, V> {
  /** the current entries; a new `Map` after each change that changes something, else the same */
  map: ReadonlyMap<K, V>;
  /** sets `key` to `value` */
  set: (key: K, value: V) => void;
  /** removes `key` */
  remove: (key: K) => void;
  /** removes every entry */
  clear: () => void;
  /** keeps only the entries `keep` returns true for, removing the rest */
  retain: (keep: (key: K, value: V) => boolean) => void;
}

/**
 * A `Map` in state, changed through `set`, `remove`, `clear` and `retain` rather than by copying
 * it by hand at each `setState`. Each change copies the map, so React sees a new one, and a
 * change that changes nothing (setting the value a key already has, removing a missing key,
 * `retain` keeping everything) keeps the same map, so nothing re-renders for it.
 *
 * The functions stay the same between renders, so they can go in a hook's dependencies. Like any
 * `setState`, one called while rendering (to follow a prop, as `retain` is used to drop the keys
 * no longer listed) must sit behind a check that it is needed, or the render repeats.
 */
export function useMap<K, V>(initialEntries?: Iterable<readonly [K, V]>): MapState<K, V> {
  const [map, setMap] = useState<ReadonlyMap<K, V>>(() => new Map(initialEntries));

  const set = useCallback(
    (key: K, value: V) =>
      setMap((current) =>
        current.has(key) && Object.is(current.get(key), value)
          ? current
          : new Map(current).set(key, value),
      ),
    [],
  );

  const remove = useCallback(
    (key: K) =>
      setMap((current) => {
        if (!current.has(key)) return current;
        const next = new Map(current);
        next.delete(key);
        return next;
      }),
    [],
  );

  const clear = useCallback(
    () => setMap((current) => (current.size === 0 ? current : new Map())),
    [],
  );

  const retain = useCallback(
    (keep: (key: K, value: V) => boolean) =>
      setMap((current) => {
        const next = new Map([...current].filter(([key, value]) => keep(key, value)));
        return next.size === current.size ? current : next;
      }),
    [],
  );

  return { map, set, remove, clear, retain };
}
