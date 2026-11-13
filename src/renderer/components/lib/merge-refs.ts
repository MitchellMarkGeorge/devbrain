import type { Ref, RefCallback } from 'react';

/** One ref callback setting every ref given (object or callback); memoize it on the refs. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value);
      else if (ref) (ref as { current: T | null }).current = value;
    }
  };
}
