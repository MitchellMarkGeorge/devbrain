// All valid dot-separated key paths in T (arrays are not traversed)
export type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends unknown[]
    ? K
    : T[K] extends Record<string, unknown>
      ? K | `${K}.${DotPaths<T[K]>}`
      : K;
}[keyof T & string];

// Value type at a given dot path P within T
export type DotPathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? DotPathValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;
