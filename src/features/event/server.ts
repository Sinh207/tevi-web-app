import 'server-only'

/**
 * The event feature's **server-only** surface.
 *
 * Separate from `./index.ts` because everything reachable from here transitively imports
 * `'server-only'`, which throws when a client component imports it. Keeping the two apart makes a
 * mistake a build error at the import site — the thing that is supposed to happen — rather than a
 * confusing failure inside `shared/lib/api/server-client.ts`.
 *
 * One route needs it: `[slug]/event/[code]/page.tsx`, where `generateMetadata` and the page body
 * share **one** upstream request per render (`getEventForRequest` is wrapped in React `cache()`).
 *
 * The SEO builders are pure and could sit on `./index.ts`. They are here because their only consumer
 * is that `generateMetadata`, and a metadata function reaching through the main barrel would pull
 * this feature's whole component tree — every `'use client'` module in it, plus
 * `@features/membership` and `@features/share` behind them — into a function that returns a
 * `<head>`. Same reason `skeleton.ts` and `routes.ts` exist, so this is the sanctioned pattern
 * rather than a fifth door.
 *
 * Types are not re-exported: they are already safe, so they stay on `./index.ts`, and a file needing
 * both takes the type from there and the function from here.
 */

export { type EventFetch, getEventForRequest } from './api/event-server-api'
export {
    buildEventDescription,
    buildEventTitle,
    collapseWhitespace,
    eventCanonicalPath,
    eventJsonLd,
    formatEventDateForSeo,
    mayDescribeEventForCrawler,
    truncateForSeo,
} from './lib/event-seo'
/** The studio's pre-blurred ground — server-only because the image proxy's base is a server setting. */
export { studioBackdropUrl } from './lib/studio-backdrop'
