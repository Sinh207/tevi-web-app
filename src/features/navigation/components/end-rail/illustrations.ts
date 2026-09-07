/**
 * The two pieces of corner art the rail's own banners carry — Brand's own art
 * (`constants/images.js` → `IMAGES_STATIC.campaign.{login,premium}`), committed rather than fetched.
 *
 * Committed because **no static art comes from the CDN any more** (`docs/STATIC_ASSETS.md`), and this
 * pair is the clearest case for the rule even though neither was ever heavy: the rail renders beside
 * every page, so these two are the app's most-requested images, and they were two cross-origin
 * requests on a third party's uptime before anything had drawn.
 *
 * Different treatments, because the sources differ:
 * - `login` is a **real vector** (5.8 KB, 17 paths), so it is copied byte for byte. Rasterising it
 *   would cost crispness to save nothing.
 * - `premium` is a 190×188 PNG re-encoded to 180×180 WebP — square because the browser already
 *   squashed the source, drawn at half those pixels so it stays crisp at 2× DPR.
 *
 * They live here rather than inline in the two components for the same reason every other feature
 * keeps an `illustrations.ts`. Sizes are legacy's, so `next/image` reserves the right box and nothing
 * jumps when the art lands — **except** legacy's `login` box, which was a flat 70 square for a 72×74
 * vector. `img { height: auto }` (Tailwind preflight) means the browser draws the real ratio anyway,
 * so the box was simply 2px shorter than the picture that landed in it. It is declared 72×74 here.
 */

export const RAIL_ART = {
    login: { src: '/illustrations/campaign/login.svg', width: 72, height: 74 },
    premium: { src: '/illustrations/campaign/premium.webp', width: 90, height: 90 },
} as const
