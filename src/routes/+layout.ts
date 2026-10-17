// The stored marksheet document lives in localStorage, so every route renders
// on the client: the synchronous read is the first paint, with no loading
// skeleton and no flash of a surface the stored state does not allow.
export const ssr = false;
