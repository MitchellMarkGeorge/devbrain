// What integration code needs from fetch: a URL string and an init. Kept this narrow so Electron's
// net.fetch (which takes no URL object) fits, as do Node's global fetch and the fakes in tests.
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
