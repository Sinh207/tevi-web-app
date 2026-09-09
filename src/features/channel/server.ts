import 'server-only'

/**
 * The channel feature's **server-only** surface.
 *
 * Separate from `./index.ts` because everything reachable from here transitively imports
 * `'server-only'`, which throws on import from a client component. Keeping the two apart means a
 * mistake is a build error at the import site — the thing that is supposed to happen — instead of
 * a confusing failure inside `shared/lib/api/server-client.ts`.
 *
 * Three routes need it. `[slug]/page.tsx` is the main one — `generateMetadata` and the page body
 * share one `getChannelForRequest` call per render (it is wrapped in React `cache()`) — plus the
 * space's manifest route beside it and `add-home-screen/[slug]`, which read the same channel.
 *
 * Types are not re-exported here — they are already safe, so they stay on `./index.ts` and a file
 * needing both imports the type from there and the function from here. `ChannelManifestIcon` is
 * the one exception: it is the argument shape of a function only this barrel offers, so putting
 * the two behind different doors would be the surprise.
 */

export { type ChannelFetch, getChannelForRequest } from './api/channel-server-api'
/**
 * The space's web app manifest, and the slug parser the manifest route needs to read its own
 * URL.
 *
 * Neither module is server-*only* — both are pure and could sit on `./index.ts`, and
 * `parseChannelSlug` already does. They are re-exported here because their remaining consumer is
 * `[slug]/manifest.webmanifest/route.ts`, and a route handler reaching through the main barrel
 * would pull this feature's whole component tree — every `'use client'` module in it — into a
 * request that answers with 400 bytes of JSON. That is the same reason `skeleton.ts` and
 * `routes.ts` exist (see CLAUDE.md), so this is the sanctioned pattern rather than a fourth door.
 */
export {
    buildChannelManifest,
    CHANNEL_ICON_SIZES,
    type ChannelManifestIcon,
    channelManifestPath,
    shouldServeChannelManifest,
} from './lib/channel-manifest'
export { type ChannelFetchStatus, resolveChannelFetchStatus } from './lib/channel-seo'
export { parseChannelSlug, toChannelPath } from './lib/channel-slug'
