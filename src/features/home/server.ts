import 'server-only'

/**
 * The home feature's **server-only** surface — what `app/` reads while rendering `/`. Kept out of
 * `index.ts` for the reason `features/channel/server.ts` gives: everything here imports
 * `'server-only'`, so a client component reaching it is a build error at the import site.
 */
export { getPublicFeedForRequest } from './api/home-server-api'
