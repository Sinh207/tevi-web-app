import 'server-only'

/**
 * The post feature's **server-only** surface.
 *
 * Separate from `./index.ts` for the reason `features/channel/server.ts` states: everything
 * reachable from here transitively imports `'server-only'`, which throws when a client component
 * imports it. Two doors means a mistake is a build error at the import site rather than a
 * confusing failure inside `shared/lib/api/server-client.ts`.
 *
 * One route needs it — `[slug]/post/[code]/page.tsx`, whose `generateMetadata` and body share a
 * single `getPostForRequest` call per render.
 *
 * The SEO helpers are pure and stay on `./index.ts`; only the fetch is server-only.
 */

export { getPostForRequest, type PostFetch } from './api/post-server-api'
