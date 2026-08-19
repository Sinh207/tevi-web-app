import 'server-only'

/**
 * The channel feature's **server-only** surface.
 *
 * Separate from `./index.ts` because everything reachable from here transitively imports
 * `'server-only'`, which throws on import from a client component. Keeping the two apart means a
 * mistake is a build error at the import site — the thing that is supposed to happen — instead of
 * a confusing failure inside `shared/lib/api/server-client.ts`.
 *
 * Only `app/(web)/(main)/[slug]/page.tsx` needs this: `generateMetadata` and the page body share one
 * `getChannelForRequest` call per render (it is wrapped in React `cache()`).
 *
 * Types are not re-exported here — they are already safe, so they stay on `./index.ts` and a file
 * needing both imports the type from there and the function from here.
 */

export { type ChannelFetch, getChannelForRequest } from './api/channel-server-api'
export { type ChannelFetchStatus, resolveChannelFetchStatus } from './lib/channel-seo'
